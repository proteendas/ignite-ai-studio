import { env } from '@/lib/env';
import { VectorStore } from './types';
import { chromaVectorStore } from './chroma';
import { faissVectorStore } from './faiss';
import { azureSearchVectorStore } from './azureSearch';

export function getVectorStore(): VectorStore {
  switch (env.vectorDbProvider) {
    case 'faiss':
      return faissVectorStore;
    case 'azure-ai-search':
      return azureSearchVectorStore;
    case 'chroma':
    default:
      return chromaVectorStore;
  }
}

export type { VectorStore } from './types';
