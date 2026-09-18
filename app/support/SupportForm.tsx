'use client';

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Select } from '@/components/ui/Select';
import { OPERATOR } from '@/components/legal/constants';

const CATEGORIES = [
  { value: 'question', label: 'General question', icon: 'bi-question-circle' },
  { value: 'bug', label: 'Something is broken', icon: 'bi-bug' },
  { value: 'account', label: 'Account or sign-in', icon: 'bi-person-gear' },
  { value: 'documents', label: 'Documents or ingestion', icon: 'bi-file-earmark-text' },
  { value: 'providers', label: 'AI providers or keys', icon: 'bi-cpu' },
  { value: 'agent', label: 'Agent or connected tools', icon: 'bi-robot' },
  { value: 'accessibility', label: 'Accessibility barrier', icon: 'bi-universal-access' },
  { value: 'privacy', label: 'Privacy or data request', icon: 'bi-shield-lock' },
];

/**
 * Composes a well-structured support email and hands it to the user's mail
 * client. There is deliberately no inbound ticketing endpoint — the operator is
 * a single person reachable by email, and pretending otherwise would leave
 * messages sitting in a queue nobody reads.
 */
export function SupportForm() {
  const { data: session } = useSession();
  const [category, setCategory] = useState('question');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');

  const mailto = useMemo(() => {
    const label = CATEGORIES.find((c) => c.value === category)?.label ?? 'Support';
    const lines = [
      details.trim() || '(describe what happened)',
      '',
      '---',
      `Category: ${label}`,
      session?.user?.email ? `Account: ${session.user.email}` : 'Account: (not signed in)',
      typeof window !== 'undefined' ? `Page: ${window.location.origin}` : '',
    ].filter(Boolean);

    const params = new URLSearchParams({
      subject: subject.trim() ? `[${label}] ${subject.trim()}` : `[${label}] Support request`,
      body: lines.join('\n'),
    });
    return `mailto:${OPERATOR.email}?${params.toString()}`;
  }, [category, subject, details, session]);

  const ready = subject.trim().length > 0 && details.trim().length > 0;

  return (
    <form
      className="space-y-4 rounded-lg border border-surface-3 bg-surface-1 p-6"
      onSubmit={(e) => e.preventDefault()}
    >
      <div>
        <label htmlFor="support-category" className="mb-1.5 block text-sm font-medium text-content">
          What is this about?
        </label>
        <Select
          id="support-category"
          aria-label="Support category"
          value={category}
          onChange={setCategory}
          options={CATEGORIES}
        />
      </div>

      <div>
        <label htmlFor="support-subject" className="mb-1.5 block text-sm font-medium text-content">
          Subject
        </label>
        <input
          id="support-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="A one-line summary"
          className="focus-ignite w-full rounded-md border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-muted"
        />
      </div>

      <div>
        <label htmlFor="support-details" className="mb-1.5 block text-sm font-medium text-content">
          What happened?
        </label>
        <textarea
          id="support-details"
          rows={6}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="What you were doing, what you expected, and what happened instead. Include any error message you saw."
          className="focus-ignite w-full resize-y rounded-md border border-surface-3 bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-muted"
        />
        <p className="mt-1.5 text-xs text-content-muted">
          Don&rsquo;t paste API keys, passwords or access tokens &mdash; they are never needed to
          diagnose a problem.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-content-muted">
          Opens in your email app so you keep a copy of what you sent.
        </p>
        <a
          href={ready ? mailto : undefined}
          aria-disabled={!ready}
          onClick={(e) => {
            if (!ready) e.preventDefault();
          }}
          className={`focus-ignite inline-flex shrink-0 items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            ready
              ? 'hover-glow bg-ignite text-white hover:bg-ignite-dark'
              : 'cursor-not-allowed bg-ignite/40 text-white/70'
          }`}
        >
          <i className="bi bi-send" aria-hidden="true" />
          Compose email
        </a>
      </div>
    </form>
  );
}
