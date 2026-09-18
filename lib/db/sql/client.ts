import { Pool, type PoolClient } from 'pg';
import { env } from '@/lib/env';
import type { DocumentRecord } from '@/lib/types';
import { SCHEMA_SQL } from './schema';

// ---------------------------------------------------------------------------
// Connection pool
//
// Stashed on globalThis under a symbol so Next.js hot reload (which
// re-evaluates modules) does not open a new pool on every edit, and so
// serverless invocations that reuse a warm container reuse the pool too.
//
// `max` is deliberately small: serverless platforms run many concurrent
// instances, each with its own pool, and Postgres connection limits are per
// server, not per instance. Neon's pooled endpoint (a `-pooler` host) or
// PgBouncer in front is what actually makes this safe at scale.
// ---------------------------------------------------------------------------

const POOL_SYMBOL = Symbol.for('igniteai-studio.pg-pool');
const READY_SYMBOL = Symbol.for('igniteai-studio.pg-ready');

interface GlobalWithDb {
  [key: symbol]: unknown;
}

const globalForDb = globalThis as unknown as GlobalWithDb;

function createPool(): Pool {
  if (!env.databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. IgniteAI Studio needs a Postgres connection string — ' +
        'e.g. postgres://user:pass@host/db?sslmode=require. For local development, ' +
        '`docker compose up -d postgres` starts one.'
    );
  }

  return new Pool({
    connectionString: env.databaseUrl,
    max: env.pgPoolMax,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    // Managed Postgres (Neon, Supabase, RDS) terminates TLS with certificates
    // that are not in Node's default trust store. Verification is disabled only
    // when the connection string does not already ask for a stricter mode.
    ssl: env.databaseUrl.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
  });
}

export function getPool(): Pool {
  if (!globalForDb[POOL_SYMBOL]) {
    globalForDb[POOL_SYMBOL] = createPool();
  }
  return globalForDb[POOL_SYMBOL] as Pool;
}

/**
 * Applies the schema exactly once per process.
 *
 * The bootstrap promise is memoised on globalThis, so concurrent requests in a
 * warm container await the same in-flight promise rather than each running the
 * DDL. Across *separate* instances (a serverless cold-start storm) concurrent
 * `CREATE TABLE IF NOT EXISTS` can still race and raise a duplicate-object
 * error, so the whole thing runs inside a Postgres advisory lock: the first
 * instance applies the schema, the rest wait and then find it already there.
 */
