import { getPool } from '@/lib/db/sql/client';
import { env } from '@/lib/env';
import { pgvectorSchemaSql } from '@/lib/db/sql/schema';
import type { VectorStore } from './types';
import type { VectorChunk, VectorSearchResult } from '@/lib/types';

/**
 * Vector store backed by pgvector in the same Postgres database as everything
 * else.
 *
 * This is what makes a serverless deployment viable: Chroma needs a
 * long-running process with a disk, which no serverless platform provides,
 * whereas pgvector lives inside a managed Postgres that is already there. One
 * database, one connection string, one thing to back up.
 *
 * The table is created lazily, on the first write, using the width of a real
 * embedding. `VECTOR(n)` is fixed at creation time and the width depends on
 * which model actually answered the request — a provider falling back from
 * text-embedding-004 (768) to gemini-embedding-001 (3072) changes it — so
 * deriving it from configuration cannot be made reliable.
 */

const BOOTSTRAP_LOCK_ID = 4_113_507_002;

/** Cached per process so the width is checked once, not on every write. */
const READY_SYMBOL = Symbol.for('igniteai-studio.pgvector-ready');
const globalForVector = globalThis as unknown as {
  [READY_SYMBOL]?: Promise<number> | undefined;
};

/**
 * The declared width of `document_chunks.embedding`, or null when the table
 * does not exist yet.
 *
 * pgvector stores the dimension in `atttypmod`, verbatim — unlike varchar,
 * there is no -4 header offset to subtract.
 */
async function existingDimensions(client: {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}): Promise<number | null> {
  const { rows } = await client.query(
    `SELECT a.atttypmod AS dims
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'document_chunks'
       AND a.attname = 'embedding'
       AND n.nspname = current_schema()
       AND NOT a.attisdropped`
  );
  const row = rows[0] as { dims: number } | undefined;
  if (!row) return null;
  return row.dims > 0 ? row.dims : null;
}

/**
 * Makes sure `document_chunks` exists with the given embedding width, and
 * returns the width in force.
 *
 * When a table already exists at a different width there are two cases. If it
 * holds no rows, it is simply recreated — nothing is lost, and this is the
 * common case after switching embeddings model before re-ingesting. If it holds
 * rows, recreating it would silently destroy them, so it raises instead and
 * says exactly what to run.
 */
async function ensureTable(dimensions: number): Promise<number> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    try {
      // Transaction-scoped lock: a session-level one does not survive a
      // transaction-mode pooler. See ensureSchema() in lib/db/sql/client.ts.
      await client.query('SELECT pg_advisory_xact_lock($1)', [BOOTSTRAP_LOCK_ID]);

      const current = await existingDimensions(client);

      if (current !== null && current !== dimensions) {
        const { rows } = await client.query(
          'SELECT EXISTS (SELECT 1 FROM document_chunks LIMIT 1) AS has_rows'
        );
        const hasRows = (rows[0] as { has_rows: boolean }).has_rows;

        if (hasRows) {
          throw new Error(
            `The document_chunks table is VECTOR(${current}) but your embeddings model now ` +
              `returns ${dimensions} dimensions, and the table already holds documents. ` +
              `Vectors from different models are not comparable, so those documents must be ` +
              `re-ingested. Delete them (or run "DROP TABLE document_chunks;") and upload again.`
          );
        }

        // Empty table at the wrong width — safe to rebuild at the right one.
        await client.query('DROP TABLE document_chunks');
      }

      await client.query(pgvectorSchemaSql(dimensions));
      await client.query('COMMIT');
      return dimensions;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    }
  } finally {
    client.release();
  }
}

function ready(dimensions: number): Promise<number> {
  if (!globalForVector[READY_SYMBOL]) {
    globalForVector[READY_SYMBOL] = ensureTable(dimensions).catch((err) => {
      globalForVector[READY_SYMBOL] = undefined;
      if (err instanceof Error && /extension "vector"|type "vector"/i.test(err.message)) {
        throw new Error(
          'The pgvector extension is not available on this database. Neon, Supabase and ' +
            'most managed Postgres providers support it — run `CREATE EXTENSION vector;` ' +
            'as a superuser, or set VECTOR_DB_PROVIDER=chroma to use Chroma instead. ' +
            `Original error: ${err.message}`
        );
      }
      throw err;
    });
  }
  return globalForVector[READY_SYMBOL]!;
}

