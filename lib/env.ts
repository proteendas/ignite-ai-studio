export const env = {
  // ---- Relational store (Postgres) ----
  // Works with any Postgres: a local Docker container, Neon, Supabase, RDS.
  // On serverless, use a POOLED connection string (Neon's host contains
  // `-pooler`) — each instance opens its own pool, and a direct endpoint runs
  // out of connections quickly.
  databaseUrl: process.env.DATABASE_URL || '',
  pgPoolMax: Number(process.env.PG_POOL_MAX || '') || 5,

  // ---- Vector store ----
  vectorDbProvider: (process.env.VECTOR_DB_PROVIDER || 'pgvector') as
    | 'pgvector'
    | 'chroma'
    | 'faiss'
    | 'azure-ai-search',
  chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
  /**
   * Embedding width for the pgvector column. VECTOR(n) is fixed when the table
   * is created and must match the embedding model's output, so changing the
   * embeddings model means changing this AND re-ingesting. Defaults to 768
   * (Gemini's default); all-MiniLM-L6-v2 is 384, OpenAI text-embedding-3-small
   * is 1536.
   */
  embeddingDimensions: Number(process.env.EMBEDDING_DIMENSIONS || '') || 768,

  // ---- AI providers ----
  aiProvider: process.env.AI_PROVIDER || '',
  connectionType: (process.env.CONNECTION_TYPE || 'cloud') as 'cloud' | 'local' | 'auto',
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
  ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',

  // ---- Auth ----
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