async function ensureSchema(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [BOOTSTRAP_LOCK_ID]);
    try {
      await client.query(SCHEMA_SQL);
      await migrateExistingTables(client);
      await seedDemoDataIfEmpty(client);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [BOOTSTRAP_LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

/** Arbitrary but fixed: any 64-bit int works, it just has to be the same everywhere. */
const BOOTSTRAP_LOCK_ID = 4_113_507_001;

function ready(): Promise<void> {
  if (!globalForDb[READY_SYMBOL]) {
    // Cache the promise, not its result, so concurrent callers share one run.
    // On failure the cache is cleared so the next request retries rather than
    // permanently poisoning the container.
    globalForDb[READY_SYMBOL] = ensureSchema().catch((err) => {
      globalForDb[READY_SYMBOL] = undefined;
      throw err;
    });
  }
  return globalForDb[READY_SYMBOL] as Promise<void>;
}

/**
 * Runs a parameterised query, applying the schema first if this process has
 * not yet done so. Every exported function below goes through here, so no
 * caller has to think about bootstrap ordering.
 */
async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  await ready();
  const result = await getPool().query(sql, params);
  return result.rows as T[];
}

/** Single-row convenience wrapper. */
async function queryOne<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Runs `fn` inside a transaction on a dedicated connection, committing on
 * success and rolling back on any throw.
 */
async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ready();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Columns added after a table already exists in a deployed database. Postgres
 * supports ADD COLUMN IF NOT EXISTS directly, so unlike the SQLite original
 * this needs no information_schema probing to stay idempotent.
 */
async function migrateExistingTables(client: PoolClient): Promise<void> {
  const statements = [
    `ALTER TABLE chat_messages    ADD COLUMN IF NOT EXISTS token_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE chat_messages    ADD COLUMN IF NOT EXISTS document_refs TEXT`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS connection_type TEXT DEFAULT 'cloud'`,
    `ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS auto_approve_json TEXT`,
    `ALTER TABLE users            ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`,
  ];
  for (const sql of statements) {
    await client.query(sql);
  }
}

// ---------------------------------------------------------------------------
// Value coercion
//
// node-postgres hydrates TIMESTAMPTZ/DATE as JS Date and BIGINT as string.
// The application's record types are all plain strings/numbers, so every
// mapper funnels through these rather than leaking driver types upward.
// ---------------------------------------------------------------------------

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value == null ? '' : String(value);
}

function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  return toIso(value);
}

function toNum(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// ---------------------------------------------------------------------------
// Demo data seeding for products/orders (NL -> SQL routing demo data).
// ---------------------------------------------------------------------------

async function seedDemoDataIfEmpty(client: PoolClient): Promise<void> {
  const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM products');
  if ((rows[0] as { count: number }).count > 0) return;

  const products: Array<[number, string, string, number, number]> = [
    [1, 'Wireless Noise-Cancelling Headphones', 'Electronics', 149.99, 42],
    [2, 'Mechanical Keyboard', 'Electronics', 89.5, 30],
    [3, '27-inch 4K Monitor', 'Electronics', 329.0, 18],
    [4, 'Ergonomic Office Chair', 'Furniture', 219.99, 12],
    [5, 'Standing Desk', 'Furniture', 399.0, 8],
    [6, 'Desk Lamp with USB-C Charging', 'Furniture', 34.99, 60],
    [7, 'Insulated Steel Water Bottle', 'Accessories', 24.99, 100],
    [8, 'Leather Laptop Sleeve', 'Accessories', 45.0, 55],
  ];

  for (const row of products) {
    await client.query(
      `INSERT INTO products (id, name, category, price, stock)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      row
    );
  }

  const orders: Array<[number, number, string, number, string, string]> = [
    [1, 1, 'Alice Nguyen', 1, '2026-06-01', 'delivered'],
    [2, 2, 'Brian Foster', 2, '2026-06-03', 'delivered'],
    [3, 3, 'Carla Mendes', 1, '2026-06-10', 'shipped'],
    [4, 4, 'David Osei', 1, '2026-06-14', 'delivered'],
    [5, 5, 'Elena Petrova', 1, '2026-06-20', 'pending'],
    [6, 1, 'Farid Haidari', 3, '2026-06-22', 'shipped'],
    [7, 6, 'Grace Lin', 2, '2026-06-25', 'delivered'],
    [8, 7, 'Hassan Ali', 5, '2026-06-28', 'delivered'],
    [9, 8, 'Isla Thompson', 1, '2026-07-02', 'shipped'],
    [10, 2, 'Jamal Carter', 1, '2026-07-05', 'pending'],
    [11, 3, 'Kira Yamamoto', 2, '2026-07-10', 'pending'],
    [12, 5, "Liam O'Brien", 1, '2026-07-14', 'shipped'],
  ];

  for (const row of orders) {
    await client.query(
      `INSERT INTO orders (id, product_id, customer_name, quantity, order_date, status)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
      row
    );
  }
}

// ---------------------------------------------------------------------------
// Typed row shapes (snake_case, as stored)
// ---------------------------------------------------------------------------

interface UserRow extends Record<string, unknown> {
  id: string;
  email: string;
  password_hash: string | null;
  name: string | null;
  provider: string | null;
  onboarded_at: Date | null;
  email_verified_at: Date | null;
  created_at: Date;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  provider: string | null;
  onboardedAt: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
}

interface DocumentRow extends Record<string, unknown> {
  id: string;
  owner_id: string;
  filename: string;
  mime_type: string;
  size_bytes: string | number;
  status: string;
  chunk_count: number;
  error: string | null;
  created_at: Date;
}

interface ChatThreadRow extends Record<string, unknown> {
  id: string;
  owner_id: string;
  title: string | null;
  pinned: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ChatThreadRecord {
  id: string;
  ownerId: string;
  title: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ChatMessageRow extends Record<string, unknown> {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  meta_json: string | null;
  token_count: number;
  document_refs: string | null;
  created_at: Date;
}

export interface ChatMessageRecord {
  id: string;
  threadId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  metaJson: string | null;
  tokenCount: number;
  /** JSON array of document ids this message drew on, or null. */
  documentRefs: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapUserRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    provider: row.provider,
    onboardedAt: toIsoOrNull(row.onboarded_at),
    emailVerifiedAt: toIsoOrNull(row.email_verified_at),
    createdAt: toIso(row.created_at),
  };
}

function mapDocumentRow(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: toNum(row.size_bytes),
    status: row.status as DocumentRecord['status'],
    chunkCount: toNum(row.chunk_count),
    createdAt: toIso(row.created_at),
    error: row.error ?? undefined,
  };
}

function mapChatThreadRow(row: ChatThreadRow): ChatThreadRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    pinned: row.pinned === true,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapChatMessageRow(row: ChatMessageRow): ChatMessageRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role as ChatMessageRecord['role'],
    content: row.content,
    metaJson: row.meta_json,
    tokenCount: toNum(row.token_count),
    documentRefs: row.document_refs,
    createdAt: toIso(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * Canonicalizes an email for storage and lookup. Emails are case-insensitive
 * in practice, and mobile keyboards / autofill routinely change the casing of
 * what a user types. Normalizing in this single place guarantees registration,
 * credentials sign-in and OAuth auto-provisioning all agree on the same key.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const row = await queryOne<UserRow>('SELECT * FROM users WHERE email = $1', [
    normalizeEmail(email),
  ]);
  return row ? mapUserRow(row) : null;
}

export async function createUser(user: {
  id: string;
  email: string;
  passwordHash?: string | null;
  name?: string | null;
  provider?: string;
}): Promise<UserRecord> {
  const email = normalizeEmail(user.email);
  const row = await queryOne<UserRow>(
    `INSERT INTO users (id, email, password_hash, name, provider)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [user.id, email, user.passwordHash ?? null, user.name ?? null, user.provider ?? 'credentials']
  );
  if (!row) throw new Error('Failed to read back created user');
  return mapUserRow(row);
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const row = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return row ? mapUserRow(row) : null;
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
}

export async function markOnboarded(ownerId: string): Promise<void> {
  await query('UPDATE users SET onboarded_at = now() WHERE id = $1', [ownerId]);
}

// ---------------------------------------------------------------------------
// Email verification + single-use auth tokens (password reset / verify email)
// ---------------------------------------------------------------------------

export type AuthTokenKind = 'password_reset' | 'email_verification';

export async function markEmailVerified(ownerId: string): Promise<void> {
  await query('UPDATE users SET email_verified_at = now() WHERE id = $1', [ownerId]);
}

/**
 * Stores the sha256 hash of a freshly minted token. Any outstanding token of
 * the same kind for this user is dropped first, so requesting a new link always
 * invalidates the previous one.
 */
export async function createAuthToken(params: {
  tokenHash: string;
  ownerId: string;
  kind: AuthTokenKind;
  expiresAt: string;
}): Promise<void> {
  await transaction(async (client) => {
    await client.query('DELETE FROM auth_tokens WHERE owner_id = $1 AND kind = $2', [
      params.ownerId,
      params.kind,
    ]);
    await client.query(
      `INSERT INTO auth_tokens (token_hash, owner_id, kind, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [params.tokenHash, params.ownerId, params.kind, params.expiresAt]
    );
  });
}

/**
 * Atomically claims a token, returning its owner only if the token exists, is
 * of the expected kind, has not expired and has not already been consumed.
 *
 * The SELECT takes `FOR UPDATE` so two concurrent redemptions of the same token
 * serialise: the second blocks until the first commits, then sees
 * consumed_at set and returns null. Without the row lock both could read the
 * unconsumed row and both succeed.
 */
export async function consumeAuthToken(
  tokenHash: string,
  kind: AuthTokenKind
): Promise<string | null> {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `SELECT owner_id FROM auth_tokens
       WHERE token_hash = $1 AND kind = $2 AND consumed_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [tokenHash, kind]
    );
    const row = rows[0] as { owner_id: string } | undefined;
    if (!row) return null;
    await client.query('UPDATE auth_tokens SET consumed_at = now() WHERE token_hash = $1', [
      tokenHash,
    ]);
    return row.owner_id;
  });
}

/** Housekeeping: drop tokens that expired or were used more than a day ago. */
export async function purgeStaleAuthTokens(): Promise<void> {
  await query(
    `DELETE FROM auth_tokens
     WHERE expires_at <= now() OR consumed_at <= now() - interval '1 day'`
  );
}

/** Cascade-deletes every row belonging to a user across all tables. */
export async function deleteUserData(ownerId: string): Promise<void> {
  const tables = [
    'documents',
    'chat_threads',
    'user_preferences',
    'user_api_keys',
    'user_connections',
    'agent_actions',
    'generated_content',
    'usage_events',
    'request_logs',
    'error_logs',
    'activity_events',
    'auth_tokens',
  ];

  await transaction(async (client) => {
    // chat_messages/thread_summaries are keyed by thread, not owner — clear
    // them via the owner's threads before the threads themselves go.
    await client.query(
      `DELETE FROM chat_messages
       WHERE thread_id IN (SELECT id FROM chat_threads WHERE owner_id = $1)`,
      [ownerId]
    );
    await client.query(
      `DELETE FROM thread_summaries
       WHERE thread_id IN (SELECT id FROM chat_threads WHERE owner_id = $1)`,
      [ownerId]
    );
    for (const table of tables) {
      await client.query(`DELETE FROM ${table} WHERE owner_id = $1`, [ownerId]);
    }
    await client.query('DELETE FROM users WHERE id = $1', [ownerId]);
  });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function insertDocument(doc: {
  id: string;
  ownerId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status?: string;
  chunkCount?: number;
  error?: string | null;
}): Promise<DocumentRecord> {
  const row = await queryOne<DocumentRow>(
    `INSERT INTO documents (id, owner_id, filename, mime_type, size_bytes, status, chunk_count, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      doc.id,
      doc.ownerId,
      doc.filename,
      doc.mimeType,
      doc.sizeBytes,
      doc.status ?? 'processing',
      doc.chunkCount ?? 0,
      doc.error ?? null,
    ]
  );
  if (!row) throw new Error('Failed to read back created document');
  return mapDocumentRow(row);
}

export async function updateDocumentStatus(
  id: string,
  status: DocumentRecord['status'],
  chunkCount?: number,
  error?: string | null
): Promise<void> {
  if (chunkCount !== undefined) {
    await query('UPDATE documents SET status = $1, chunk_count = $2, error = $3 WHERE id = $4', [
      status,
      chunkCount,
      error ?? null,
      id,
    ]);
  } else {
    await query('UPDATE documents SET status = $1, error = $2 WHERE id = $3', [
      status,
      error ?? null,
      id,
    ]);
  }
}

export async function listDocumentsByOwner(ownerId: string): Promise<DocumentRecord[]> {
  const rows = await query<DocumentRow>(
    'SELECT * FROM documents WHERE owner_id = $1 ORDER BY created_at DESC',
    [ownerId]
  );
  return rows.map(mapDocumentRow);
}

export async function getDocumentById(id: string): Promise<DocumentRecord | null> {
  const row = await queryOne<DocumentRow>('SELECT * FROM documents WHERE id = $1', [id]);
  return row ? mapDocumentRow(row) : null;
}

export async function deleteDocument(id: string): Promise<void> {
  await query('DELETE FROM documents WHERE id = $1', [id]);
}

// ---------------------------------------------------------------------------
// Chat threads / messages
// ---------------------------------------------------------------------------

export async function createChatThread(thread: {
  id: string;
  ownerId: string;
  title?: string | null;
}): Promise<ChatThreadRecord> {
  const row = await queryOne<ChatThreadRow>(
    `INSERT INTO chat_threads (id, owner_id, title) VALUES ($1, $2, $3) RETURNING *`,
    [thread.id, thread.ownerId, thread.title ?? null]
  );
  if (!row) throw new Error('Failed to read back created thread');
  return mapChatThreadRow(row);
}

export async function getChatThread(id: string): Promise<ChatThreadRecord | null> {
  const row = await queryOne<ChatThreadRow>('SELECT * FROM chat_threads WHERE id = $1', [id]);
  return row ? mapChatThreadRow(row) : null;
}

/** Lists a user's threads, pinned first, then most-recently-updated. */
export async function listChatThreads(ownerId: string): Promise<ChatThreadRecord[]> {
  const rows = await query<ChatThreadRow>(
    'SELECT * FROM chat_threads WHERE owner_id = $1 ORDER BY pinned DESC, updated_at DESC',
    [ownerId]
  );
  return rows.map(mapChatThreadRow);
}

export async function updateChatThread(
  id: string,
  updates: { title?: string; pinned?: boolean }
): Promise<void> {
  if (updates.title !== undefined) {
    await query('UPDATE chat_threads SET title = $1, updated_at = now() WHERE id = $2', [
      updates.title,
      id,
    ]);
  }
  if (updates.pinned !== undefined) {
    await query('UPDATE chat_threads SET pinned = $1, updated_at = now() WHERE id = $2', [
      updates.pinned,
      id,
    ]);
  }
}

export async function touchChatThread(id: string): Promise<void> {
  await query('UPDATE chat_threads SET updated_at = now() WHERE id = $1', [id]);
}

export async function deleteChatThread(id: string): Promise<void> {
  await transaction(async (client) => {
    await client.query('DELETE FROM chat_messages WHERE thread_id = $1', [id]);
    await client.query('DELETE FROM thread_summaries WHERE thread_id = $1', [id]);
    await client.query('DELETE FROM chat_threads WHERE id = $1', [id]);
  });
}

export async function insertChatMessage(msg: {
  id: string;
  threadId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  metaJson?: string | null;
  tokenCount?: number;
  documentRefs?: string | null;
}): Promise<ChatMessageRecord> {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO chat_messages (id, thread_id, role, content, meta_json, token_count, document_refs)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        msg.id,
        msg.threadId,
        msg.role,
        msg.content,
        msg.metaJson ?? null,
        msg.tokenCount ?? 0,
        msg.documentRefs ?? null,
      ]
    );
    await client.query('UPDATE chat_threads SET updated_at = now() WHERE id = $1', [msg.threadId]);
    return mapChatMessageRow(rows[0] as ChatMessageRow);
  });
}

/** All messages for a thread, oldest -> newest (for rendering a full thread). */
export async function listThreadMessages(threadId: string): Promise<ChatMessageRecord[]> {
  const rows = await query<ChatMessageRow>(
    'SELECT * FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC',
    [threadId]
  );
  return rows.map(mapChatMessageRow);
}

/**
 * The last `limit` messages for a thread, ordered oldest -> newest, for
 * building a "last N exchanges" context window.
 */
export async function getRecentMessages(
  threadId: string,
  limit = 6
): Promise<ChatMessageRecord[]> {
  const rows = await query<ChatMessageRow>(
    'SELECT * FROM chat_messages WHERE thread_id = $1 ORDER BY created_at DESC LIMIT $2',
    [threadId, limit]
  );
  return rows.reverse().map(mapChatMessageRow);
}

/** Total messages currently stored for a thread (drives summary regeneration). */
export async function countThreadMessages(threadId: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM chat_messages WHERE thread_id = $1',
    [threadId]
  );
  return toNum(row?.n);
}

// ---------------------------------------------------------------------------
// Thread summaries (token efficiency: compress history older than the window)
// ---------------------------------------------------------------------------

export interface ThreadSummaryRecord {
  threadId: string;
  summary: string;
  throughMessageCount: number;
  updatedAt: string;
}

export async function getThreadSummary(threadId: string): Promise<ThreadSummaryRecord | null> {
  const row = await queryOne<{
    thread_id: string;
    summary: string;
    through_message_count: number;
    updated_at: Date;
  }>('SELECT * FROM thread_summaries WHERE thread_id = $1', [threadId]);
  if (!row) return null;
  return {
    threadId: row.thread_id,
    summary: row.summary,
    throughMessageCount: toNum(row.through_message_count),
    updatedAt: toIso(row.updated_at),
  };
}

export async function upsertThreadSummary(
  threadId: string,
  summary: string,
  throughMessageCount: number
): Promise<void> {
  await query(
    `INSERT INTO thread_summaries (thread_id, summary, through_message_count, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (thread_id) DO UPDATE SET
       summary = EXCLUDED.summary,
       through_message_count = EXCLUDED.through_message_count,
       updated_at = now()`,
    [threadId, summary, throughMessageCount]
  );
}

// ---------------------------------------------------------------------------
// Agent actions (HITL audit trail + paused-loop state)
// ---------------------------------------------------------------------------

export type AgentActionStatus = 'proposed' | 'approved' | 'rejected' | 'executed' | 'failed';

export interface AgentActionRecord {
  id: string;
  threadId: string;
  ownerId: string;
  tool: string;
  summary: string;
  payloadJson: string;
  status: AgentActionStatus;
  resultJson: string | null;
  stateJson: string | null;
  decidedAt: string | null;
  createdAt: string;
}

interface AgentActionRow extends Record<string, unknown> {
  id: string;
  thread_id: string;
  owner_id: string;
  tool: string;
  summary: string;
  payload_json: string;
  status: string;
  result_json: string | null;
  state_json: string | null;
  decided_at: Date | null;
  created_at: Date;
}

function mapAgentActionRow(row: AgentActionRow): AgentActionRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    ownerId: row.owner_id,
    tool: row.tool,
    summary: row.summary,
    payloadJson: row.payload_json,
    status: row.status as AgentActionStatus,
    resultJson: row.result_json,
    stateJson: row.state_json,
    decidedAt: toIsoOrNull(row.decided_at),
    createdAt: toIso(row.created_at),
  };
}

export async function insertAgentAction(action: {
  id: string;
  threadId: string;
  ownerId: string;
  tool: string;
  summary: string;
  payloadJson: string;
  status?: AgentActionStatus;
  stateJson?: string | null;
}): Promise<AgentActionRecord> {
  const row = await queryOne<AgentActionRow>(
    `INSERT INTO agent_actions (id, thread_id, owner_id, tool, summary, payload_json, status, state_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      action.id,
      action.threadId,
      action.ownerId,
      action.tool,
      action.summary,
      action.payloadJson,
      action.status ?? 'proposed',
      action.stateJson ?? null,
    ]
  );
  if (!row) throw new Error('Failed to read back created agent action');
  return mapAgentActionRow(row);
}

export async function getAgentAction(id: string): Promise<AgentActionRecord | null> {
  const row = await queryOne<AgentActionRow>('SELECT * FROM agent_actions WHERE id = $1', [id]);
  return row ? mapAgentActionRow(row) : null;
}

export async function updateAgentAction(
  id: string,
  updates: {
    status?: AgentActionStatus;
    resultJson?: string | null;
    payloadJson?: string;
    decided?: boolean;
  }
): Promise<void> {
  // Built as one UPDATE rather than several so a decision lands atomically.
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (updates.status !== undefined) {
    sets.push(`status = $${i++}`);
    params.push(updates.status);
  }
  if (updates.resultJson !== undefined) {
    sets.push(`result_json = $${i++}`);
    params.push(updates.resultJson);
  }
  if (updates.payloadJson !== undefined) {
    sets.push(`payload_json = $${i++}`);
    params.push(updates.payloadJson);
  }
  if (updates.decided) {
    sets.push('decided_at = now()');
  }
  if (sets.length === 0) return;

  params.push(id);
  await query(`UPDATE agent_actions SET ${sets.join(', ')} WHERE id = $${i}`, params);
}

export async function listAgentActions(
  threadId: string,
  ownerId: string,
  limit = 100
): Promise<AgentActionRecord[]> {
  const rows = await query<AgentActionRow>(
    `SELECT * FROM agent_actions WHERE thread_id = $1 AND owner_id = $2
     ORDER BY created_at DESC LIMIT $3`,
    [threadId, ownerId, limit]
  );
  return rows.map(mapAgentActionRow);
}

// ---------------------------------------------------------------------------
// User connections (encrypted external-service credentials for agent tools)
// ---------------------------------------------------------------------------

export interface UserConnectionRecord {
  id: string;
  ownerId: string;
  service: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  label: string;
  createdAt: string;
}

interface UserConnectionRow extends Record<string, unknown> {
  id: string;
  owner_id: string;
  service: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  label: string;
  created_at: Date;
}

function mapConnectionRow(row: UserConnectionRow): UserConnectionRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    service: row.service,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.auth_tag,
    label: row.label,
    createdAt: toIso(row.created_at),
  };
}

export async function upsertUserConnection(conn: {
  id: string;
  ownerId: string;
  service: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  label?: string;
}): Promise<void> {
  await query(
    `INSERT INTO user_connections (id, owner_id, service, ciphertext, iv, auth_tag, label)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (owner_id, service) DO UPDATE SET
       ciphertext = EXCLUDED.ciphertext,
       iv = EXCLUDED.iv,
       auth_tag = EXCLUDED.auth_tag,
       label = EXCLUDED.label,
       created_at = now()`,
    [conn.id, conn.ownerId, conn.service, conn.ciphertext, conn.iv, conn.authTag, conn.label ?? '']
  );
}

export async function getUserConnection(
  ownerId: string,
  service: string
): Promise<UserConnectionRecord | null> {
  const row = await queryOne<UserConnectionRow>(
    'SELECT * FROM user_connections WHERE owner_id = $1 AND service = $2',
    [ownerId, service]
  );
  return row ? mapConnectionRow(row) : null;
}

export async function listUserConnections(ownerId: string): Promise<UserConnectionRecord[]> {
  const rows = await query<UserConnectionRow>(
    'SELECT * FROM user_connections WHERE owner_id = $1 ORDER BY service',
    [ownerId]
  );
  return rows.map(mapConnectionRow);
}

export async function deleteUserConnection(ownerId: string, service: string): Promise<void> {
  await query('DELETE FROM user_connections WHERE owner_id = $1 AND service = $2', [
    ownerId,
    service,
  ]);
}

// ---------------------------------------------------------------------------
// Embedding cache (never embed the same text twice for a provider+model)
// ---------------------------------------------------------------------------

/**
 * Cached vectors for the given content hashes, as a hash -> vector map. Hashes
 * with no cache entry are simply absent. One query with `= ANY($1)` rather than
 * a loop, because ingestion looks up hundreds of hashes at a time and a
 * round-trip each would dominate the request.
 */
export async function getCachedEmbeddings(
  hashes: string[],
  provider: string,
  model: string
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (hashes.length === 0) return out;

  const rows = await query<{ content_hash: string; vector_json: string }>(
    `SELECT content_hash, vector_json FROM embedding_cache
     WHERE content_hash = ANY($1::text[]) AND provider = $2 AND model = $3`,
    [hashes, provider, model]
  );

  for (const row of rows) {
    try {
      out.set(row.content_hash, JSON.parse(row.vector_json) as number[]);
    } catch {
      /* corrupt cache entry — treat as a miss */
    }
  }
  return out;
}

export async function putCachedEmbeddings(
  entries: { hash: string; vector: number[] }[],
  provider: string,
  model: string
): Promise<void> {
  if (entries.length === 0) return;
  await transaction(async (client) => {
    for (const entry of entries) {
      await client.query(
        `INSERT INTO embedding_cache (content_hash, provider, model, vector_json)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (content_hash, provider, model) DO NOTHING`,
        [entry.hash, provider, model, JSON.stringify(entry.vector)]
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Read-only query execution for the NL -> SQL router.
// ---------------------------------------------------------------------------

/**
 * Executes a single read-only SQL statement.
 *
 * The statement is wrapped in a READ ONLY transaction, so even if the
 * validation in nlToSql.ts were bypassed, Postgres itself refuses any write —
 * a guarantee the SQLite original could not make. Multi-statement strings are
 * rejected by the driver's extended query protocol when parameters are used,
 * and by the validator regardless.
 */
export async function runReadOnlyQuery(sql: string, params: unknown[] = []): Promise<unknown[]> {
  return transaction(async (client) => {
    await client.query('SET TRANSACTION READ ONLY');
    const { rows } = await client.query(sql, params);
    return rows as unknown[];
  });
}

// ---------------------------------------------------------------------------
// User preferences
// ---------------------------------------------------------------------------

export type ConnectionType = 'cloud' | 'local' | 'auto';

export interface UserPreferences {
  ownerId: string;
  defaultProvider: string | null;
  defaultModel: string | null;
  defaultTone: string;
  theme: string;
  connectionType: ConnectionType;
  /** Map of tool name -> true for tools the user auto-approves (HITL opt-in). */
  autoApprove: Record<string, boolean>;
}

export async function getUserPreferences(ownerId: string): Promise<UserPreferences> {
  const row = await queryOne<{
    owner_id: string;
    default_provider: string | null;
    default_model: string | null;
    default_tone: string | null;
    theme: string | null;
    connection_type: string | null;
    auto_approve_json: string | null;
  }>('SELECT * FROM user_preferences WHERE owner_id = $1', [ownerId]);

  let autoApprove: Record<string, boolean> = {};
  if (row?.auto_approve_json) {
    try {
      autoApprove = JSON.parse(row.auto_approve_json) as Record<string, boolean>;
    } catch {
      autoApprove = {};
    }
  }

  return {
    ownerId,
    defaultProvider: row?.default_provider ?? null,
    defaultModel: row?.default_model ?? null,
    defaultTone: row?.default_tone ?? 'professional',
    theme: row?.theme ?? 'dark',
    connectionType: (row?.connection_type as ConnectionType) ?? 'cloud',
    autoApprove,
  };
}

export async function upsertUserPreferences(
  ownerId: string,
  prefs: Partial<Omit<UserPreferences, 'ownerId'>>
): Promise<UserPreferences> {
  const current = await getUserPreferences(ownerId);
  const next = { ...current, ...prefs };
  await query(
    `INSERT INTO user_preferences (owner_id, default_provider, default_model, default_tone, theme, connection_type, auto_approve_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (owner_id) DO UPDATE SET
       default_provider = EXCLUDED.default_provider,
       default_model = EXCLUDED.default_model,
       default_tone = EXCLUDED.default_tone,
       theme = EXCLUDED.theme,
       connection_type = EXCLUDED.connection_type,
       auto_approve_json = EXCLUDED.auto_approve_json`,
    [
      ownerId,
      next.defaultProvider,
      next.defaultModel,
      next.defaultTone,
      next.theme,
      next.connectionType,
      JSON.stringify(next.autoApprove ?? {}),
    ]
  );
  return next;
}

// ---------------------------------------------------------------------------
// User API keys (encrypted; see lib/crypto.ts)
// ---------------------------------------------------------------------------

export interface UserApiKeyRecord {
  id: string;
  ownerId: string;
  provider: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  keyPreview: string;
  createdAt: string;
}

interface UserApiKeyRow extends Record<string, unknown> {
  id: string;
  owner_id: string;
  provider: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  key_preview: string;
  created_at: Date;
}

function mapApiKeyRow(row: UserApiKeyRow): UserApiKeyRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    provider: row.provider,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.auth_tag,
    keyPreview: row.key_preview,
    createdAt: toIso(row.created_at),
  };
}

export async function upsertUserApiKey(key: {
  id: string;
  ownerId: string;
  provider: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  keyPreview: string;
}): Promise<void> {
  await query(
    `INSERT INTO user_api_keys (id, owner_id, provider, ciphertext, iv, auth_tag, key_preview)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (owner_id, provider) DO UPDATE SET
       ciphertext = EXCLUDED.ciphertext,
       iv = EXCLUDED.iv,
       auth_tag = EXCLUDED.auth_tag,
       key_preview = EXCLUDED.key_preview,
       created_at = now()`,
    [key.id, key.ownerId, key.provider, key.ciphertext, key.iv, key.authTag, key.keyPreview]
  );
}

export async function listUserApiKeys(ownerId: string): Promise<UserApiKeyRecord[]> {
  const rows = await query<UserApiKeyRow>(
    'SELECT * FROM user_api_keys WHERE owner_id = $1 ORDER BY provider',
    [ownerId]
  );
  return rows.map(mapApiKeyRow);
}

export async function getUserApiKey(
  ownerId: string,
  provider: string
): Promise<UserApiKeyRecord | null> {
  const row = await queryOne<UserApiKeyRow>(
    'SELECT * FROM user_api_keys WHERE owner_id = $1 AND provider = $2',
    [ownerId, provider]
  );
  return row ? mapApiKeyRow(row) : null;
}

export async function deleteUserApiKey(ownerId: string, provider: string): Promise<void> {
  await query('DELETE FROM user_api_keys WHERE owner_id = $1 AND provider = $2', [
    ownerId,
    provider,
  ]);
}

// ---------------------------------------------------------------------------
// Generated content library
// ---------------------------------------------------------------------------

export interface GeneratedContentRecord {
  id: string;
  ownerId: string;
  documentId: string | null;
  contentType: string;
  tone: string;
  channel: string;
  output: string;
  createdAt: string;
}

interface GeneratedContentRow extends Record<string, unknown> {
  id: string;
  owner_id: string;
  document_id: string | null;
  content_type: string;
  tone: string;
  channel: string;
  output: string;
  created_at: Date;
}

function mapGeneratedContentRow(row: GeneratedContentRow): GeneratedContentRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    documentId: row.document_id,
    contentType: row.content_type,
    tone: row.tone,
    channel: row.channel,
    output: row.output,
    createdAt: toIso(row.created_at),
  };
}

export async function saveGeneratedContent(item: {
  id: string;
  ownerId: string;
  documentId?: string | null;
  contentType: string;
  tone: string;
  channel: string;
  output: string;
}): Promise<void> {
  await query(
    `INSERT INTO generated_content (id, owner_id, document_id, content_type, tone, channel, output)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      item.id,
      item.ownerId,
      item.documentId ?? null,
      item.contentType,
      item.tone,
      item.channel,
      item.output,
    ]
  );
}

export async function listGeneratedContent(ownerId: string): Promise<GeneratedContentRecord[]> {
  const rows = await query<GeneratedContentRow>(
    'SELECT * FROM generated_content WHERE owner_id = $1 ORDER BY created_at DESC',
    [ownerId]
  );
  return rows.map(mapGeneratedContentRow);
}

export async function deleteGeneratedContent(id: string, ownerId: string): Promise<void> {
  await query('DELETE FROM generated_content WHERE id = $1 AND owner_id = $2', [id, ownerId]);
}

// ---------------------------------------------------------------------------
// Usage / logs / activity (observability + dashboard)
// ---------------------------------------------------------------------------

export async function recordUsage(event: {
  id: string;
  ownerId: string;
  provider: string;
  kind: 'chat' | 'embed' | 'generate';
  promptTokens?: number;
  completionTokens?: number;
}): Promise<void> {
  await query(
    `INSERT INTO usage_events (id, owner_id, provider, kind, prompt_tokens, completion_tokens)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      event.id,
      event.ownerId,
      event.provider,
      event.kind,
      event.promptTokens ?? 0,
      event.completionTokens ?? 0,
    ]
  );
}

export interface UsageSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalRequests: number;
  byProvider: {
    provider: string;
    promptTokens: number;
    completionTokens: number;
    requests: number;
  }[];
}

