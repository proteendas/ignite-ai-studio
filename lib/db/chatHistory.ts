import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '@/lib/types';
import type { AIProvider } from '@/lib/ai/providerAdapter';
import { lightModelFor } from '@/lib/ai/providerAdapter';
import { buildHistorySummaryPrompt } from '@/lib/ai/prompts';
import {
  createChatThread,
  getChatThread,
  insertChatMessage,
  getRecentMessages,
  listThreadMessages,
  countThreadMessages,
  getThreadSummary,
  upsertThreadSummary,
  updateChatThread,
} from '@/lib/db/sql/client';

/** Messages kept verbatim in the prompt; everything older is summarized. */
const RECENT_WINDOW = 8;

const THREAD_TITLE_MAX = 48;

/** Rough token estimate used consistently across chat persistence/usage. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Ensures a thread id maps to a real chat_threads row (creating one if this is
 * the first message of a new thread).
 */
export function ensureThread(threadId: string, ownerId: string): void {
  if (!getChatThread(threadId)) {
    createChatThread({ id: threadId, ownerId });
  }
}

/** Returns the last N messages as ChatMessage[] suitable for prompt context. */
export function getHistoryWindow(threadId: string): ChatMessage[] {
  const recent = getRecentMessages(threadId, RECENT_WINDOW);
  return recent.map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Token-efficient history: the last RECENT_WINDOW messages verbatim, prefixed
 * by a rolling summary of everything older. The summary is cached per thread
 * and only regenerated when new messages have aged out of the verbatim window.
 * A summarization failure degrades to the verbatim window alone rather than
 * failing the chat request.
 */
export async function getCompressedHistory(
  threadId: string,
  provider: AIProvider
): Promise<ChatMessage[]> {
  const recent = getHistoryWindow(threadId);
  const total = countThreadMessages(threadId);
  if (total <= RECENT_WINDOW) {
    return recent;
  }

  const boundary = total - RECENT_WINDOW;
  let summary = getThreadSummary(threadId);

  if (!summary || summary.throughMessageCount < boundary) {
    try {
      const older = listThreadMessages(threadId).slice(0, boundary);
      const transcript = older
        .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
        .join('\n');
      const lightModel = lightModelFor(provider.id);
      const text = await provider.chat(
        [
          { role: 'system', content: buildHistorySummaryPrompt() },
          { role: 'user', content: transcript },
        ],
        { temperature: 0, maxTokens: 200, ...(lightModel ? { model: lightModel } : {}) }
      );
      if (text.trim()) {
        upsertThreadSummary(threadId, text.trim(), boundary);
        summary = { threadId, summary: text.trim(), throughMessageCount: boundary, updatedAt: '' };
      }
    } catch (err) {
      console.error('Thread summary generation failed:', err);
    }
  }

  if (!summary) {
    return recent;
  }
  return [
    { role: 'system', content: `Summary of the earlier conversation: ${summary.summary}` },
    ...recent,
  ];
}

export function recordExchange(
  threadId: string,
  userMessage: string,
  assistantMessage: string,
  metaJson?: string,
  documentRefs?: string[]
): void {
  insertChatMessage({
    id: uuidv4(),
    threadId,
    role: 'user',
    content: userMessage,
    tokenCount: estimateTokens(userMessage),
  });
  insertChatMessage({
    id: uuidv4(),
    threadId,
    role: 'assistant',
    content: assistantMessage,
    metaJson,
    tokenCount: estimateTokens(assistantMessage),
    documentRefs:
      documentRefs && documentRefs.length > 0 ? JSON.stringify(documentRefs) : null,
  });

  // Auto-title: the first exchange of an untitled thread names it.
  const thread = getChatThread(threadId);
  if (thread && thread.title === null) {
    const title = userMessage.trim().slice(0, THREAD_TITLE_MAX);
    if (title) {
      updateChatThread(threadId, { title });
    }
  }
}
