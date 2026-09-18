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
 */

const READY_SYMBOL = Symbol.for('igniteai-studio.pgvector-ready');
const globalForVector = globalThis as unknown as { [key: symbol]: Promise<void> | undefined };

/**
 * Creates the extension, table and indexes once per process. Serialised behind
 * an advisory lock for the same reason the main schema is: several cold-start
 * instances can otherwise race on CREATE EXTENSION.
 */
function ready(): Promise<void> {
  if (!globalForVector[READY_SYMBOL]) {
    globalForVector[READY_SYMBOL] = (async () => {
      const client = await getPool().connect();
      try {
        await client.query('SELECT pg_advisory_lock($1)', [4_113_507_002]);
        try {
          await client.query(pgvectorSchemaSql(env.embeddingDimensions));
        } finally {
          await client.query('SELECT pg_advisory_unlock($1)', [4_113_507_002]);
        }
      } finally {
        client.release();
      }
    })().catch((err) => {
      globalForVector[READY_SYMBOL] = undefined;
      if (err instanceof Error && /extension "vector"/i.test(err.message)) {
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

    await ready();
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = embeddings[i];

        if (embedding.length !== env.embeddingDimensions) {
          throw new Error(
            `Embedding has ${embedding.length} dimensions but the document_chunks table is ` +
              `VECTOR(${env.embeddingDimensions}). Set EMBEDDING_DIMENSIONS to match your ` +
              'embeddings model and re-create the table, then re-ingest.'
          );
        }

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
            toVectorLiteral(embedding),
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
    await ready();
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
    await ready();
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
    await ready();
    await getPool().query('DELETE FROM document_chunks WHERE document_id = $1', [documentId]);
  },
};