export async function getUsageSummary(ownerId: string): Promise<UsageSummary> {
  const totals = await queryOne<{ p: string; c: string; n: number }>(
    `SELECT COALESCE(SUM(prompt_tokens),0) AS p,
            COALESCE(SUM(completion_tokens),0) AS c,
            COUNT(*)::int AS n
     FROM usage_events WHERE owner_id = $1`,
    [ownerId]
  );
  const byProvider = await query<{ provider: string; p: string; c: string; n: number }>(
    `SELECT provider,
            COALESCE(SUM(prompt_tokens),0) AS p,
            COALESCE(SUM(completion_tokens),0) AS c,
            COUNT(*)::int AS n
     FROM usage_events WHERE owner_id = $1 GROUP BY provider ORDER BY n DESC`,
    [ownerId]
  );

  return {
    // SUM() over an integer column returns BIGINT, which node-postgres hands
    // back as a string to avoid precision loss — coerce rather than ship "0".
    totalPromptTokens: toNum(totals?.p),
    totalCompletionTokens: toNum(totals?.c),
    totalRequests: toNum(totals?.n),
    byProvider: byProvider.map((r) => ({
      provider: r.provider,
      promptTokens: toNum(r.p),
      completionTokens: toNum(r.c),
      requests: toNum(r.n),
    })),
  };
}

