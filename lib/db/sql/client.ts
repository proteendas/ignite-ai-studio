import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { env } from '@/lib/env';
import type { DocumentRecord } from '@/lib/types';

// ---------------------------------------------------------------------------
// Singleton connection (Next.js dev hot-reload safe: stash on globalThis under
// a unique symbol so repeated module re-evaluation during hot reload doesn't
// re-open the sqlite file / re-run schema+seed on every edit).
// ---------------------------------------------------------------------------

const DB_SYMBOL = Symbol.for('igniteai-studio.sqlite-db');

interface GlobalWithDb {
  [key: symbol]: Database.Database | undefined;
}

const globalForDb = globalThis as unknown as GlobalWithDb;

/**
 * Next.js's standalone build output bundles server code via webpack/Next's
 * file tracing, so `__dirname` at runtime does not reliably resolve back to
 * this source file's original location (lib/db/sql/). We try several
 * plausible locations instead of assuming one — this file's own directory
 * (works in dev / ts-node-style runs), the project root's lib/db/sql
 * (works if cwd is the app root, e.g. `next start`), and process.cwd()-based
 * variants for the standalone Docker runtime, which the Dockerfile also
 * copies schema.sql into explicitly to cover.
 */
function resolveSchemaPath(): string {
  const candidates = [
    path.join(__dirname, 'schema.sql'),
    path.join(process.cwd(), 'lib', 'db', 'sql', 'schema.sql'),
    path.join(process.cwd(), '.next', 'standalone', 'lib', 'db', 'sql', 'schema.sql'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Could not locate schema.sql. Tried: ${candidates.join(', ')}. ` +
      'If running a custom deployment layout, ensure lib/db/sql/schema.sql is copied ' +
      'alongside the server output.'
  );
}

function openDb(): Database.Database {
  const sqlitePath = env.sqlitePath;
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

  const db = new Database(sqlitePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaSql = fs.readFileSync(resolveSchemaPath(), 'utf-8');
  db.exec(schemaSql);

  migrateExistingTables(db);
  seedDemoDataIfEmpty(db);

  return db;
}

/**
 * schema.sql only uses CREATE TABLE IF NOT EXISTS, which cannot add columns to
 * tables that already exist in a deployed database. Columns added after the
 * initial release are back-filled here, guarded by PRAGMA table_info so the
 * migration is idempotent and safe to run on every startup.
 */
function migrateExistingTables(db: Database.Database): void {
  const ensureColumn = (table: string, column: string, ddl: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  };

  ensureColumn('chat_messages', 'token_count', 'token_count INTEGER NOT NULL DEFAULT 0');
  ensureColumn('chat_messages', 'document_refs', 'document_refs TEXT');
  ensureColumn('user_preferences', 'connection_type', "connection_type TEXT DEFAULT 'cloud'");
  ensureColumn('user_preferences', 'auto_approve_json', 'auto_approve_json TEXT');
}

export function getDb(): Database.Database {
  if (!globalForDb[DB_SYMBOL]) {
    globalForDb[DB_SYMBOL] = openDb();
  }
  return globalForDb[DB_SYMBOL]!;
}

// ---------------------------------------------------------------------------
// Demo data seeding for products/orders (Level 2 NL -> SQL routing demo data).
// ---------------------------------------------------------------------------

function seedDemoDataIfEmpty(db: Database.Database): void {
  const row = db.prepare('SELECT COUNT(*) as count FROM products').get() as {
    count: number;
  };
  if (row.count > 0) {
    return;
  }

  const insertProduct = db.prepare(
    `INSERT INTO products (id, name, category, price, stock) VALUES (?, ?, ?, ?, ?)`
  );
  const insertOrder = db.prepare(
    `INSERT INTO orders (id, product_id, customer_name, quantity, order_date, status) VALUES (?, ?, ?, ?, ?, ?)`
  );

  const products: Array<[number, string, string, number, number]> = [
    [1, 'Wireless Noise-Cancelling Headphones', 'Electronics', 149.99, 42],
    [2, 'Mechanical Keyboard', 'Electronics', 89.5, 30],
    [3, '27-inch 4K Monitor', 'Electronics', 329.0, 18],
    [4, 'Ergonomic Office Chair', 'Furniture', 219.99, 12],
    [5, 'Standing Desk', 'Furniture', 399.0, 8],
    [6, 'Desk Lamp with USB-C Charging', 'Furniture', 34.99, 60],
    [7, 'Insulated Steel Water Bottle', 'Accessories', 24.99, 100],
    [8, 'Leather Laptop Sleeve', 'Accessories', 45.0, 55],
  ];

  const insertProductsTx = db.transaction(
    (rows: Array<[number, string, string, number, number]>) => {
      for (const rowValues of rows) {
        insertProduct.run(...rowValues);
      }
    }
  );
  insertProductsTx(products);

  const orders: Array<[number, number, string, number, string, string]> = [
    [1, 1, 'Alice Nguyen', 1, '2026-06-01', 'delivered'],
    [2, 2, 'Brian Foster', 2, '2026-06-03', 'delivered'],
    [3, 3, 'Carla Mendes', 1, '2026-06-10', 'shipped'],
    [4, 4, 'David Osei', 1, '2026-06-14', 'delivered'],
    [5, 5, 'Elena Petrova', 1, '2026-06-20', 'pending'],
    [6, 1, 'Farid Haidari', 3, '2026-06-22', 'shipped'],
    [7, 6, 'Grace Lin', 2, '2026-06-25', 'delivered'],
    [8, 7, 'Hassan Ali', 5, '2026-06-28', 'delivered'],
    [9, 8, 'Isla Thompson', 1, '2026-07-02', 'shipped'],
    [10, 2, 'Jamal Carter', 1, '2026-07-05', 'pending'],
    [11, 3, 'Kira Yamamoto', 2, '2026-07-10', 'pending'],
    [12, 5, 'Liam O\'Brien', 1, '2026-07-14', 'shipped'],
  ];

  const insertOrdersTx = db.transaction(
    (rows: Array<[number, number, string, number, string, string]>) => {
      for (const rowValues of rows) {
        insertOrder.run(...rowValues);
      }
    }
  );
  insertOrdersTx(orders);
}

// ---------------------------------------------------------------------------
// Typed row shapes (snake_case, as stored in sqlite)
// ---------------------------------------------------------------------------

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  name: string | null;
  provider: string | null;
  onboarded_at: string | null;
  created_at: string;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  provider: string | null;
  onboardedAt: string | null;
  createdAt: string;
}

interface DocumentRow {
  id: string;
  owner_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  chunk_count: number;
  error: string | null;
  created_at: string;
}

interface ChatThreadRow {
  id: string;
  owner_id: string;
  title: string | null;
  pinned: number;
  created_at: string;
  updated_at: string;
}

export interface ChatThreadRecord {
  id: string;
  ownerId: string;
  title: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ChatMessageRow {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  meta_json: string | null;
  token_count: number;
  document_refs: string | null;
  created_at: string;
}

export interface ChatMessageRecord {
  id: string;
  threadId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  metaJson: string | null;
  tokenCount: number;
  /** JSON array of document ids this message drew on, or null. */
  documentRefs: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapUserRow(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    provider: row.provider,
    onboardedAt: row.onboarded_at,
    createdAt: row.created_at,
  };
}

function mapDocumentRow(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status as DocumentRecord['status'],
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
    error: row.error ?? undefined,
  };
}

function mapChatThreadRow(row: ChatThreadRow): ChatThreadRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChatMessageRow(row: ChatMessageRow): ChatMessageRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role as ChatMessageRecord['role'],
    content: row.content,
    metaJson: row.meta_json,
    tokenCount: row.token_count ?? 0,
    documentRefs: row.document_refs,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/**
 * Canonicalizes an email for storage and lookup. Emails are case-insensitive
 * in practice, and mobile keyboards / autofill routinely change the casing of
 * what a user types. Normalizing to lowercase + trimmed in this single place
 * guarantees registration, credentials sign-in, and OAuth auto-provisioning
 * all agree on the same key — otherwise signing up as "User@x.com" and later
 * signing in as "user@x.com" would fail lookup and surface as a bogus
 * "incorrect password" error.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getUserByEmail(email: string): UserRecord | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(normalizeEmail(email)) as UserRow | undefined;
  return row ? mapUserRow(row) : null;
}

export function createUser(user: {
  id: string;
  email: string;
  passwordHash?: string | null;
  name?: string | null;
  provider?: string;
}): UserRecord {
  const db = getDb();
  const email = normalizeEmail(user.email);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, name, provider) VALUES (?, ?, ?, ?, ?)`
  ).run(
    user.id,
    email,
    user.passwordHash ?? null,
    user.name ?? null,
    user.provider ?? 'credentials'
  );
  const created = getUserByEmail(email);
  if (!created) {
    throw new Error('Failed to read back created user');
  }
  return created;
}

export function getUserById(id: string): UserRecord | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? mapUserRow(row) : null;
}

