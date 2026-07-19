import { v4 as uuidv4 } from 'uuid';
import { ChatMessage } from '@/lib/types';
import {
  createChatThread,
  getChatThread,
  insertChatMessage,
  getRecentMessages,
} from '@/lib/db/sql/client';

const HISTORY_WINDOW = 5;

/**
 * Ensures a thread id maps to a real chat_threads row (creating one if this is
 * the first message of a new thread).
 */
export function ensureThread(threadId: string, ownerId: string): void {
  if (!getChatThread(threadId)) {
    createChatThread({ id: threadId, ownerId });
  }
}

/** Returns the last N exchanges as ChatMessage[] suitable for prompt context. */
export function getHistoryWindow(threadId: string): ChatMessage[] {
  const recent = getRecentMessages(threadId, HISTORY_WINDOW * 2);
  return recent.map((m) => ({ role: m.role, content: m.content }));
}

export function recordExchange(
  threadId: string,
  userMessage: string,
  assistantMessage: string,
  metaJson?: string
): void {
  insertChatMessage({ id: uuidv4(), threadId, role: 'user', content: userMessage });
  insertChatMessage({
    id: uuidv4(),
    threadId,
    role: 'assistant',
    content: assistantMessage,
    metaJson,
  });
}
