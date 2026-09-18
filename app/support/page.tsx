import type { Metadata } from 'next';
import Link from 'next/link';
import { OPERATOR } from '@/components/legal/LegalPage';
import { SupportForm } from './SupportForm';

export const metadata: Metadata = {
  title: 'Support · IgniteAI Studio',
  description: 'Get help with IgniteAI Studio.',
};

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-content">Support</h1>
        <p className="mt-2 text-sm leading-relaxed text-content-muted">
          Describe what went wrong and we&rsquo;ll pick it up. Check the{' '}
          <Link href="/help" className="focus-ignite text-ignite-light hover:underline">
            help centre
          </Link>{' '}
          first &mdash; most questions are answered there.
        </p>
      </header>

      <SupportForm />

      <section className="rounded-lg border border-surface-3 bg-surface-1 p-5">
        <h2 className="mb-3 text-sm font-semibold text-content">Other routes</h2>
        <ul className="space-y-2 text-sm text-content-muted">
          <li className="flex items-start gap-2">
            <i className="bi bi-envelope mt-0.5 text-content-muted" aria-hidden="true" />
            <span>
              Email directly:{' '}
              <a href={`mailto:${OPERATOR.email}`} className="text-ignite-light hover:underline">
                {OPERATOR.email}
              </a>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <i className="bi bi-bug mt-0.5 text-content-muted" aria-hidden="true" />
            <span>
              Security vulnerability?{' '}
              <Link href="/legal/responsible-disclosure" className="text-ignite-light hover:underline">
                Use responsible disclosure
              </Link>{' '}
              rather than this form.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <i className="bi bi-universal-access mt-0.5 text-content-muted" aria-hidden="true" />
            <span>
              Accessibility barrier?{' '}
              <Link href="/legal/accessibility" className="text-ignite-light hover:underline">
                See the accessibility statement
              </Link>{' '}
              for what to include.
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
