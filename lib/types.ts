export type Tone = 'professional' | 'casual' | 'technical' | 'persuasive' | 'formal' | 'playful';

export type Channel = 'linkedin' | 'x' | 'email' | 'landing-page' | 'blog' | 'ad-copy' | 'general';

export type ContentType =
  | 'social-post'
  | 'blog-draft'
  | 'ad-copy'
  | 'email'
  | 'product-description';

/**
 * Chat operating mode, always visible in the UI:
 * - 'grounded': retrieval runs before every response; answers come only from
 *   ingested documents (or SQL results) with citations.
 * - 'general': plain LLM chat, clearly labeled as NOT document-grounded.
 * - 'agent': the tool-calling agent loop (plan -> approve -> execute -> report).
 */
export type ChatMode = 'grounded' | 'general' | 'agent';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Citation {
  documentId: string;
  filename: string;
  chunkIndex: number;
  snippet: string;
  /** Cosine similarity of this chunk to the query (0-1), when available. */
  score?: number;
}

/** Client-facing view of one agentic action (HITL approval + activity log). */
export interface AgentActionView {
  id: string;
  threadId: string;
  tool: string;
  summary: string;
  payload: Record<string, unknown>;
  status: 'proposed' | 'approved' | 'rejected' | 'executed' | 'failed';
  result?: unknown;
  createdAt: string;
  decidedAt?: string | null;
}

export interface ChatResponseMeta {
  provider: string;
  route: 'document' | 'structured-data' | 'compound' | 'general';
  citations: Citation[];
  needsClarification?: boolean;
  clarificationQuestion?: string;
}

export interface DocumentRecord {
  id: string;
  ownerId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: 'processing' | 'ready' | 'failed';
  chunkCount: number;
  createdAt: string;
  error?: string;
}

export interface VectorChunk {
  id: string;
  documentId: string;
  ownerId: string;
  filename: string;
  chunkIndex: number;
  text: string;
}

export interface VectorSearchResult extends VectorChunk {
  score: number;
}