export function updateUserPassword(userId: string, passwordHash: string): void {
  const db = getDb();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
}

export function markOnboarded(ownerId: string): void {
  const db = getDb();
  db.prepare(`UPDATE users SET onboarded_at = datetime('now') WHERE id = ?`).run(ownerId);
}

/** Cascade-deletes every row belonging to a user across all tables (account deletion). */
export function deleteUserData(ownerId: string): void {
  const db = getDb();
  const tables = [
    'documents',
    'chat_threads',
    'user_preferences',
    'user_api_keys',
    'user_connections',
    'agent_actions',
    'generated_content',
    'usage_events',
    'request_logs',
    'error_logs',
    'activity_events',
  ];
  const tx = db.transaction(() => {
    // chat_messages/thread_summaries are keyed by thread; delete via threads first.
    const threadIds = (
      db.prepare('SELECT id FROM chat_threads WHERE owner_id = ?').all(ownerId) as { id: string }[]
    ).map((r) => r.id);
    const delMsgs = db.prepare('DELETE FROM chat_messages WHERE thread_id = ?');
    const delSummary = db.prepare('DELETE FROM thread_summaries WHERE thread_id = ?');
    for (const tid of threadIds) {
      delMsgs.run(tid);
      delSummary.run(tid);
    }

    for (const table of tables) {
      db.prepare(`DELETE FROM ${table} WHERE owner_id = ?`).run(ownerId);
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(ownerId);
  });
  tx();
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export function insertDocument(doc: {
  id: string;
  ownerId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status?: string;
  chunkCount?: number;
  error?: string | null;
}): DocumentRecord {
  const db = getDb();
  db.prepare(
    `INSERT INTO documents (id, owner_id, filename, mime_type, size_bytes, status, chunk_count, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    doc.id,
    doc.ownerId,
    doc.filename,
    doc.mimeType,
    doc.sizeBytes,
    doc.status ?? 'processing',
    doc.chunkCount ?? 0,
    doc.error ?? null
  );
  const created = getDocumentById(doc.id);
  if (!created) {
    throw new Error('Failed to read back created document');
  }
  return created;
}

export function updateDocumentStatus(
  id: string,
  status: DocumentRecord['status'],
  chunkCount?: number,
  error?: string | null
): void {
  const db = getDb();
  if (chunkCount !== undefined) {
    db.prepare(
      `UPDATE documents SET status = ?, chunk_count = ?, error = ? WHERE id = ?`
    ).run(status, chunkCount, error ?? null, id);
  } else {
    db.prepare(`UPDATE documents SET status = ?, error = ? WHERE id = ?`).run(
      status,
      error ?? null,
      id
    );
  }
}

export function listDocumentsByOwner(ownerId: string): DocumentRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM documents WHERE owner_id = ? ORDER BY created_at DESC')
    .all(ownerId) as DocumentRow[];
  return rows.map(mapDocumentRow);
}

export function getDocumentById(id: string): DocumentRecord | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as
    | DocumentRow
    | undefined;
  return row ? mapDocumentRow(row) : null;
}

export function deleteDocument(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
}

// ---------------------------------------------------------------------------
// Chat threads / messages
// ---------------------------------------------------------------------------

export function createChatThread(thread: {
  id: string;
  ownerId: string;
  title?: string | null;
}): ChatThreadRecord {
  const db = getDb();
  db.prepare(
    `INSERT INTO chat_threads (id, owner_id, title) VALUES (?, ?, ?)`
  ).run(thread.id, thread.ownerId, thread.title ?? null);
  const row = db
    .prepare('SELECT * FROM chat_threads WHERE id = ?')
    .get(thread.id) as ChatThreadRow;
  return mapChatThreadRow(row);
}

export function getChatThread(id: string): ChatThreadRecord | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM chat_threads WHERE id = ?').get(id) as
    | ChatThreadRow
    | undefined;
  return row ? mapChatThreadRow(row) : null;
}

/** Lists a user's threads, pinned first, then most-recently-updated. */
export function listChatThreads(ownerId: string): ChatThreadRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM chat_threads WHERE owner_id = ? ORDER BY pinned DESC, updated_at DESC`
    )
    .all(ownerId) as ChatThreadRow[];
  return rows.map(mapChatThreadRow);
}

export function updateChatThread(
  id: string,
  updates: { title?: string; pinned?: boolean }
): void {
  const db = getDb();
  if (updates.title !== undefined) {
    db.prepare(`UPDATE chat_threads SET title = ?, updated_at = datetime('now') WHERE id = ?`).run(
      updates.title,
      id
    );
  }
  if (updates.pinned !== undefined) {
    db.prepare(`UPDATE chat_threads SET pinned = ?, updated_at = datetime('now') WHERE id = ?`).run(
      updates.pinned ? 1 : 0,
      id
    );
  }
}

export function touchChatThread(id: string): void {
  const db = getDb();
  db.prepare(`UPDATE chat_threads SET updated_at = datetime('now') WHERE id = ?`).run(id);
}

export function deleteChatThread(id: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM chat_messages WHERE thread_id = ?').run(id);
    db.prepare('DELETE FROM chat_threads WHERE id = ?').run(id);
  });
  tx();
}

