'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toaster';
import { ToneSelector } from './ToneSelector';
import { ModeToggle } from './ModeToggle';
import { TypingIndicator } from './TypingIndicator';
import { MessageBubble, DisplayMessage, AgentStepView } from './MessageBubble';
import { AgentApprovalCard } from '@/components/agent/AgentApprovalCard';
import { AgentActivityLog } from '@/components/agent/AgentActivityLog';
import { AgentActionView, ChatMode, Citation, Tone } from '@/lib/types';

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
  mode?: ChatMode;
  citations?: Citation[];
}

/** Payload carried by a single SSE `data:` line from /api/chat or /api/agent. */
interface SseFrameData {
  provider?: string;
  route?: string;
  mode?: ChatMode;
  citations?: Citation[];
  text?: string;
  error?: string;
  index?: number;
  thought?: string;
  tool?: string;
  action?: AgentActionView;
  promptTokens?: number;
  completionTokens?: number;
}

interface UploadState {
  documentId?: string;
  filename: string;
  status: 'uploading' | 'ingesting' | 'ready' | 'failed';
  error?: string;
}

interface ChatWindowProps {
  activeThreadId: string | null;
  /** Called after a message exchange completes so the parent can refresh threads. */
  onThreadActivity: () => void;
}

const MODE_STORAGE_KEY = 'igniteai.chat-mode';
const DOC_POLL_MS = 1500;

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
        mode: meta.mode,
        citations: meta.citations,
      };
    });
}

