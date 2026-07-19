import { VectorChunk, VectorSearchResult } from '@/lib/types';

export interface VectorStore {
  id: string;
  upsert(chunks: VectorChunk[], embeddings: number[][]): Promise<void>;
  search(
    queryEmbedding: number[],
    opts: { ownerId: string; topK?: number; documentId?: string }
  ): Promise<VectorSearchResult[]>;
  /** Returns all chunks for a document, ordered by chunkIndex ascending. Used by content generation, which needs the full document rather than a top-k similarity match. */
  getAllChunks(documentId: string, ownerId: string): Promise<VectorChunk[]>;
  deleteDocument(documentId: string): Promise<void>;
}
