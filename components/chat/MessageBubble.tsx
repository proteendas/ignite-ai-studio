import clsx from 'clsx';
import { Citation } from '@/lib/types';
import { CitationBadge } from './CitationBadge';
import { ProviderBadge } from './ProviderBadge';

export interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  route?: string;
  citations?: Citation[];
  isStreaming?: boolean;
}

export function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-2xl rounded-lg px-4 py-3 text-sm',
          isUser
            ? 'bg-ignite text-white shadow-glow-sm'
            : 'border border-surface-3 bg-surface-2 text-content shadow-sm'
        )}
      >
        <p className="whitespace-pre-wrap">
          {message.content}
          {message.isStreaming && <span className="ml-0.5 animate-pulse">▍</span>}
        </p>

        {!isUser && (message.provider || message.route) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {message.provider && <ProviderBadge provider={message.provider} />}
            {message.route && (
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-content-muted">
                {message.route}
              </span>
            )}
          </div>
        )}

        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.citations.map((c, i) => (
              <CitationBadge key={`${c.documentId}-${c.chunkIndex}-${i}`} citation={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
