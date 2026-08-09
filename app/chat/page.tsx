'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ProtectedShell } from '@/components/layout/ProtectedShell';
import { ThreadSidebar } from '@/components/chat/ThreadSidebar';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { useToast } from '@/components/ui/Toaster';

interface ThreadSummary {
  id: string;
  ownerId: string;
  title: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function ChatPage() {
  const { toast } = useToast();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [threadSidebarOpen, setThreadSidebarOpen] = useState(false);
  const bootstrappedRef = useRef(false);

  const bumpThreads = useCallback(() => {
    setRefreshSignal((n) => n + 1);
  }, []);

  const createThread = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { thread: ThreadSummary };
      return data.thread.id;
    } catch {
      toast('Could not create a new chat.', 'error');
      return null;
    }
  }, [toast]);

  // On mount: select the most recently updated thread, or create the first one.
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    (async () => {
      try {
        const res = await fetch('/api/threads');
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { threads: ThreadSummary[] };

        if (data.threads.length > 0) {
          const mostRecent = [...data.threads].sort((a, b) =>
            b.updatedAt.localeCompare(a.updatedAt)
          )[0];
          setActiveThreadId(mostRecent.id);
          return;
        }
      } catch {
        toast('Could not load your chats.', 'error');
        return;
      }

      const created = await createThread();
      if (created) {
        setActiveThreadId(created);
        bumpThreads();
      }
    })();
  }, [createThread, bumpThreads, toast]);

  const handleNew = useCallback(async () => {
    const created = await createThread();
    if (created) {
      setActiveThreadId(created);
      bumpThreads();
    }
    setThreadSidebarOpen(false);
  }, [createThread, bumpThreads]);

  const handleSelect = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    setThreadSidebarOpen(false);
  }, []);

  return (
    <ProtectedShell>
      <div className="flex h-full flex-col gap-3 md:gap-0">
        {/* Mobile-only trigger to open the chats drawer; sits above the chat
            window (not floating over it) so it can never overlap the input
            bar's attach/send buttons. */}
        <button
          type="button"
          onClick={() => setThreadSidebarOpen(true)}
          aria-label="Open chats list"
          className="focus-ignite inline-flex w-fit items-center gap-2 self-start rounded-md border border-surface-3 bg-surface-2 px-3 py-2 text-sm font-medium text-content md:hidden"
        >
          <i className="bi bi-chat-left-text" aria-hidden="true" />
          Chats
        </button>

        <div className="flex min-h-0 flex-1 gap-4">
          {/* Backdrop: mobile-only, closes the chats drawer on tap. */}
          {threadSidebarOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/50 md:hidden"
              onClick={() => setThreadSidebarOpen(false)}
              aria-hidden="true"
            />
          )}

          <div
            className={clsx(
              'fixed inset-y-0 left-0 z-40 w-72 max-w-[85%] shrink-0 p-3 transition-transform duration-200 ease-in-out',
              threadSidebarOpen ? 'translate-x-0' : '-translate-x-full',
              'md:static md:z-auto md:w-64 md:max-w-none md:translate-x-0 md:p-0'
            )}
          >
            <ThreadSidebar
              activeThreadId={activeThreadId}
              onSelect={handleSelect}
              onNew={handleNew}
              refreshSignal={refreshSignal}
            />
          </div>

          <div className="min-w-0 flex-1">
            <ChatWindow activeThreadId={activeThreadId} onThreadActivity={bumpThreads} />
          </div>
        </div>
      </div>
    </ProtectedShell>
  );
}