export function insertChatMessage(msg: {
  id: string;
  threadId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  metaJson?: string | null;
  tokenCount?: number;
  documentRefs?: string | null;
}): ChatMessageRecord {
  const db = getDb();
  db.prepare(
    `INSERT INTO chat_messages (id, thread_id, role, content, meta_json, token_count, document_refs)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    msg.id,
    msg.threadId,
    msg.role,
    msg.content,
    msg.metaJson ?? null,
    msg.tokenCount ?? 0,
    msg.documentRefs ?? null
  );
  db.prepare(`UPDATE chat_threads SET updated_at = datetime('now') WHERE id = ?`).run(msg.threadId);
  const row = db
    .prepare('SELECT * FROM chat_messages WHERE id = ?')
    .get(msg.id) as ChatMessageRow;
  return mapChatMessageRow(row);
}

/** All messages for a thread, oldest -> newest (for rendering a full thread). */
export function listThreadMessages(threadId: string): ChatMessageRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC')
    .all(threadId) as ChatMessageRow[];
  return rows.map(mapChatMessageRow);
}

/**
 * Returns the last `limit` messages for a thread ordered oldest -> newest,
 * suitable for building a "last N exchanges" context window.
 */
export function getRecentMessages(threadId: string, limit = 6): ChatMessageRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(threadId, limit) as ChatMessageRow[];
  return rows.reverse().map(mapChatMessageRow);
}

/** Total messages currently stored for a thread (drives summary regeneration). */
export function countThreadMessages(threadId: string): number {
  const db = getDb();
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE thread_id = ?')
    .get(threadId) as { n: number };
  return row.n;
}

// ---------------------------------------------------------------------------
// Thread summaries (token efficiency: compress history older than the window)
// ---------------------------------------------------------------------------

export interface ThreadSummaryRecord {
  threadId: string;
  summary: string;
  throughMessageCount: number;
  updatedAt: string;
}

export function getThreadSummary(threadId: string): ThreadSummaryRecord | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM thread_summaries WHERE thread_id = ?')
    .get(threadId) as
    | { thread_id: string; summary: string; through_message_count: number; updated_at: string }
    | undefined;
  if (!row) return null;
  return {
    threadId: row.thread_id,
    summary: row.summary,
    throughMessageCount: row.through_message_count,
    updatedAt: row.updated_at,
  };
}

export function upsertThreadSummary(
  threadId: string,
  summary: string,
  throughMessageCount: number
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO thread_summaries (thread_id, summary, through_message_count, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(thread_id) DO UPDATE SET
       summary = excluded.summary,
       through_message_count = excluded.through_message_count,
       updated_at = datetime('now')`
  ).run(threadId, summary, throughMessageCount);
}

