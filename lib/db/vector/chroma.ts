import { ChromaClient } from 'chromadb';
import { env } from '@/lib/env';
import { VectorChunk, VectorSearchResult } from '@/lib/types';
import { VectorStore } from './types';

const COLLECTION_NAME = 'genericai_documents';

type ChromaCollection = Awaited<ReturnType<ChromaClient['getOrCreateCollection']>>;

let clientSingleton: ChromaClient | undefined;
let collectionPromise: Promise<ChromaCollection> | undefined;

function getClient(): ChromaClient {
  if (!clientSingleton) {
    clientSingleton = new ChromaClient({ path: env.chromaUrl });
  }
  return clientSingleton;
}

function getCollection(): Promise<ChromaCollection> {
  if (!collectionPromise) {
    collectionPromise = getClient().getOrCreateCollection({ name: COLLECTION_NAME });
  }
  return collectionPromise;
}

export const chromaVectorStore: VectorStore = {
  id: 'chroma',

  async upsert(chunks: VectorChunk[], embeddings: number[][]): Promise<void> {
    if (chunks.length === 0) return;
    if (chunks.length !== embeddings.length) {
      throw new Error('chunks and embeddings length mismatch');
    }
    const collection = await getCollection();
    await collection.upsert({
      ids: chunks.map((c) => c.id),
      embeddings,
      documents: chunks.map((c) => c.text),
      metadatas: chunks.map((c) => ({
        documentId: c.documentId,
        ownerId: c.ownerId,
        filename: c.filename,
        chunkIndex: c.chunkIndex,
      })),
    });
  },

  async search(
    queryEmbedding: number[],
    opts: { ownerId: string; topK?: number; documentId?: string }
  ): Promise<VectorSearchResult[]> {
    const collection = await getCollection();
    const where: Record<string, unknown> = opts.documentId
      ? { $and: [{ ownerId: opts.ownerId }, { documentId: opts.documentId }] }
      : { ownerId: opts.ownerId };

    const result = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: opts.topK ?? 5,
      where,
    });

    const ids: string[] = result.ids?.[0] ?? [];
    const documents = result.documents?.[0] ?? [];
    const metadatas = result.metadatas?.[0] ?? [];
    const distances = result.distances?.[0] ?? [];

    return ids.map((id: string, i: number) => {
      const meta = (metadatas[i] ?? {}) as Record<string, unknown>;
      const distance = distances[i] ?? 0;
      return {
        id: String(id),
        documentId: String(meta.documentId ?? ''),
        ownerId: String(meta.ownerId ?? ''),
        filename: String(meta.filename ?? ''),
        chunkIndex: Number(meta.chunkIndex ?? 0),
        text: String(documents[i] ?? ''),
        score: 1 - distance,
      };
    });
  },

  async getAllChunks(documentId: string, ownerId: string): Promise<VectorChunk[]> {
    const collection = await getCollection();
    const result = await collection.get({
      where: { $and: [{ ownerId }, { documentId }] },
    });

    const ids: string[] = result.ids ?? [];
    const documents = result.documents ?? [];
    const metadatas = result.metadatas ?? [];

    const chunks: VectorChunk[] = ids.map((id: string, i: number) => {
      const meta = (metadatas[i] ?? {}) as Record<string, unknown>;
      return {
        id: String(id),
        documentId: String(meta.documentId ?? ''),
        ownerId: String(meta.ownerId ?? ''),
        filename: String(meta.filename ?? ''),
        chunkIndex: Number(meta.chunkIndex ?? 0),
        text: String(documents[i] ?? ''),
      };
    });

    return chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
  },

  async deleteDocument(documentId: string): Promise<void> {
    const collection = await getCollection();
    await collection.delete({ where: { documentId } });
  },
};
