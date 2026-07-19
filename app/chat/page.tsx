'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  }, [createThread, bumpThreads]);

  const handleSelect = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
  }, []);

  return (
    <ProtectedShell>
      <div className="flex h-full gap-4">
        <div className="w-64 shrink-0">
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
    </ProtectedShell>
  );
}