export async function recordRequestLog(log: {
  id: string;
  ownerId: string;
  route: string;
  status: number;
  latencyMs?: number;
  provider?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO request_logs (id, owner_id, route, status, latency_ms, provider)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [log.id, log.ownerId, log.route, log.status, log.latencyMs ?? 0, log.provider ?? null]
  );
}

export async function recordErrorLog(log: {
  id: string;
  ownerId: string;
  route: string;
  message: string;
}): Promise<void> {
  await query(
    'INSERT INTO error_logs (id, owner_id, route, message) VALUES ($1, $2, $3, $4)',
    [log.id, log.ownerId, log.route, log.message]
  );
}

export async function listRequestLogs(
  ownerId: string,
  limit = 50
): Promise<Array<Record<string, unknown>>> {
  const rows = await query(
    'SELECT * FROM request_logs WHERE owner_id = $1 ORDER BY created_at DESC LIMIT $2',
    [ownerId, limit]
  );
  return rows.map((r) => ({ ...r, created_at: toIso(r.created_at) }));
}

export async function listErrorLogs(
  ownerId: string,
  limit = 50
): Promise<Array<Record<string, unknown>>> {
  const rows = await query(
    'SELECT * FROM error_logs WHERE owner_id = $1 ORDER BY created_at DESC LIMIT $2',
    [ownerId, limit]
  );
  return rows.map((r) => ({ ...r, created_at: toIso(r.created_at) }));
}