// ---------------------------------------------------------------------------
// Agent actions (HITL audit trail + paused-loop state)
// ---------------------------------------------------------------------------

export type AgentActionStatus = 'proposed' | 'approved' | 'rejected' | 'executed' | 'failed';

export interface AgentActionRecord {
  id: string;
  threadId: string;
  ownerId: string;
  tool: string;
  summary: string;
  payloadJson: string;
  status: AgentActionStatus;
  resultJson: string | null;
  stateJson: string | null;
  decidedAt: string | null;
  createdAt: string;
}

interface AgentActionRow {
  id: string;
  thread_id: string;
  owner_id: string;
  tool: string;
  summary: string;
  payload_json: string;
  status: string;
  result_json: string | null;
  state_json: string | null;
  decided_at: string | null;
  created_at: string;
}

function mapAgentActionRow(row: AgentActionRow): AgentActionRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    ownerId: row.owner_id,
    tool: row.tool,
    summary: row.summary,
    payloadJson: row.payload_json,
    status: row.status as AgentActionStatus,
    resultJson: row.result_json,
    stateJson: row.state_json,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

export function insertAgentAction(action: {
  id: string;
  threadId: string;
  ownerId: string;
  tool: string;
  summary: string;
  payloadJson: string;
  status?: AgentActionStatus;
  stateJson?: string | null;
}): AgentActionRecord {
  const db = getDb();
  db.prepare(
    `INSERT INTO agent_actions (id, thread_id, owner_id, tool, summary, payload_json, status, state_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    action.id,
    action.threadId,
    action.ownerId,
    action.tool,
    action.summary,
    action.payloadJson,
    action.status ?? 'proposed',
    action.stateJson ?? null
  );
  const row = db.prepare('SELECT * FROM agent_actions WHERE id = ?').get(action.id) as AgentActionRow;
  return mapAgentActionRow(row);
}

export function getAgentAction(id: string): AgentActionRecord | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM agent_actions WHERE id = ?').get(id) as
    | AgentActionRow
    | undefined;
  return row ? mapAgentActionRow(row) : null;
}

export function updateAgentAction(
  id: string,
  updates: {
    status?: AgentActionStatus;
    resultJson?: string | null;
    payloadJson?: string;
    decided?: boolean;
  }
): void {
  const db = getDb();
  if (updates.status !== undefined) {
    db.prepare('UPDATE agent_actions SET status = ? WHERE id = ?').run(updates.status, id);
  }
  if (updates.resultJson !== undefined) {
    db.prepare('UPDATE agent_actions SET result_json = ? WHERE id = ?').run(updates.resultJson, id);
  }
  if (updates.payloadJson !== undefined) {
    db.prepare('UPDATE agent_actions SET payload_json = ? WHERE id = ?').run(updates.payloadJson, id);
  }
  if (updates.decided) {
    db.prepare(`UPDATE agent_actions SET decided_at = datetime('now') WHERE id = ?`).run(id);
  }
}

export function listAgentActions(threadId: string, ownerId: string, limit = 100): AgentActionRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM agent_actions WHERE thread_id = ? AND owner_id = ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(threadId, ownerId, limit) as AgentActionRow[];
  return rows.map(mapAgentActionRow);
}

// ---------------------------------------------------------------------------
// User connections (encrypted external-service credentials for agent tools)
// ---------------------------------------------------------------------------

export interface UserConnectionRecord {
  id: string;
  ownerId: string;
  service: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  label: string;
  createdAt: string;
}

interface UserConnectionRow {
  id: string;
  owner_id: string;
  service: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  label: string;
  created_at: string;
}

function mapConnectionRow(row: UserConnectionRow): UserConnectionRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    service: row.service,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.auth_tag,
    label: row.label,
    createdAt: row.created_at,
  };
}

export function upsertUserConnection(conn: {
  id: string;
  ownerId: string;
  service: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  label?: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO user_connections (id, owner_id, service, ciphertext, iv, auth_tag, label)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id, service) DO UPDATE SET
       ciphertext = excluded.ciphertext,
       iv = excluded.iv,
       auth_tag = excluded.auth_tag,
       label = excluded.label,
       created_at = datetime('now')`
  ).run(conn.id, conn.ownerId, conn.service, conn.ciphertext, conn.iv, conn.authTag, conn.label ?? '');
}

