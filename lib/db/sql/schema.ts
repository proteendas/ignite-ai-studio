/**
 * Postgres schema, inlined as a string rather than read from a .sql file.
 *
 * Serverless bundlers (Vercel's file tracing) do not reliably ship loose
 * non-JS assets next to the compiled handler, and there is no dependable
 * `__dirname` at runtime. Keeping the DDL in a TypeScript module means it is
 * part of the bundle by construction, on every platform.
 *
 * Everything here is idempotent, so it is safe to run on every cold start.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  password_hash     TEXT,
  name              TEXT,
  provider          TEXT DEFAULT 'credentials',
  onboarded_at      TIMESTAMPTZ,
  email_verified_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  BIGINT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'processing',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversation threads: named, pinnable, per-user.
CREATE TABLE IF NOT EXISTS chat_threads (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL,
  title      TEXT,
  pinned     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id            TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL,
  role          TEXT NOT NULL,
  content       TEXT NOT NULL,
  meta_json     TEXT,
  token_count   INTEGER NOT NULL DEFAULT 0,
  document_refs TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rolling summary of a thread's older history so prompts only carry the last
-- few turns verbatim. through_message_count records how many messages the
-- summary covers, so it is only regenerated when new messages age out of the
-- verbatim window.
CREATE TABLE IF NOT EXISTS thread_summaries (
  thread_id             TEXT PRIMARY KEY,
  summary               TEXT NOT NULL,
  through_message_count INTEGER NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-user preferences / defaults.
-- connection_type: 'cloud' | 'local' | 'auto'
-- auto_approve_json: JSON map of tool name -> true for tools the user has
-- opted into auto-approving (off by default; read-only tools only).
CREATE TABLE IF NOT EXISTS user_preferences (
  owner_id          TEXT PRIMARY KEY,
  default_provider  TEXT,
  default_model     TEXT,
  default_tone      TEXT DEFAULT 'professional',
  theme             TEXT DEFAULT 'dark',
  connection_type   TEXT DEFAULT 'cloud',
  auto_approve_json TEXT
);

-- Encrypted per-user provider API keys (AES-256-GCM, see lib/crypto.ts).
-- Only ciphertext/iv/auth_tag + a display-safe preview are stored.
CREATE TABLE IF NOT EXISTS user_api_keys (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  provider    TEXT NOT NULL,
  ciphertext  TEXT NOT NULL,
  iv          TEXT NOT NULL,
  auth_tag    TEXT NOT NULL,
  key_preview TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, provider)
);

CREATE TABLE IF NOT EXISTS generated_content (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL,
  document_id  TEXT,
  content_type TEXT NOT NULL,
  tone         TEXT NOT NULL,
  channel      TEXT NOT NULL,
  output       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_events (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL,
  provider          TEXT NOT NULL,
  kind              TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS request_logs (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL,
  route      TEXT NOT NULL,
  status     INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  provider   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS error_logs (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL,
  route      TEXT NOT NULL,
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_events (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL,
  type       TEXT NOT NULL,
  summary    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agentic actions (HITL audit trail). state_json carries the paused ReAct loop
-- context so the loop can resume after approval.
CREATE TABLE IF NOT EXISTS agent_actions (
  id           TEXT PRIMARY KEY,
  thread_id    TEXT NOT NULL,
  owner_id     TEXT NOT NULL,
  tool         TEXT NOT NULL,
  summary      TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'proposed',
  result_json  TEXT,
  state_json   TEXT,
  decided_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_connections (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL,
  service    TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv         TEXT NOT NULL,
  auth_tag   TEXT NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, service)
);

-- Embedding cache: a chunk of text is never re-embedded for the same
-- provider+model. content_hash is sha256 of the text.
CREATE TABLE IF NOT EXISTS embedding_cache (
  content_hash TEXT NOT NULL,
  provider     TEXT NOT NULL,
  model        TEXT NOT NULL,
  vector_json  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (content_hash, provider, model)
);

-- Single-use, expiring tokens for password reset and email verification.
-- Only a sha256 hash of the token is stored, never the token itself.
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash  TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  kind        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Distributed rate limiting. Replaces the in-memory token bucket, which is
-- meaningless when each serverless invocation gets a fresh process.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key   TEXT PRIMARY KEY,
  hits         INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Demo structured-data tables for NL -> SQL routing.
CREATE TABLE IF NOT EXISTS products (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  category TEXT NOT NULL,
  price    DOUBLE PRECISION NOT NULL,
  stock    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  customer_name TEXT NOT NULL,
  quantity      INTEGER NOT NULL,
  order_date    DATE NOT NULL,
  status        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_owner       ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_threads_owner         ON chat_threads(owner_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread       ON chat_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_usage_owner           ON usage_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_activity_owner        ON activity_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_generated_owner       ON generated_content(owner_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_thread  ON agent_actions(thread_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_owner   ON agent_actions(owner_id);
CREATE INDEX IF NOT EXISTS idx_connections_owner     ON user_connections(owner_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_owner     ON auth_tokens(owner_id, kind);
CREATE INDEX IF NOT EXISTS idx_request_logs_owner    ON request_logs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_owner      ON error_logs(owner_id, created_at DESC);
`;

/**
 * The pgvector half of the schema, applied only when the vector store is
 * pgvector. Kept separate because CREATE EXTENSION requires privileges a
 * managed Postgres role may not have, and a Chroma-backed deployment should
 * not fail to boot over an extension it never uses.
 *
 * VECTOR(<dim>) is fixed at table-creation time and must match the embedding
 * model's output dimensions, so the dimension is interpolated by the caller.
 */
export function pgvectorSchemaSql(dimensions: number): string {
  return `
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_chunks (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  document_id TEXT NOT NULL,
  filename    TEXT NOT NULL DEFAULT '',
  chunk_index INTEGER NOT NULL,
  content     TEXT NOT NULL,
  embedding   VECTOR(${dimensions}) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_owner_doc ON document_chunks(owner_id, document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_doc       ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON document_chunks USING hnsw (embedding vector_cosine_ops);
`;
}
