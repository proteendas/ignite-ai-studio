/**
 * Integration check for the Postgres + pgvector data layer.
 *
 * Exercises the paths a typecheck cannot: real SQL against a real server,
 * the schema bootstrap, the pgvector round-trip, transaction semantics, and
 * the concurrency guarantees the token store and rate limiter depend on.
 *
 * Usage:  DATABASE_URL=postgres://... node scripts/verify-db.mjs
 */
import { randomUUID, createHash } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 10 });
let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}\n      ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// The DDL is imported by reading the compiled schema module's exported string.
// Reading it from source keeps this script in step with the app automatically.
const schemaSrc = await import('node:fs').then((fs) =>
  fs.readFileSync('lib/db/sql/schema.ts', 'utf8')
);
const SCHEMA_SQL = schemaSrc.match(/export const SCHEMA_SQL = `([\s\S]*?)`;/)[1];
const PGVECTOR_SQL = schemaSrc
  .match(/export function pgvectorSchemaSql\(dimensions: number\): string \{\s*return `([\s\S]*?)`;/)[1]
  .replace('${dimensions}', '3');

console.log('\nSchema bootstrap');
await check('main schema applies', async () => {
  await pool.query(SCHEMA_SQL);
});
await check('main schema is idempotent (re-runs cleanly)', async () => {
  await pool.query(SCHEMA_SQL);
});
await check('pgvector extension + table apply', async () => {
  await pool.query(PGVECTOR_SQL);
});
await check('advisory lock round-trips', async () => {
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock($1)', [4113507001]);
    await c.query('SELECT pg_advisory_unlock($1)', [4113507001]);
  } finally {
    c.release();
  }
});
await check('all expected tables exist', async () => {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
  );
  const names = new Set(rows.map((r) => r.table_name));
  for (const t of [
    'users', 'documents', 'chat_threads', 'chat_messages', 'thread_summaries',
    'user_preferences', 'user_api_keys', 'generated_content', 'usage_events',
    'request_logs', 'error_logs', 'activity_events', 'agent_actions',
    'user_connections', 'embedding_cache', 'auth_tokens', 'rate_limits',
    'products', 'orders', 'document_chunks',
  ]) {
    assert(names.has(t), `missing table: ${t}`);
  }
});