export interface ActivityEvent {
  id: string;
  ownerId: string;
  type: string;
  summary: string;
  createdAt: string;
}

export async function recordActivity(event: {
  id: string;
  ownerId: string;
  type: string;
  summary: string;
}): Promise<void> {
  await query(
    'INSERT INTO activity_events (id, owner_id, type, summary) VALUES ($1, $2, $3, $4)',
    [event.id, event.ownerId, event.type, event.summary]
  );
}

export async function listActivity(ownerId: string, limit = 20): Promise<ActivityEvent[]> {
  const rows = await query<{
    id: string;
    owner_id: string;
    type: string;
    summary: string;
    created_at: Date;
  }>('SELECT * FROM activity_events WHERE owner_id = $1 ORDER BY created_at DESC LIMIT $2', [
    ownerId,
    limit,
  ]);
  return rows.map((r) => ({
    id: r.id,
    ownerId: r.owner_id,
    type: r.type,
    summary: r.summary,
    createdAt: toIso(r.created_at),
  }));
}

export async function countDocuments(ownerId: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM documents WHERE owner_id = $1',
    [ownerId]
  );
  return toNum(row?.n);
}

export async function countGeneratedContent(ownerId: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM generated_content WHERE owner_id = $1',
    [ownerId]
  );
  return toNum(row?.n);
}

