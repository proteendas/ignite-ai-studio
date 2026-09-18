'use client';

import clsx from 'clsx';
import { ChatMode } from '@/lib/types';

const MODES: { id: ChatMode; label: string; icon: string; hint: string }[] = [
  {
    id: 'grounded',
    label: 'Grounded',
    icon: 'bi-file-earmark-check',
    hint: 'Answers come only from your documents, with citations.',
  },
  {
    id: 'general',
    label: 'General',
    icon: 'bi-globe2',
    hint: 'General knowledge — answers are not grounded in your documents.',
  },
  {
    id: 'agent',
    label: 'Agent',
    icon: 'bi-robot',
    hint: 'The assistant plans and uses tools, asking for your approval before acting.',
  },
];

export function ModeToggle({
  value,
  onChange,
}: {
  value: ChatMode;
  onChange: (mode: ChatMode) => void;
}) {
  const active = MODES.find((m) => m.id === value) ?? MODES[0];

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Chat mode"
        className="inline-flex rounded-md border border-surface-3 bg-surface-2 p-0.5"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={value === m.id}
            onClick={() => onChange(m.id)}
            className={clsx(
              'focus-ignite inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
              value === m.id
                ? 'solid-active bg-ignite text-white shadow-glow-sm'
                : 'text-content-muted hover:bg-surface-3 hover:text-content'
            )}
          >
            <i className={clsx('bi', m.icon)} aria-hidden="true" />
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-content-muted">{active.hint}</p>
    </div>
  );
}