console.log('\nUsers and types');
const userId = randomUUID();
await check('insert + read back a user', async () => {
  const { rows } = await pool.query(
    `INSERT INTO users (id, email, password_hash, name, provider)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [userId, `test-${userId}@example.com`, 'hash', 'Test', 'credentials']
  );
  assert(rows.length === 1, 'no row returned');
  assert(rows[0].created_at instanceof Date, 'created_at should hydrate as a Date');
});
await check('boolean columns hydrate as real booleans', async () => {
  const tid = randomUUID();
  await pool.query('INSERT INTO chat_threads (id, owner_id, title) VALUES ($1,$2,$3)', [
    tid, userId, 'T',
  ]);
  const { rows } = await pool.query('SELECT pinned FROM chat_threads WHERE id=$1', [tid]);
  assert(rows[0].pinned === false, `expected false, got ${JSON.stringify(rows[0].pinned)}`);
});
await check('SUM() returns a string (BIGINT) — must be coerced', async () => {
  await pool.query(
    `INSERT INTO usage_events (id, owner_id, provider, kind, prompt_tokens)
     VALUES ($1,$2,'groq','chat',100)`,
    [randomUUID(), userId]
  );
  const { rows } = await pool.query(
    'SELECT COALESCE(SUM(prompt_tokens),0) AS p FROM usage_events WHERE owner_id=$1',
    [userId]
  );
  assert(typeof rows[0].p === 'string', `expected string, got ${typeof rows[0].p}`);
  assert(Number(rows[0].p) === 100, 'sum should be 100');
});

console.log('\nAuth tokens (single-use under concurrency)');
const tokenHash = createHash('sha256').update(randomUUID()).digest('hex');
await check('token insert with ISO expiry', async () => {
  await pool.query(
    `INSERT INTO auth_tokens (token_hash, owner_id, kind, expires_at) VALUES ($1,$2,$3,$4)`,
    [tokenHash, userId, 'password_reset', new Date(Date.now() + 3600_000).toISOString()]
  );
});
await check('concurrent redemption yields exactly one winner', async () => {
  // This is the guarantee SELECT ... FOR UPDATE buys. Without the row lock,
  // both transactions read the unconsumed row and both succeed.
  const claim = async () => {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const { rows } = await c.query(
        `SELECT owner_id FROM auth_tokens
         WHERE token_hash=$1 AND kind=$2 AND consumed_at IS NULL AND expires_at > now()
         FOR UPDATE`,
        [tokenHash, 'password_reset']
      );
      if (rows.length === 0) { await c.query('COMMIT'); return null; }
      await c.query('UPDATE auth_tokens SET consumed_at=now() WHERE token_hash=$1', [tokenHash]);
      await c.query('COMMIT');
      return rows[0].owner_id;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  };
  const results = await Promise.all([claim(), claim(), claim(), claim(), claim()]);
  const winners = results.filter(Boolean);
  assert(winners.length === 1, `expected exactly 1 winner, got ${winners.length}`);
});
await check('expired tokens are not redeemable', async () => {
  const h = createHash('sha256').update(randomUUID()).digest('hex');
  await pool.query(
    `INSERT INTO auth_tokens (token_hash, owner_id, kind, expires_at) VALUES ($1,$2,$3,$4)`,
    [h, userId, 'password_reset', new Date(Date.now() - 1000).toISOString()]
  );
  const { rows } = await pool.query(
    `SELECT owner_id FROM auth_tokens
     WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at > now()`,
    [h]
  );
  assert(rows.length === 0, 'expired token was returned');
});

console.log('\nRate limiter (atomic across connections)');
await check('parallel hits increment exactly once each', async () => {
  const key = `test:${randomUUID()}`;
  const hit = async () => {
    const { rows } = await pool.query(
      `INSERT INTO rate_limits (bucket_key, hits, window_start)
       VALUES ($1, 1, now())
       ON CONFLICT (bucket_key) DO UPDATE SET
         hits = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2::double precision)
                     THEN 1 ELSE rate_limits.hits + 1 END,
         window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2::double precision)
                             THEN now() ELSE rate_limits.window_start END
       RETURNING hits`,
      [key, 60]
    );
    return Number(rows[0].hits);
  };
  const results = await Promise.all(Array.from({ length: 20 }, hit));
  const sorted = [...results].sort((a, b) => a - b);
  assert(sorted[sorted.length - 1] === 20, `final count should be 20, got ${sorted[sorted.length - 1]}`);
  assert(new Set(results).size === 20, 'each concurrent hit must get a distinct count');
});
await check('window reset starts a fresh count', async () => {
  const key = `test:${randomUUID()}`;
  await pool.query(
    `INSERT INTO rate_limits (bucket_key, hits, window_start) VALUES ($1, 5, now() - interval '2 hours')`,
    [key]
  );
  const { rows } = await pool.query(
    `INSERT INTO rate_limits (bucket_key, hits, window_start)
     VALUES ($1, 1, now())
     ON CONFLICT (bucket_key) DO UPDATE SET
       hits = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2::double precision)
                   THEN 1 ELSE rate_limits.hits + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2::double precision)
                           THEN now() ELSE rate_limits.window_start END
     RETURNING hits`,
    [key, 60]
  );
  assert(Number(rows[0].hits) === 1, `expected reset to 1, got ${rows[0].hits}`);
});

console.log('\npgvector');
const docId = randomUUID();
await check('insert embeddings', async () => {
  for (let i = 0; i < 3; i++) {
    const vec = [[1, 0, 0], [0, 1, 0], [0.9, 0.1, 0]][i];
    await pool.query(
      `INSERT INTO document_chunks (id, owner_id, document_id, filename, chunk_index, content, embedding)
       VALUES ($1,$2,$3,$4,$5,$6,$7::vector)`,
      [randomUUID(), userId, docId, 'f.pdf', i, `chunk ${i}`, `[${vec.join(',')}]`]
    );
  }
});
await check('cosine similarity ranks nearest first', async () => {
  const { rows } = await pool.query(
    `SELECT content, 1 - (embedding <=> $1::vector) AS score
     FROM document_chunks WHERE owner_id=$2
     ORDER BY embedding <=> $1::vector LIMIT 3`,
    ['[1,0,0]', userId]
  );
  assert(rows[0].content === 'chunk 0', `nearest should be chunk 0, got ${rows[0].content}`);
  assert(rows[1].content === 'chunk 2', `second should be chunk 2, got ${rows[1].content}`);
  assert(Math.abs(Number(rows[0].score) - 1) < 0.0001, 'identical vector should score ~1');
  assert(Number(rows[2].score) < Number(rows[0].score), 'scores should descend');
});
await check('owner filter isolates accounts', async () => {
  const { rows } = await pool.query(
    `SELECT id FROM document_chunks WHERE owner_id=$1 ORDER BY embedding <=> $2::vector LIMIT 5`,
    [randomUUID(), '[1,0,0]']
  );
  assert(rows.length === 0, 'another owner must see nothing');
});
await check('dimension mismatch is rejected', async () => {
  let threw = false;
  try {
    await pool.query(
      `INSERT INTO document_chunks (id, owner_id, document_id, filename, chunk_index, content, embedding)
       VALUES ($1,$2,$3,'f',9,'x',$4::vector)`,
      [randomUUID(), userId, docId, '[1,0,0,0,0]']
    );
  } catch { threw = true; }
  assert(threw, 'a 5-dim vector should not fit a VECTOR(3) column');
});
await check('deleteDocument clears its chunks', async () => {
  await pool.query('DELETE FROM document_chunks WHERE document_id=$1', [docId]);
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM document_chunks WHERE document_id=$1', [docId]
  );
  assert(rows[0].n === 0, 'chunks should be gone');
});

console.log('\nRead-only transaction (NL→SQL guard)');
await check('demo data seeded', async () => {
  await pool.query(
    `INSERT INTO products (id,name,category,price,stock) VALUES (1,'X','Y',1.0,1)
     ON CONFLICT (id) DO NOTHING`
  );
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM products');
  assert(rows[0].n > 0, 'products should have rows');
});
await check('SELECT works inside READ ONLY', async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET TRANSACTION READ ONLY');
    const { rows } = await c.query('SELECT COUNT(*)::int AS n FROM products');
    assert(rows[0].n > 0, 'select should work');
    await c.query('COMMIT');
  } finally { c.release(); }
});
await check('writes are refused inside READ ONLY', async () => {
  const c = await pool.connect();
  let threw = false;
  try {
    await c.query('BEGIN');
    await c.query('SET TRANSACTION READ ONLY');
    await c.query("DELETE FROM products WHERE id = 1");
    await c.query('COMMIT');
  } catch { threw = true; await c.query('ROLLBACK').catch(() => {}); }
  finally { c.release(); }
  assert(threw, 'a DELETE must be refused by the read-only transaction');
});

console.log('\nCascade delete');
await check('deleteUserData removes every owned row', async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `DELETE FROM chat_messages WHERE thread_id IN (SELECT id FROM chat_threads WHERE owner_id=$1)`,
      [userId]
    );
    await c.query(
      `DELETE FROM thread_summaries WHERE thread_id IN (SELECT id FROM chat_threads WHERE owner_id=$1)`,
      [userId]
    );
    for (const t of ['documents','chat_threads','user_preferences','user_api_keys',
      'user_connections','agent_actions','generated_content','usage_events',
      'request_logs','error_logs','activity_events','auth_tokens']) {
      await c.query(`DELETE FROM ${t} WHERE owner_id = $1`, [userId]);
    }
    await c.query('DELETE FROM users WHERE id=$1', [userId]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users WHERE id=$1', [userId]);
  assert(rows[0].n === 0, 'user should be gone');
  const u = await pool.query('SELECT COUNT(*)::int AS n FROM usage_events WHERE owner_id=$1', [userId]);
  assert(u.rows[0].n === 0, 'usage events should be gone');
});

await pool.end();
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