export function ChatWindow({ activeThreadId, onThreadActivity }: ChatWindowProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [tone, setTone] = useState<Tone>('professional');
  const [mode, setMode] = useState<ChatMode>('grounded');
  const [isSending, setIsSending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [clarification, setClarification] = useState<string | null>(null);
  const [sessionTokens, setSessionTokens] = useState(0);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [groundingDoc, setGroundingDoc] = useState<{ id: string; filename: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<AgentActionView | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [agentRefresh, setAgentRefresh] = useState(0);
  const [agentLogOpen, setAgentLogOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
    if (saved === 'grounded' || saved === 'general' || saved === 'agent') {
      setMode(saved);
    }
  }, []);

  const changeMode = useCallback((next: ChatMode) => {
    setMode(next);
    window.localStorage.setItem(MODE_STORAGE_KEY, next);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Load the active thread's messages whenever the selection changes.
  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingThread(true);
    setClarification(null);
    setPendingAction(null);
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
  }, [messages, upload, pendingAction]);

  /** Appends a streaming assistant placeholder and returns its replace fn. */
  const appendStreamingAssistant = useCallback(() => {
    let index = -1;
    setMessages((prev) => {
      index = prev.length;
      return [...prev, { role: 'assistant', content: '', isStreaming: true }];
    });
    return (next: DisplayMessage) => {
      setMessages((prev) => {
        const copy = [...prev];
        if (index >= 0 && index < copy.length) {
          copy[index] = next;
        }
        return copy;
      });
    };
  }, []);

  /**
   * Consumes an SSE response from /api/chat, /api/agent, or the agent decision
   * endpoint (shared event vocabulary) and renders into one assistant bubble.
   */
  const streamAndRender = useCallback(
    async (
      res: Response,
      replaceAssistant: (m: DisplayMessage) => void,
      requestMode: ChatMode
    ) => {
      const reader = res.body?.getReader();
      if (!reader) {
        replaceAssistant({ role: 'assistant', content: 'No response stream.' });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let provider = '';
      let route = '';
      let msgMode: ChatMode = requestMode;
      let citations: Citation[] = [];
      let fullText = '';
      let errored = false;
      let awaitingApproval = false;
      const steps: AgentStepView[] = [];

      const render = (streaming: boolean) => {
        let content = fullText;
        if (!streaming && !content && !errored) {
          content = awaitingApproval
            ? 'Waiting for your decision on the proposed action…'
            : 'No response received.';
        }
        replaceAssistant({
          role: 'assistant',
          content,
          provider: errored ? undefined : provider,
          route: errored ? undefined : route,
          mode: errored ? undefined : msgMode,
          citations: errored ? undefined : citations,
          steps: steps.length > 0 ? [...steps] : undefined,
          isStreaming: streaming,
        });
      };

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
          let data: SseFrameData;
          try {
            data = JSON.parse(dataLine.slice('data: '.length)) as SseFrameData;
          } catch {
            continue;
          }

          if (eventName === 'meta') {
            provider = data.provider ?? '';
            route = data.route ?? '';
            msgMode = data.mode ?? requestMode;
            citations = data.citations ?? [];
          } else if (eventName === 'token') {
            fullText += data.text ?? '';
            render(true);
          } else if (eventName === 'step') {
            steps.push({
              index: data.index ?? steps.length,
              thought: data.thought ?? '',
              tool: data.tool,
            });
            render(true);
          } else if (eventName === 'action_request') {
            if (data.action) {
              awaitingApproval = true;
              setPendingAction(data.action);
              setAgentRefresh((n) => n + 1);
            }
          } else if (eventName === 'done') {
            setSessionTokens(
              (t) => t + (data.promptTokens ?? 0) + (data.completionTokens ?? 0)
            );
          } else if (eventName === 'error') {
            errored = true;
            fullText = `Error: ${data.error ?? 'Unknown error'}`;
          }
        }
      }

      render(false);
    },
    []
  );

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || isSending || !activeThreadId) return;
      const threadId = activeThreadId;
      const sendMode = mode;

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
        const res =
          sendMode === 'agent'
            ? await fetch('/api/agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, threadId }),
              })
            : await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: text,
                  threadId,
                  tone,
                  mode: sendMode,
                  documentId:
                    sendMode === 'grounded' && groundingDoc ? groundingDoc.id : undefined,
                }),
              });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({ error: 'Request failed.' }))) as {
            error?: string;
          };
          // 409s are guidance (document not ready / nothing to ground on),
          // not failures — show them as a friendly notice.
          if (res.status === 409) {
            replaceAssistant({
              role: 'assistant',
              content: data.error || 'Not ready yet — please try again shortly.',
              isNotice: true,
            });
          } else {
            replaceAssistant({
              role: 'assistant',
              content: `Error: ${data.error || 'Request failed.'}`,
            });
          }
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

        await streamAndRender(res, replaceAssistant, sendMode);
      } catch {
        replaceAssistant({
          role: 'assistant',
          content: 'Network error — please try again.',
        });
      } finally {
        setIsSending(false);
        if (sendMode === 'agent') {
          setAgentRefresh((n) => n + 1);
        }
        // Let the parent refresh the thread list (ordering / new-thread titles).
        onThreadActivity();
      }
    },
    [activeThreadId, isSending, tone, mode, groundingDoc, streamAndRender, onThreadActivity]
  );

  /** Approve/reject a proposed agent action, then consume the resumed stream. */
  const decideAction = useCallback(
    async (decision: 'approve' | 'reject', payload?: Record<string, unknown>) => {
      if (!pendingAction || actionBusy) return;
      const actionId = pendingAction.id;
      setActionBusy(true);
      try {
        const res = await fetch(`/api/agent/actions/${actionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload !== undefined ? { decision, payload } : { decision }),
        });
        setPendingAction(null);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({ error: 'Request failed.' }))) as {
            error?: string;
          };
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `Error: ${data.error || 'Action decision failed.'}` },
          ]);
          return;
        }
        const replaceAssistant = appendStreamingAssistant();
        setIsSending(true);
        await streamAndRender(res, replaceAssistant, 'agent');
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Network error — please try again.' },
        ]);
      } finally {
        setActionBusy(false);
        setIsSending(false);
        setAgentRefresh((n) => n + 1);
        onThreadActivity();
      }
    },
    [pendingAction, actionBusy, appendStreamingAssistant, streamAndRender, onThreadActivity]
  );

  const pollDocument = useCallback(
    (documentId: string) => {
      const tick = async () => {
        try {
          const res = await fetch(`/api/documents/${documentId}`);
          if (!res.ok) throw new Error();
          const data = (await res.json()) as {
            document: { id: string; filename: string; status: string; error?: string };
          };
          const doc = data.document;
          if (doc.status === 'ready') {
            setUpload((u) => (u ? { ...u, status: 'ready' } : u));
            setGroundingDoc({ id: doc.id, filename: doc.filename });
            toast(`"${doc.filename}" is ready — chat is now grounded on it.`, 'success');
            pollTimerRef.current = window.setTimeout(() => setUpload(null), 2500);
            return;
          }
          if (doc.status === 'failed') {
            setUpload((u) =>
              u ? { ...u, status: 'failed', error: doc.error || 'Ingestion failed.' } : u
            );
            return;
          }
          pollTimerRef.current = window.setTimeout(tick, DOC_POLL_MS);
        } catch {
          pollTimerRef.current = window.setTimeout(tick, DOC_POLL_MS);
        }
      };
      pollTimerRef.current = window.setTimeout(tick, DOC_POLL_MS);
    },
    [toast]
  );

  const handleFileSelected = useCallback(
    async (file: File) => {
      stopPolling();
      setUpload({ filename: file.name, status: 'uploading' });
      const form = new FormData();
      form.append('file', file);
      try {
        const res = await fetch('/api/ingest', { method: 'POST', body: form });
        const data = (await res.json().catch(() => ({}))) as {
          documentId?: string;
          status?: string;
          error?: string;
        };
        if (!res.ok || !data.documentId) {
          setUpload({ filename: file.name, status: 'failed', error: data.error || 'Upload failed.' });
          return;
        }
        if (data.status === 'ready') {
          setUpload({ documentId: data.documentId, filename: file.name, status: 'ready' });
          setGroundingDoc({ id: data.documentId, filename: file.name });
          toast(`"${file.name}" is ready — chat is now grounded on it.`, 'success');
          pollTimerRef.current = window.setTimeout(() => setUpload(null), 2500);
          return;
        }
        setUpload({ documentId: data.documentId, filename: file.name, status: 'ingesting' });
        pollDocument(data.documentId);
      } catch {
        setUpload({ filename: file.name, status: 'failed', error: 'Network error during upload.' });
      }
    },
    [pollDocument, stopPolling, toast]
  );

  const uploadBusy = upload?.status === 'uploading' || upload?.status === 'ingesting';

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-content">Chat</h1>
          <div className="mt-1.5">
            <ModeToggle value={mode} onChange={changeMode} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center gap-1.5 text-xs text-content-muted"
            title="Token counts are estimates (~4 characters per token)."
          >
            <i className="bi bi-cpu" aria-hidden="true" />
            ≈ {sessionTokens.toLocaleString()} tokens this session
          </span>
          <ToneSelector value={tone} onChange={setTone} />
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-surface-3 bg-surface-1 p-4">
        {!activeThreadId ? (
          <p className="text-sm text-content-muted">Select or start a chat to begin.</p>
        ) : loadingThread ? (
          <div className="flex items-center gap-2 text-sm text-content-muted">
            <Spinner />
            Loading conversation…
          </div>
        ) : messages.length === 0 && !upload ? (
          <p className="text-sm text-content-muted">
            {mode === 'grounded'
              ? 'Ask a question about your uploaded documents — every answer is retrieved from them and cited. Attach a document with the paperclip to ground the chat on it.'
              : mode === 'general'
                ? 'General mode: chat freely using the model\'s own knowledge. Answers are not grounded in your documents.'
                : 'Agent mode: describe a task and the assistant will plan, propose tool actions, and ask for your approval before executing them.'}
          </p>
        ) : (
          messages.map((m, i) => {
            const isTyping =
              m.role === 'assistant' && m.isStreaming && m.content === '' && !m.steps;
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

        {upload && (
          <div className="flex justify-start">
            <div className="w-80 max-w-full rounded-lg border border-surface-3 bg-surface-2 px-3 py-2 text-sm">
              <div className="flex items-center gap-2 text-content">
                <i className="bi bi-file-earmark-arrow-up text-ignite-light" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{upload.filename}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs">
                {upload.status === 'uploading' && (
                  <span className="inline-flex items-center gap-1.5 text-content-muted">
                    <Spinner /> Uploading…
                  </span>
                )}
                {upload.status === 'ingesting' && (
                  <span className="inline-flex items-center gap-1.5 text-content-muted">
                    <Spinner /> Ingesting…
                  </span>
                )}
                {upload.status === 'ready' && (
                  <span className="inline-flex items-center gap-1.5 text-ignite-light">
                    <i className="bi bi-check-circle" aria-hidden="true" />
                    Ready — grounding enabled
                  </span>
                )}
                {upload.status === 'failed' && (
                  <span className="inline-flex items-center gap-1.5 text-ignite">
                    <i className="bi bi-x-circle" aria-hidden="true" />
                    Failed{upload.error ? `: ${upload.error}` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {pendingAction && (
          <AgentApprovalCard
            action={pendingAction}
            busy={actionBusy}
            onApprove={(editedPayload) => decideAction('approve', editedPayload)}
            onReject={() => decideAction('reject')}
          />
        )}

        <div ref={bottomRef} />
      </div>

      {mode === 'agent' && activeThreadId && (
        <div className="mt-3 rounded-lg border border-surface-3 bg-surface-1">
          <button
            type="button"
            onClick={() => setAgentLogOpen((o) => !o)}
            aria-expanded={agentLogOpen}
            className="focus-ignite flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-content-muted transition-colors hover:text-content"
          >
            <i
              className={clsx('bi', agentLogOpen ? 'bi-chevron-down' : 'bi-chevron-right')}
              aria-hidden="true"
            />
            <i className="bi bi-list-check" aria-hidden="true" />
            Agent activity
          </button>
          {agentLogOpen && (
            <div className="border-t border-surface-3 p-3">
              <AgentActivityLog threadId={activeThreadId} refreshSignal={agentRefresh} />
            </div>
          )}
        </div>
      )}

      {groundingDoc && mode === 'grounded' && (
        <div className="mt-2 flex items-center">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-ignite/15 px-2.5 py-1 text-xs font-medium text-ignite-light">
            <i className="bi bi-paperclip" aria-hidden="true" />
            <span className="min-w-0 truncate">Grounding: {groundingDoc.filename}</span>
            <button
              type="button"
              onClick={() => setGroundingDoc(null)}
              aria-label={`Stop grounding on ${groundingDoc.filename}`}
              className="focus-ignite rounded-full transition-colors hover:text-content"
            >
              <i className="bi bi-x-lg" aria-hidden="true" />
            </button>
          </span>
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="hidden"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) handleFileSelected(file);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          aria-label="Attach a document"
          title="Attach a document (.pdf, .docx, .txt, .md)"
          disabled={!activeThreadId || uploadBusy}
          onClick={() => fileInputRef.current?.click()}
          className="px-3"
        >
          <i className="bi bi-paperclip" aria-hidden="true" />
        </Button>
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