export function getUserConnection(ownerId: string, service: string): UserConnectionRecord | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM user_connections WHERE owner_id = ? AND service = ?')
    .get(ownerId, service) as UserConnectionRow | undefined;
  return row ? mapConnectionRow(row) : null;
}

export function listUserConnections(ownerId: string): UserConnectionRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM user_connections WHERE owner_id = ? ORDER BY service')
    .all(ownerId) as UserConnectionRow[];
  return rows.map(mapConnectionRow);
}

export function deleteUserConnection(ownerId: string, service: string): void {
  const db = getDb();
  db.prepare('DELETE FROM user_connections WHERE owner_id = ? AND service = ?').run(
    ownerId,
    service
  );
}

// ---------------------------------------------------------------------------
// Embedding cache (never embed the same text twice for a provider+model)
// ---------------------------------------------------------------------------

/**
 * Returns the cached vectors for the given content hashes as a hash -> vector
 * map. Hashes with no cache entry are simply absent from the map.
 */
export function getCachedEmbeddings(
  hashes: string[],
  provider: string,
  model: string
): Map<string, number[]> {
  const db = getDb();
  const out = new Map<string, number[]>();
  const stmt = db.prepare(
    'SELECT vector_json FROM embedding_cache WHERE content_hash = ? AND provider = ? AND model = ?'
  );
  for (const hash of hashes) {
    const row = stmt.get(hash, provider, model) as { vector_json: string } | undefined;
    if (row) {
      try {
        out.set(hash, JSON.parse(row.vector_json) as number[]);
      } catch {
        /* corrupt cache entry — treat as miss */
      }
    }
  }
  return out;
}

