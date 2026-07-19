export const env = {
  chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
  sqlitePath: process.env.SQLITE_PATH || './data/app.db',
  vectorDbProvider: (process.env.VECTOR_DB_PROVIDER || 'chroma') as
    | 'chroma'
    | 'faiss'
    | 'azure-ai-search',
  aiProvider: process.env.AI_PROVIDER || '',
  nextAuthSecret: process.env.NEXTAUTH_SECRET || 'dev-insecure-secret-change-me',
  nextAuthUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',
};