/** True once the table exists; read paths use this instead of creating it. */
async function tableExists(): Promise<boolean> {
  const { rows } = await getPool().query(`SELECT to_regclass('document_chunks') AS t`);
  return Boolean((rows[0] as { t: string | null }).t);
}

/** pgvector's text input format is a bracketed list: [0.1,0.2,...]. */
function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

export const pgvectorStore: VectorStore = {
  id: 'pgvector',

  async upsert(chunks: VectorChunk[], embeddings: number[][]): Promise<void> {
    if (chunks.length === 0) return;
    if (chunks.length !== embeddings.length) {
      throw new Error(
        `Chunk/embedding length mismatch: ${chunks.length} chunks, ${embeddings.length} embeddings.`
      );
    }

    // The width comes from the data. An explicit EMBEDDING_DIMENSIONS is only
    // honoured as a cross-check, so a misconfigured value cannot break
    // ingestion on its own.
    const dimensions = embeddings[0].length;
    if (!dimensions) throw new Error('Embeddings provider returned an empty vector.');

    const inconsistent = embeddings.find((e) => e.length !== dimensions);
    if (inconsistent) {
      throw new Error(
        `Embeddings have inconsistent widths (${dimensions} and ${inconsistent.length}). ` +
          'This usually means the provider switched models part-way through the batch.'
      );
    }

    await ready(dimensions);

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        await client.query(
          `INSERT INTO document_chunks (id, owner_id, document_id, filename, chunk_index, content, embedding)
           VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
           ON CONFLICT (id) DO UPDATE SET
             content = EXCLUDED.content,
             filename = EXCLUDED.filename,
             embedding = EXCLUDED.embedding`,
          [
            chunk.id,
            chunk.ownerId,
            chunk.documentId,
            chunk.filename,
            chunk.chunkIndex,
            chunk.text,
            toVectorLiteral(embeddings[i]),
          ]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  },

  async search(
    queryEmbedding: number[],
    opts: { ownerId: string; topK?: number; documentId?: string }
  ): Promise<VectorSearchResult[]> {
    // Never create the table from a read: nothing has been ingested yet, and
    // guessing a width here is what the write path exists to avoid.
    if (!(await tableExists())) return [];

    const topK = opts.topK ?? 5;

    // `<=>` is cosine DISTANCE (0 = identical), so similarity is 1 - distance.
    // Filtering by owner_id here is the isolation boundary: one account's
    // chunks can never surface in another account's results.
    const params: unknown[] = [toVectorLiteral(queryEmbedding), opts.ownerId];
    let documentFilter = '';
    if (opts.documentId) {
      params.push(opts.documentId);
      documentFilter = `AND document_id = $${params.length}`;
    }
    params.push(topK);

    const { rows } = await getPool().query(
      `SELECT id, owner_id, document_id, filename, chunk_index, content,
              1 - (embedding <=> $1::vector) AS score
       FROM document_chunks
       WHERE owner_id = $2 ${documentFilter}
       ORDER BY embedding <=> $1::vector
       LIMIT $${params.length}`,
      params
    );

    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      ownerId: String(row.owner_id),
      documentId: String(row.document_id),
      filename: String(row.filename ?? ''),
      chunkIndex: Number(row.chunk_index),
      text: String(row.content),
      score: Number(row.score),
    }));
  },

  async getAllChunks(documentId: string, ownerId: string): Promise<VectorChunk[]> {
    if (!(await tableExists())) return [];

    const { rows } = await getPool().query(
      `SELECT id, owner_id, document_id, filename, chunk_index, content
       FROM document_chunks
       WHERE document_id = $1 AND owner_id = $2
       ORDER BY chunk_index ASC`,
      [documentId, ownerId]
    );

    return (rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      ownerId: String(row.owner_id),
      documentId: String(row.document_id),
      filename: String(row.filename ?? ''),
      chunkIndex: Number(row.chunk_index),
      text: String(row.content),
    }));
  },

  async deleteDocument(documentId: string): Promise<void> {
    if (!(await tableExists())) return;
    await getPool().query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);
  },
};

/** Exported for the ingest route's error messaging. */
export const configuredDimensions = env.embeddingDimensions;
