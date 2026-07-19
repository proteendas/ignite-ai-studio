export type Tone = 'professional' | 'casual' | 'technical' | 'persuasive' | 'formal' | 'playful';

export type Channel = 'linkedin' | 'x' | 'email' | 'landing-page' | 'blog' | 'ad-copy' | 'general';

export type ContentType =
  | 'social-post'
  | 'blog-draft'
  | 'ad-copy'
  | 'email'
  | 'product-description';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Citation {
  documentId: string;
  filename: string;
  chunkIndex: number;
  snippet: string;
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