export function putCachedEmbeddings(
  entries: { hash: string; vector: number[] }[],
  provider: string,
  model: string
): void {
  if (entries.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO embedding_cache (content_hash, provider, model, vector_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(content_hash, provider, model) DO NOTHING`
  );
  const tx = db.transaction((rows: { hash: string; vector: number[] }[]) => {
    for (const row of rows) stmt.run(row.hash, provider, model, JSON.stringify(row.vector));
  });
  tx(entries);
}

// ---------------------------------------------------------------------------
// Read-only query execution for the Level 2 NL -> SQL router.
// ---------------------------------------------------------------------------

/**
 * Executes a single read-only SQL statement with parameters.
 *
 * This intentionally uses `db.prepare(sql).all(params)` rather than
 * `db.exec(sql)`. `better-sqlite3`'s `prepare()` only ever compiles a single
 * SQL statement (it throws if given more than one), which prevents stacked
 * ("SQL injection via multi-statement") queries at the driver level. This
 * function does not itself validate that `sql` is a SELECT / read-only
 * statement — that validation is the responsibility of the NL-to-SQL router
 * module that calls this.
 */
export function runReadOnlyQuery(sql: string, params: unknown[] = []): unknown[] {
  const db = getDb();
  return db.prepare(sql).all(...params);
}

// ---------------------------------------------------------------------------
// User preferences
// ---------------------------------------------------------------------------

export type ConnectionType = 'cloud' | 'local' | 'auto';

export interface UserPreferences {
  ownerId: string;
  defaultProvider: string | null;
  defaultModel: string | null;
  defaultTone: string;
  theme: string;
  connectionType: ConnectionType;
  /** Map of tool name -> true for tools the user auto-approves (HITL opt-in). */
  autoApprove: Record<string, boolean>;
}

export function getUserPreferences(ownerId: string): UserPreferences {
  const db = getDb();
  const row = db.prepare('SELECT * FROM user_preferences WHERE owner_id = ?').get(ownerId) as
    | {
        owner_id: string;
        default_provider: string | null;
        default_model: string | null;
        default_tone: string | null;
        theme: string | null;
        connection_type: string | null;
        auto_approve_json: string | null;
      }
    | undefined;
  let autoApprove: Record<string, boolean> = {};
  if (row?.auto_approve_json) {
    try {
      autoApprove = JSON.parse(row.auto_approve_json) as Record<string, boolean>;
    } catch {
      autoApprove = {};
    }
  }
  return {
    ownerId,
    defaultProvider: row?.default_provider ?? null,
    defaultModel: row?.default_model ?? null,
    defaultTone: row?.default_tone ?? 'professional',
    theme: row?.theme ?? 'dark',
    connectionType: (row?.connection_type as ConnectionType) ?? 'cloud',
    autoApprove,
  };
}

export function upsertUserPreferences(
  ownerId: string,
  prefs: Partial<Omit<UserPreferences, 'ownerId'>>
): UserPreferences {
  const db = getDb();
  const current = getUserPreferences(ownerId);
  const next = { ...current, ...prefs };
  db.prepare(
    `INSERT INTO user_preferences (owner_id, default_provider, default_model, default_tone, theme, connection_type, auto_approve_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id) DO UPDATE SET
       default_provider = excluded.default_provider,
       default_model = excluded.default_model,
       default_tone = excluded.default_tone,
       theme = excluded.theme,
       connection_type = excluded.connection_type,
       auto_approve_json = excluded.auto_approve_json`
  ).run(
    ownerId,
    next.defaultProvider,
    next.defaultModel,
    next.defaultTone,
    next.theme,
    next.connectionType,
    JSON.stringify(next.autoApprove ?? {})
  );
  return next;
}

// ---------------------------------------------------------------------------
// User API keys (encrypted; see lib/crypto.ts)
// ---------------------------------------------------------------------------

export interface UserApiKeyRecord {
  id: string;
  ownerId: string;
  provider: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  keyPreview: string;
  createdAt: string;
}

interface UserApiKeyRow {
  id: string;
  owner_id: string;
  provider: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  key_preview: string;
  created_at: string;
}

function mapApiKeyRow(row: UserApiKeyRow): UserApiKeyRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    provider: row.provider,
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.auth_tag,
    keyPreview: row.key_preview,
    createdAt: row.created_at,
  };
}

export function upsertUserApiKey(key: {
  id: string;
  ownerId: string;
  provider: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  keyPreview: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO user_api_keys (id, owner_id, provider, ciphertext, iv, auth_tag, key_preview)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id, provider) DO UPDATE SET
       ciphertext = excluded.ciphertext,
       iv = excluded.iv,
       auth_tag = excluded.auth_tag,
       key_preview = excluded.key_preview,
       created_at = datetime('now')`
  ).run(key.id, key.ownerId, key.provider, key.ciphertext, key.iv, key.authTag, key.keyPreview);
}

export function listUserApiKeys(ownerId: string): UserApiKeyRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM user_api_keys WHERE owner_id = ? ORDER BY provider')
    .all(ownerId) as UserApiKeyRow[];
  return rows.map(mapApiKeyRow);
}