// ---------------------------------------------------------------------------
// Distributed rate limiting
// ---------------------------------------------------------------------------

export interface RateLimitRow {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Atomically increments a bucket and reports whether the caller is within the
 * limit.
 *
 * The whole decision happens in one statement so concurrent requests — which on
 * a serverless platform land in *different processes* — cannot both read a
 * stale count and both be allowed. The upsert either starts a fresh window
 * (when the stored one has aged out) or increments the current one.
 */
export async function consumeRateLimit(
  bucketKey: string,
  limit: number,
  windowMs: number
): Promise<RateLimitRow> {
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));

  const row = await queryOne<{ hits: number; window_start: Date }>(
    `INSERT INTO rate_limits (bucket_key, hits, window_start)
     VALUES ($1, 1, now())
     ON CONFLICT (bucket_key) DO UPDATE SET
       hits = CASE
                WHEN rate_limits.window_start < now() - make_interval(secs => $2::double precision)
                THEN 1
                ELSE rate_limits.hits + 1
              END,
       window_start = CASE
                        WHEN rate_limits.window_start < now() - make_interval(secs => $2::double precision)
                        THEN now()
                        ELSE rate_limits.window_start
                      END
     RETURNING hits, window_start`,
    [bucketKey, windowSeconds]
  );

  const hits = toNum(row?.hits);
  const windowStart = row?.window_start instanceof Date ? row.window_start.getTime() : Date.now();

  return {
    allowed: hits <= limit,
    remaining: Math.max(0, limit - hits),
    resetAt: windowStart + windowMs,
  };
}

/** Housekeeping: drop buckets whose window closed over a day ago. */
export async function purgeStaleRateLimits(): Promise<void> {
  await query(`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`);
}
