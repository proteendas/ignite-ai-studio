-- IgniteAI Studio - SQLite schema
-- All tables use CREATE TABLE IF NOT EXISTS so this file is safe to run on every startup.
-- Seed data for products/orders is NOT included here; it is inserted programmatically
-- in client.ts only when the products table is empty (see getDb()).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  name TEXT,
  provider TEXT DEFAULT 'credentials',
  onboarded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Conversation threads (formerly chat_sessions): named, pinnable, per-user.
CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  meta_json TEXT,
  token_count INTEGER NOT NULL DEFAULT 0,
  document_refs TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rolling summary of a thread's older history so prompts only carry the last
-- few turns verbatim (token efficiency). through_message_count records how
-- many messages the summary covers, so it is only regenerated when new
-- messages age out of the verbatim window.
CREATE TABLE IF NOT EXISTS thread_summaries (
  thread_id TEXT PRIMARY KEY,
  summary TEXT NOT NULL,
  through_message_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-user preferences / defaults.
-- connection_type: 'cloud' (API-key providers) | 'local' (Ollama) | 'auto'
-- (prefer local when an Ollama server is reachable, else cloud).
-- auto_approve_json: JSON map of tool name -> true for tools the user has
-- opted into auto-approving (off by default; low-risk read-only tools only).
CREATE TABLE IF NOT EXISTS user_preferences (
  owner_id TEXT PRIMARY KEY,
  default_provider TEXT,
  default_model TEXT,
  default_tone TEXT DEFAULT 'professional',
  theme TEXT DEFAULT 'dark',
  connection_type TEXT DEFAULT 'cloud',
  auto_approve_json TEXT
);

-- Encrypted per-user provider API keys (AES-256-GCM, see lib/crypto.ts).
-- Only ciphertext/iv/auth_tag + a display-safe preview are stored; never plaintext.
CREATE TABLE IF NOT EXISTS user_api_keys (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  key_preview TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, provider)
);

-- Saved generated content (content generator "save to library").
CREATE TABLE IF NOT EXISTS generated_content (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  document_id TEXT,
  content_type TEXT NOT NULL,
  tone TEXT NOT NULL,
  channel TEXT NOT NULL,
  output TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Usage tracking (tokens + request counts per provider) for the dashboard + observability.
CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL, -- 'chat' | 'embed' | 'generate'
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Request logs (per-user observability).
CREATE TABLE IF NOT EXISTS request_logs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  route TEXT NOT NULL,
  status INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Error logs (per-user observability).
CREATE TABLE IF NOT EXISTS error_logs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  route TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Activity feed events (dashboard recent activity).
CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'upload' | 'chat' | 'generate' | 'delete' | ...
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Agentic actions (HITL audit trail). Every tool call the agent proposes is
-- recorded here; write/side-effect actions stay 'proposed' until the user
-- decides. state_json carries the paused ReAct loop context so the loop can
-- resume after approval. Statuses: proposed | approved | rejected | executed | failed.
CREATE TABLE IF NOT EXISTS agent_actions (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  result_json TEXT,
  state_json TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- External service connections for agent tools (GitHub token, Gmail OAuth
-- refresh token, ...). Secrets are AES-256-GCM encrypted exactly like
-- user_api_keys; label is a display-safe hint (e.g. repo or email address).
CREATE TABLE IF NOT EXISTS user_connections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  service TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner_id, service)
);

-- Embedding cache: a chunk of text is never re-embedded for the same
-- provider+model (token efficiency). content_hash is sha256 of the text.
CREATE TABLE IF NOT EXISTS embedding_cache (
  content_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  vector_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (content_hash, provider, model)
);

-- Demo structured-data tables for Level 2 NL -> SQL routing.
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  stock INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  customer_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  order_date TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_threads_owner ON chat_threads(owner_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON chat_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_usage_owner ON usage_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_activity_owner ON activity_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_generated_owner ON generated_content(owner_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_thread ON agent_actions(thread_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_owner ON agent_actions(owner_id);
CREATE INDEX IF NOT EXISTS idx_connections_owner ON user_connections(owner_id);
