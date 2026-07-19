'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

const PRIMARY_BUTTON_ID = 'onboarding-primary-action';

interface TourStep {
  icon: string;
  title: string;
  body: string;
}

const STEPS: readonly TourStep[] = [
  {
    icon: 'bi-upload',
    title: 'Upload a document',
    body: 'Head to the Document Library and drop in a PDF, DOCX, TXT, or MD file. IgniteAI parses and embeds it so your content becomes searchable knowledge.',
  },
  {
    icon: 'bi-chat-dots',
    title: 'Chat with grounded citations',
    body: 'Ask questions in Chat and get answers drawn straight from your documents — every claim is backed by an inline citation you can trace to the source.',
  },
  {
    icon: 'bi-megaphone',
    title: 'Generate content from your docs',
    body: 'Use the Content Generator to turn a source document into posts, emails, or ad copy — grounded in your own facts, in the tone and channel you choose.',
  },
  {
    icon: 'bi-gear',
    title: 'Manage providers & keys in Settings',
    body: 'Bring your own AI provider. Add and rotate API keys, pick default models, and set preferences from the Settings page whenever you like.',
  },
] as const;

type Phase = 'loading' | 'active' | 'hidden';

/**
 * Self-contained onboarding tour. On mount it checks onboarding status and,
 * for users who have not completed onboarding, renders a keyboard-dismissible
 * modal walkthrough of the core flow. Renders nothing while loading or once
 * onboarded. Meant to be mounted once inside the authenticated shell.
 */
export function OnboardingTour() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Gate on onboarding status.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/onboarding/status');
        if (!res.ok) {
          if (!cancelled) setPhase('hidden');
          return;
        }
        const data = (await res.json()) as { onboarded: boolean };
        if (!cancelled) setPhase(data.onboarded ? 'hidden' : 'active');
      } catch {
        if (!cancelled) setPhase('hidden');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const complete = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await fetch('/api/onboarding/complete', { method: 'POST' });
    } catch {
      // Non-critical: hide regardless so the user is never trapped in the tour.
    } finally {
      setPhase('hidden');
      setSubmitting(false);
    }
  }, [submitting]);

  const isLast = step === STEPS.length - 1;

  const next = useCallback(() => {
    if (isLast) {
      void complete();
    } else {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  }, [isLast, complete]);

  const back = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  // Esc dismisses (counts as completing so it does not reappear); move focus to
  // the primary action whenever the step changes.
  useEffect(() => {
    if (phase !== 'active') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void complete();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.getElementById(PRIMARY_BUTTON_ID)?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [phase, step, complete]);

  if (phase !== 'active') return null;

  const current = STEPS[step];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-base/80 p-4 backdrop-blur-sm"
      aria-hidden={false}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-body"
        className="w-full max-w-md rounded-lg border border-surface-3 bg-surface-2 p-6 shadow-glow transition-opacity duration-200"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 text-ignite-light">
            <i className="bi bi-lightbulb text-xl" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wide text-content-muted">
              Getting started &middot; {step + 1} of {STEPS.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void complete()}
            disabled={submitting}
            aria-label="Skip onboarding tour"
            className="focus-ignite rounded-md p-1 text-content-muted transition-colors hover:text-content disabled:cursor-not-allowed"
          >
            <i className="bi bi-x-lg" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ignite/15 text-ignite-light shadow-glow-sm">
            <i className={`bi ${current.icon} text-lg`} aria-hidden="true" />
          </span>
          <div>
            <h2 id="onboarding-title" className="text-base font-semibold text-content">
              {current.title}
            </h2>
            <p id="onboarding-body" className="mt-1 text-sm leading-relaxed text-content-muted">
              {current.body}
            </p>
          </div>
        </div>

        {/* Progress dots */}
        <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              className={
                i === step
                  ? 'h-1.5 w-5 rounded-full bg-ignite transition-all'
                  : 'h-1.5 w-1.5 rounded-full bg-surface-3 transition-all'
              }
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => void complete()}
            disabled={submitting}
          >
            Skip
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={back} disabled={step === 0 || submitting}>
              Back
            </Button>
            <Button id={PRIMARY_BUTTON_ID} variant="primary" onClick={next} disabled={submitting}>
              {isLast ? 'Finish' : 'Next'}
              <i className={`bi ${isLast ? 'bi-check-circle-fill' : 'bi-arrow-right'}`} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OnboardingTour;
