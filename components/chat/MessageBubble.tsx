import clsx from 'clsx';
import { ChatMode, Citation } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { CitationBadge } from './CitationBadge';
import { CitationsPanel } from './CitationsPanel';
import { ProviderBadge } from './ProviderBadge';

/** One inline agent progress line ("planning… using github_list_issues"). */
export interface AgentStepView {
  index: number;
  thought: string;
  tool?: string;
}

export interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  provider?: string;
  route?: string;
  mode?: ChatMode;
  citations?: Citation[];
  steps?: AgentStepView[];
  isStreaming?: boolean;
  /** Informational notice (e.g. "upload a document first") — not an answer. */
  isNotice?: boolean;
}

function modeBadge(message: DisplayMessage) {
  // Older persisted messages predate `mode`; fall back to the stored route so
  // users can always tell whether retrieval was active for an answer.
  const mode = message.mode ?? (message.route === 'general' ? 'general' : undefined);
  if (mode === 'general') {
    return (
      <Badge tone="neutral">
        <i className="bi bi-globe2" aria-hidden="true" />
        General
      </Badge>
    );
  }
  if (mode === 'agent') {
    return (
      <Badge tone="brand">
        <i className="bi bi-robot" aria-hidden="true" />
        Agent
      </Badge>
    );
  }
  if (mode === 'grounded' || message.route) {
    return (
      <Badge tone="brand">
        <i className="bi bi-file-earmark-check" aria-hidden="true" />
        Grounded
      </Badge>
    );
  }
  return null;
}

export function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === 'user';

  if (message.isNotice) {
    return (
      <div className="flex justify-start">
        <div className="max-w-2xl rounded-lg border border-surface-3 bg-surface-2 px-4 py-3 text-sm text-content-muted">
          <i className="bi bi-info-circle mr-1.5 text-ignite-light" aria-hidden="true" />
          {message.content}
        </div>
      </div>
    );
  }

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
        {!isUser && message.steps && message.steps.length > 0 && (
          <ul className="mb-2 space-y-1">
            {message.steps.map((s) => (
              <li
                key={s.index}
                className="flex items-center gap-1.5 text-xs text-content-muted"
              >
                <i className="bi bi-tools" aria-hidden="true" />
                <span>{s.thought}</span>
                {s.tool && (
                  <span className="text-ignite-light">using {s.tool}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="whitespace-pre-wrap">
          {message.content}
          {message.isStreaming && <span className="ml-0.5 animate-pulse">▍</span>}
        </p>

        {!isUser && (message.provider || message.route || message.mode) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {modeBadge(message)}
            {message.provider && <ProviderBadge provider={message.provider} />}
            {message.route && message.route !== 'general' && (
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-content-muted">
                {message.route}
              </span>
            )}
          </div>
        )}

        {!isUser && message.citations && message.citations.length > 0 && (
          <>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.citations.map((c, i) => (
                <CitationBadge key={`${c.documentId}-${c.chunkIndex}-${i}`} citation={c} />
              ))}
            </div>
            <CitationsPanel citations={message.citations} />
          </>
        )}
      </div>
    </div>
  );
}
