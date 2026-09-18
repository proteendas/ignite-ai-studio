import { LegalPage, legalMetadata, OPERATOR } from '@/components/legal/LegalPage';

export const metadata = legalMetadata(
  'Disclaimer',
  'The limits of AI-generated output in IgniteAI Studio, and what it should not be relied on for.'
);

export default function DisclaimerPage() {
  return (
    <LegalPage
      title="Disclaimer"
      intro="IgniteAI Studio produces AI-generated output. This page is direct about what that output is and is not."
    >
      <h2>AI output can be wrong</h2>
      <p>
        Language models generate plausible text; they do not verify it. Output from this service may
        be inaccurate, incomplete, out of date, internally inconsistent, or confidently wrong. This
        is a property of the technology, not a defect that can be configured away.{' '}
        <strong>Check anything that matters before you act on it.</strong>
      </p>

      <h2>Citations narrow the risk, they do not remove it</h2>
      <p>
        In grounded mode, answers are drawn from passages retrieved out of your own documents, and
        the Sources panel shows which chunks were used. That makes an answer checkable, which is the
        point of it. It does not guarantee the answer is correct: retrieval can surface the wrong
        passage, and the model can still misread a passage it was given. Open the cited source and
        confirm it says what the answer claims.
      </p>

      <h2>Not professional advice</h2>
      <p>
        Nothing produced here is legal, medical, financial, tax, engineering or other professional
        advice, whatever the prompt or the confidence of the wording. Do not substitute it for a
        qualified professional, and do not make a consequential decision on it alone.
      </p>

      <h2>Generated content is your responsibility</h2>
      <p>
        If you publish, send or otherwise act on content generated here, you are responsible for it
        &mdash; for its accuracy, for any claim it makes, and for compliance with advertising,
        disclosure and other rules that apply to you. Review before you publish.
      </p>

      <h2>Agent actions have real effects</h2>
      <p>
        Approving an agent action causes it to happen: an email is sent, an issue is created. The
        approval step exists so a model never does this on its own, but once you approve, the
        consequence is yours. Read the proposal before approving it.
      </p>

      <h2>Structured data queries</h2>
      <p>
        Natural-language questions translated into database queries are constrained to read-only
        statements, but the translation itself can misinterpret your intent and return a technically
        valid answer to the wrong question. Sanity-check results before drawing conclusions.
      </p>

      <h2>Availability and third parties</h2>
      <p>
        The service depends on third-party AI providers. Their outages, rate limits, model changes
        and policy changes affect what you get here, and are outside our control. The service is
        provided as is, without warranty of accuracy, fitness for a particular purpose or
        uninterrupted availability.
      </p>

      <h2>Questions</h2>
      <p>
        Anything unclear here can be raised with{' '}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>. This disclaimer forms part of the{' '}
        <a href="/legal/terms">Terms of Service</a>.
      </p>
    </LegalPage>
  );
}