export function getUserApiKey(ownerId: string, provider: string): UserApiKeyRecord | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM user_api_keys WHERE owner_id = ? AND provider = ?')
    .get(ownerId, provider) as UserApiKeyRow | undefined;
  return row ? mapApiKeyRow(row) : null;
}

export function deleteUserApiKey(ownerId: string, provider: string): void {
  const db = getDb();
  db.prepare('DELETE FROM user_api_keys WHERE owner_id = ? AND provider = ?').run(ownerId, provider);
}

// ---------------------------------------------------------------------------
// Generated content library
// ---------------------------------------------------------------------------

export interface GeneratedContentRecord {
  id: string;
  ownerId: string;
  documentId: string | null;
  contentType: string;
  tone: string;
  channel: string;
  output: string;
  createdAt: string;
}

interface GeneratedContentRow {
  id: string;
  owner_id: string;
  document_id: string | null;
  content_type: string;
  tone: string;
  channel: string;
  output: string;
  created_at: string;
}

function mapGeneratedContentRow(row: GeneratedContentRow): GeneratedContentRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    documentId: row.document_id,
    contentType: row.content_type,
    tone: row.tone,
    channel: row.channel,
    output: row.output,
    createdAt: row.created_at,
  };
}

export function saveGeneratedContent(item: {
  id: string;
  ownerId: string;
  documentId?: string | null;
  contentType: string;
  tone: string;
  channel: string;
  output: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO generated_content (id, owner_id, document_id, content_type, tone, channel, output)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    item.id,
    item.ownerId,
    item.documentId ?? null,
    item.contentType,
    item.tone,
    item.channel,
    item.output
  );
}

