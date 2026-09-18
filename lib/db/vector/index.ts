import { env } from '@/lib/env';
import { VectorStore } from './types';
import { pgvectorStore } from './pgvector';
import { chromaVectorStore } from './chroma';
import { faissVectorStore } from './faiss';
import { azureSearchVectorStore } from './azureSearch';

/**
 * pgvector is the default: it lives in the Postgres database the app already
 * needs, so a deployment has one datastore rather than two, and it works on
 * serverless platforms where Chroma (a long-running process with a disk)
 * cannot run. Chroma remains supported for self-hosted deployments that
 * already run it.
 */
export function getVectorStore(): VectorStore {
  switch (env.vectorDbProvider) {
    case 'chroma':
      return chromaVectorStore;
    case 'faiss':
      return faissVectorStore;
    case 'azure-ai-search':
      return azureSearchVectorStore;
    case 'pgvector':
    default:
      return pgvectorStore;
  }
}

export type { VectorStore } from './types';
