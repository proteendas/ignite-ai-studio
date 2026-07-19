import { VectorChunk, VectorSearchResult } from '@/lib/types';
import { VectorStore } from './types';

/**
 * Azure AI Search adapter stub.
 *
 * To wire this up for real:
 *   npm install @azure/search-documents
 *   Create a vector-enabled index (via the Azure portal or the
 *   SearchIndexClient) with fields: id (key), documentId, ownerId, filename,
 *   chunkIndex, text, and a `contentVector` Collection(Edm.Single) field with
 *   a vector search profile (HNSW) matching your embedding dimension.
 *   Configure via env: AZURE_SEARCH_ENDPOINT, AZURE_SEARCH_API_KEY,
 *   AZURE_SEARCH_INDEX_NAME.
 *   upsert() -> SearchClient.mergeOrUploadDocuments()
 *   search()  -> SearchClient.search('*', { vectorSearchOptions: { queries: [...] }, filter: `ownerId eq '${ownerId}'` })
 *   deleteDocument() -> SearchClient.deleteDocuments() for all chunk ids of that document
 *
 * This stub implements the same VectorStore interface as chroma.ts so it's a
 * drop-in swap once implemented — set VECTOR_DB_PROVIDER=azure-ai-search to select it.
 */
export const azureSearchVectorStore: VectorStore = {
  id: 'azure-ai-search',

  async upsert(_chunks: VectorChunk[], _embeddings: number[][]): Promise<void> {
    throw new Error(
      'Azure AI Search vector store is not yet implemented. See lib/db/vector/azureSearch.ts for wiring instructions, or set VECTOR_DB_PROVIDER=chroma.'
    );
  },

  async search(
    _queryEmbedding: number[],
    _opts: { ownerId: string; topK?: number; documentId?: string }
  ): Promise<VectorSearchResult[]> {
    throw new Error(
      'Azure AI Search vector store is not yet implemented. See lib/db/vector/azureSearch.ts for wiring instructions, or set VECTOR_DB_PROVIDER=chroma.'
    );
  },

  async getAllChunks(_documentId: string, _ownerId: string): Promise<VectorChunk[]> {
    throw new Error(
      'Azure AI Search vector store is not yet implemented. See lib/db/vector/azureSearch.ts for wiring instructions, or set VECTOR_DB_PROVIDER=chroma.'
    );
  },

  async deleteDocument(_documentId: string): Promise<void> {
    throw new Error(
      'Azure AI Search vector store is not yet implemented. See lib/db/vector/azureSearch.ts for wiring instructions, or set VECTOR_DB_PROVIDER=chroma.'
    );
  },
};
