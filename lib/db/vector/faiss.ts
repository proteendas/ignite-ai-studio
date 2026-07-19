import { VectorChunk, VectorSearchResult } from '@/lib/types';
import { VectorStore } from './types';

/**
 * FAISS adapter stub.
 *
 * To wire this up for real:
 *   npm install faiss-node
 *   Implement an in-process index per owner (or a single index with metadata
 *   filtering done in JS, since faiss-node doesn't support metadata filters
 *   natively) and persist the index file under `data/faiss/<ownerId>.index`
 *   alongside a sidecar JSON file mapping vector row -> VectorChunk metadata.
 *
 * This stub implements the same VectorStore interface as chroma.ts so it's a
 * drop-in swap once implemented — set VECTOR_DB_PROVIDER=faiss to select it.
 */
export const faissVectorStore: VectorStore = {
  id: 'faiss',

  async upsert(_chunks: VectorChunk[], _embeddings: number[][]): Promise<void> {
    throw new Error(
      'FAISS vector store is not yet implemented. See lib/db/vector/faiss.ts for wiring instructions, or set VECTOR_DB_PROVIDER=chroma.'
    );
  },

  async search(
    _queryEmbedding: number[],
    _opts: { ownerId: string; topK?: number; documentId?: string }
  ): Promise<VectorSearchResult[]> {
    throw new Error(
      'FAISS vector store is not yet implemented. See lib/db/vector/faiss.ts for wiring instructions, or set VECTOR_DB_PROVIDER=chroma.'
    );
  },

  async getAllChunks(_documentId: string, _ownerId: string): Promise<VectorChunk[]> {
    throw new Error(
      'FAISS vector store is not yet implemented. See lib/db/vector/faiss.ts for wiring instructions, or set VECTOR_DB_PROVIDER=chroma.'
    );
  },

  async deleteDocument(_documentId: string): Promise<void> {
    throw new Error(
      'FAISS vector store is not yet implemented. See lib/db/vector/faiss.ts for wiring instructions, or set VECTOR_DB_PROVIDER=chroma.'
    );
  },
};
