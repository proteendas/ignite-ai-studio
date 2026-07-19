'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ToneSelector } from './ToneSelector';
import { TypingIndicator } from './TypingIndicator';
import { MessageBubble, DisplayMessage } from './MessageBubble';
import { Tone, Citation } from '@/lib/types';

/** Message row as returned by GET /api/threads/[id] (mirrors ChatMessageRecord). */
interface ApiMessage {
  id: string;
  threadId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  metaJson: string | null;
  createdAt: string;
}

interface ThreadResponse {
  messages: ApiMessage[];
}

/** Persisted assistant metadata, stored as JSON by the /api/chat route. */
interface StoredMeta {
  provider?: string;
  route?: string;
  citations?: Citation[];
}

/** Payload carried by a single SSE `data:` line from /api/chat. */
interface SseFrameData {
  provider?: string;
  route?: string;
  citations?: Citation[];
  text?: string;
  error?: string;
}

interface ChatWindowProps {
  activeThreadId: string | null;
  /** Called after a message exchange completes so the parent can refresh threads. */
  onThreadActivity: () => void;
}

function parseMeta(metaJson: string | null): StoredMeta {
  if (!metaJson) return {};
  try {
    return JSON.parse(metaJson) as StoredMeta;
  } catch {
    return {};
  }
}

function toDisplayMessages(apiMessages: ApiMessage[]): DisplayMessage[] {
  return apiMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m): DisplayMessage => {
      if (m.role === 'user') {
        return { role: 'user', content: m.content };
      }
      const meta = parseMeta(m.metaJson);
      return {
        role: 'assistant',
        content: m.content,
        provider: meta.provider,
        route: meta.route,
        citations: meta.citations,
      };
    });
}

export function ChatWindow({ activeThreadId, onThreadActivity }: ChatWindowProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [tone, setTone] = useState<Tone>('professional');
  const [isSending, setIsSending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [clarification, setClarification] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load the active thread's messages whenever the selection changes.
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingThread(true);
    setClarification(null);
    (async () => {
      try {
        const res = await fetch(`/api/threads/${activeThreadId}`);
        if (!res.ok) throw new Error('Failed to load thread.');
        const data = (await res.json()) as ThreadResponse;
        if (!cancelled) {
          setMessages(toDisplayMessages(data.messages));
        }
      } catch {
        if (!cancelled) {
          setMessages([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingThread(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeThreadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || isSending || !activeThreadId) return;
      const threadId = activeThreadId;

      setInput('');
      setClarification(null);
      setIsSending(true);

      // Append the user message and a streaming assistant placeholder.
      let assistantIndex = -1;
      setMessages((prev) => {
        assistantIndex = prev.length + 1;
        return [
          ...prev,
          { role: 'user', content: text },
          { role: 'assistant', content: '', isStreaming: true },
        ];
      });

      const replaceAssistant = (next: DisplayMessage) => {
        setMessages((prev) => {
          const copy = [...prev];
          if (assistantIndex >= 0 && assistantIndex < copy.length) {
            copy[assistantIndex] = next;
          }
          return copy;
        });
      };

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, threadId, tone }),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({ error: 'Request failed.' }))) as {
            error?: string;
          };
          replaceAssistant({
            role: 'assistant',
            content: `Error: ${data.error || 'Request failed.'}`,
          });
          return;
        }

        const contentType = res.headers.get('Content-Type') || '';

        // Ambiguous queries come back as JSON, not SSE — render the follow-up
        // question as a normal assistant message (not an error).
        if (contentType.includes('application/json')) {
          const data = (await res.json()) as {
            needsClarification?: boolean;
            clarificationQuestion?: string;
            provider?: string;
          };
          if (data.needsClarification && data.clarificationQuestion) {
            replaceAssistant({
              role: 'assistant',
              content: data.clarificationQuestion,
              provider: data.provider,
            });
            setClarification(data.clarificationQuestion);
          } else {
            replaceAssistant({
              role: 'assistant',
              content: 'No response received.',
            });
          }
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          replaceAssistant({ role: 'assistant', content: 'No response stream.' });
          return;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let provider = '';
        let route = '';
        let citations: Citation[] = [];
        let fullText = '';
        let errored = false;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          for (const rawFrame of frames) {
            const lines = rawFrame.split('\n');
            const eventLine = lines.find((l) => l.startsWith('event: '));
            const dataLine = lines.find((l) => l.startsWith('data: '));
            if (!eventLine || !dataLine) continue;

            const eventName = eventLine.slice('event: '.length);
            const data = JSON.parse(dataLine.slice('data: '.length)) as SseFrameData;

            if (eventName === 'meta') {
              provider = data.provider ?? '';
              route = data.route ?? '';
              citations = data.citations ?? [];
            } else if (eventName === 'token') {
              fullText += data.text ?? '';
              replaceAssistant({
                role: 'assistant',
                content: fullText,
                provider,
                route,
                citations,
                isStreaming: true,
              });
            } else if (eventName === 'error') {
              errored = true;
              fullText = `Error: ${data.error ?? 'Unknown error'}`;
            }
          }
        }

        replaceAssistant({
          role: 'assistant',
          content: fullText || (errored ? 'An error occurred.' : ''),
          provider: errored ? undefined : provider,
          route: errored ? undefined : route,
          citations: errored ? undefined : citations,
        });
      } catch {
        replaceAssistant({
          role: 'assistant',
          content: 'Network error — please try again.',
        });
      } finally {
        setIsSending(false);
        // Let the parent refresh the thread list (ordering / new-thread titles).
        onThreadActivity();
      }
    },
    [activeThreadId, isSending, tone, onThreadActivity]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-content">Chat</h1>
        <ToneSelector value={tone} onChange={setTone} />
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-surface-3 bg-surface-1 p-4">
        {!activeThreadId ? (
          <p className="text-sm text-content-muted">Select or start a chat to begin.</p>
        ) : loadingThread ? (
          <div className="flex items-center gap-2 text-sm text-content-muted">
            <Spinner />
            Loading conversation…
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-content-muted">
            Ask a question grounded in your uploaded documents, or a question about
            products/orders — the assistant automatically routes to the right source.
          </p>
        ) : (
          messages.map((m, i) => {
            const isTyping =
              m.role === 'assistant' && m.isStreaming && m.content === '';
            if (isTyping) {
              return (
                <div key={i} className="flex justify-start">
                  <div className="rounded-lg border border-surface-3 bg-surface-2 px-3 py-1">
                    <TypingIndicator />
                  </div>
                </div>
              );
            }
            return <MessageBubble key={i} message={m} />;
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            clarification ? 'Answer the clarifying question…' : 'Ask a question…'
          }
          disabled={isSending || !activeThreadId}
          aria-label="Message"
          className="focus-ignite flex-1 rounded-md border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-muted disabled:opacity-50"
        />
        <Button type="submit" disabled={isSending || !input.trim() || !activeThreadId}>
          {isSending ? (
            <>
              <Spinner />
              Sending…
            </>
          ) : (
            <>
              <i className="bi bi-send" aria-hidden="true" />
              Send
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
