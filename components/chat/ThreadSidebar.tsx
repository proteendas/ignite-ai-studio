'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toaster';

/** Shape returned by the /api/threads endpoints (mirrors ChatThreadRecord). */
interface ThreadSummary {
  id: string;
  ownerId: string;
  title: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ThreadsResponse {
  threads: ThreadSummary[];
}

interface ThreadSidebarProps {
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  /** Increment from the parent to force the list to re-fetch. */
  refreshSignal: number;
}

export function ThreadSidebar({
  activeThreadId,
  onSelect,
  onNew,
  refreshSignal,
}: ThreadSidebarProps) {
  const { toast } = useToast();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/threads');
      if (!res.ok) {
        throw new Error('Failed to load threads.');
      }
      const data = (await res.json()) as ThreadsResponse;
      setThreads(data.threads);
    } catch {
      toast('Could not load your chats.', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingId]);

  const togglePin = async (thread: ThreadSummary) => {
    try {
      const res = await fetch(`/api/threads/${thread.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !thread.pinned }),
      });
      if (!res.ok) throw new Error();
      toast(thread.pinned ? 'Chat unpinned.' : 'Chat pinned.', 'success');
      await load();
    } catch {
      toast('Could not update the chat.', 'error');
    }
  };

  const beginRename = (thread: ThreadSummary) => {
    setEditingId(thread.id);
    setDraftTitle(thread.title ?? '');
  };

  const cancelRename = () => {
    setEditingId(null);
    setDraftTitle('');
  };

  const commitRename = async (thread: ThreadSummary) => {
    const title = draftTitle.trim();
    setEditingId(null);
    if (!title || title === (thread.title ?? '')) {
      setDraftTitle('');
      return;
    }
    try {
      const res = await fetch(`/api/threads/${thread.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error();
      toast('Chat renamed.', 'success');
      await load();
    } catch {
      toast('Could not rename the chat.', 'error');
    } finally {
      setDraftTitle('');
    }
  };

  const remove = async (thread: ThreadSummary) => {
    const label = thread.title?.trim() || 'Untitled chat';
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/threads/${thread.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast('Chat deleted.', 'success');

      // Re-fetch the fresh list, then move selection off the deleted thread.
      const listRes = await fetch('/api/threads');
      const data = (await listRes.json()) as ThreadsResponse;
      setThreads(data.threads);

      if (thread.id === activeThreadId) {
        if (data.threads.length > 0) {
          onSelect(data.threads[0].id);
        } else {
          onNew();
        }
      }
    } catch {
      toast('Could not delete the chat.', 'error');
    }
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-surface-3 bg-surface-1">
      <div className="space-y-2 border-b border-surface-3 p-3">
        <h2 className="text-sm font-semibold text-content">Chats</h2>
        <Button
          variant="primary"
          className="w-full"
          onClick={onNew}
          aria-label="Start a new chat"
        >
          <i className="bi bi-plus-lg" aria-hidden="true" />
          New chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-3 text-sm text-content-muted">
            <Spinner />
            Loading chats…
          </div>
        ) : threads.length === 0 ? (
          <p className="px-2 py-3 text-sm text-content-muted">
            No chats yet. Start one with “New chat”.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {threads.map((thread) => {
              const active = thread.id === activeThreadId;
              const isEditing = editingId === thread.id;
              const title = thread.title?.trim() || 'Untitled chat';

              return (
                <li key={thread.id}>
                  <div
                    className={clsx(
                      'group flex items-center gap-1 rounded-md px-2 py-1.5 transition-colors',
                      active
                        ? 'nav-active text-ignite-light'
                        : 'text-content-muted hover:bg-surface-2 hover:text-content',
                      thread.pinned && !active && 'border-l-2 border-ignite'
                    )}
                  >
                    {thread.pinned && (
                      <i
                        className="bi bi-pin-fill shrink-0 text-xs text-ignite"
                        aria-label="Pinned"
                      />
                    )}

                    {isEditing ? (
                      <input
                        ref={editInputRef}
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onBlur={() => commitRename(thread)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitRename(thread);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelRename();
                          }
                        }}
                        aria-label="Rename chat"
                        className="focus-ignite min-w-0 flex-1 rounded border border-surface-3 bg-surface-2 px-1.5 py-0.5 text-sm text-content"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelect(thread.id)}
                        aria-current={active ? 'true' : undefined}
                        className="focus-ignite min-w-0 flex-1 truncate rounded text-left text-sm"
                        title={title}
                      >
                        {title}
                      </button>
                    )}

                    {!isEditing && (
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => togglePin(thread)}
                          aria-label={thread.pinned ? 'Unpin chat' : 'Pin chat'}
                          className="focus-ignite rounded p-1 text-content-muted hover:text-ignite-light"
                        >
                          <i
                            className={clsx(
                              'bi',
                              thread.pinned ? 'bi-pin-angle-fill' : 'bi-pin-angle'
                            )}
                            aria-hidden="true"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => beginRename(thread)}
                          aria-label="Rename chat"
                          className="focus-ignite rounded p-1 text-content-muted hover:text-content"
                        >
                          <i className="bi bi-pencil" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(thread)}
                          aria-label="Delete chat"
                          className="focus-ignite rounded p-1 text-content-muted hover:text-ignite-light"
                        >
                          <i className="bi bi-trash" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