export function listGeneratedContent(ownerId: string): GeneratedContentRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM generated_content WHERE owner_id = ? ORDER BY created_at DESC')
    .all(ownerId) as GeneratedContentRow[];
  return rows.map(mapGeneratedContentRow);
}

export function deleteGeneratedContent(id: string, ownerId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM generated_content WHERE id = ? AND owner_id = ?').run(id, ownerId);
}

// ---------------------------------------------------------------------------
// Usage / logs / activity (observability + dashboard)
// ---------------------------------------------------------------------------

export function recordUsage(event: {
  id: string;
  ownerId: string;
  provider: string;
  kind: 'chat' | 'embed' | 'generate';
  promptTokens?: number;
  completionTokens?: number;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO usage_events (id, owner_id, provider, kind, prompt_tokens, completion_tokens)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    event.id,
    event.ownerId,
    event.provider,
    event.kind,
    event.promptTokens ?? 0,
    event.completionTokens ?? 0
  );
}

export interface UsageSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalRequests: number;
  byProvider: { provider: string; promptTokens: number; completionTokens: number; requests: number }[];
}

export function getUsageSummary(ownerId: string): UsageSummary {
  const db = getDb();
  const totals = db
    .prepare(
      `SELECT COALESCE(SUM(prompt_tokens),0) AS p, COALESCE(SUM(completion_tokens),0) AS c, COUNT(*) AS n
       FROM usage_events WHERE owner_id = ?`
    )
    .get(ownerId) as { p: number; c: number; n: number };
  const byProvider = db
    .prepare(
      `SELECT provider, COALESCE(SUM(prompt_tokens),0) AS p, COALESCE(SUM(completion_tokens),0) AS c, COUNT(*) AS n
       FROM usage_events WHERE owner_id = ? GROUP BY provider ORDER BY n DESC`
    )
    .all(ownerId) as { provider: string; p: number; c: number; n: number }[];
  return {
    totalPromptTokens: totals.p,
    totalCompletionTokens: totals.c,
    totalRequests: totals.n,
    byProvider: byProvider.map((r) => ({
      provider: r.provider,
      promptTokens: r.p,
      completionTokens: r.c,
      requests: r.n,
    })),
  };
}

export function recordRequestLog(log: {
  id: string;
  ownerId: string;
  route: string;
  status: number;
  latencyMs?: number;
  provider?: string | null;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO request_logs (id, owner_id, route, status, latency_ms, provider)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(log.id, log.ownerId, log.route, log.status, log.latencyMs ?? 0, log.provider ?? null);
}

export function recordErrorLog(log: {
  id: string;
  ownerId: string;
  route: string;
  message: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO error_logs (id, owner_id, route, message) VALUES (?, ?, ?, ?)`
  ).run(log.id, log.ownerId, log.route, log.message);
}

export function listRequestLogs(ownerId: string, limit = 50): Array<Record<string, unknown>> {
  const db = getDb();
  return db
    .prepare('SELECT * FROM request_logs WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(ownerId, limit) as Array<Record<string, unknown>>;
}

export function listErrorLogs(ownerId: string, limit = 50): Array<Record<string, unknown>> {
  const db = getDb();
  return db
    .prepare('SELECT * FROM error_logs WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(ownerId, limit) as Array<Record<string, unknown>>;
}

export interface ActivityEvent {
  id: string;
  ownerId: string;
  type: string;
  summary: string;
  createdAt: string;
}

export function recordActivity(event: {
  id: string;
  ownerId: string;
  type: string;
  summary: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO activity_events (id, owner_id, type, summary) VALUES (?, ?, ?, ?)`
  ).run(event.id, event.ownerId, event.type, event.summary);
}

export function listActivity(ownerId: string, limit = 20): ActivityEvent[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM activity_events WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(ownerId, limit) as {
    id: string;
    owner_id: string;
    type: string;
    summary: string;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    ownerId: r.owner_id,
    type: r.type,
    summary: r.summary,
    createdAt: r.created_at,
  }));
}

export function countDocuments(ownerId: string): number {
  const db = getDb();
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM documents WHERE owner_id = ?')
    .get(ownerId) as { n: number };
  return row.n;
}

export function countGeneratedContent(ownerId: string): number {
  const db = getDb();
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM generated_content WHERE owner_id = ?')
    .get(ownerId) as { n: number };
  return row.n;
}
