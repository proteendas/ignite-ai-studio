export const env = {
  chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
  sqlitePath: process.env.SQLITE_PATH || './data/app.db',
  vectorDbProvider: (process.env.VECTOR_DB_PROVIDER || 'chroma') as
    | 'chroma'
    | 'faiss'
    | 'azure-ai-search',
  aiProvider: process.env.AI_PROVIDER || '',
  connectionType: (process.env.CONNECTION_TYPE || 'cloud') as 'cloud' | 'local' | 'auto',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
  ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
  nextAuthSecret: process.env.NEXTAUTH_SECRET || 'dev-insecure-secret-change-me',
  nextAuthUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000',

  // Transactional email (password reset + email verification) via Resend.
  // Optional: with no key the mailer logs links to the server console instead
  // of sending, so the flows still work end-to-end in local development.
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'IgniteAI Studio <onboarding@resend.dev>',

  // Flips the whole app to the maintenance page (see middleware.ts).
  maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
};
