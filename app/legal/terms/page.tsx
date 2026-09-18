import { LegalPage, legalMetadata, OPERATOR } from '@/components/legal/LegalPage';

export const metadata = legalMetadata(
  'Terms of Service',
  'The agreement governing your use of IgniteAI Studio.'
);

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="These terms form the agreement between you and the operator of IgniteAI Studio. By creating an account or using the service, you accept them."
    >
      <h2>1. The service</h2>
      <p>
        IgniteAI Studio lets you upload documents, ask grounded questions about them, generate
        content from them, and run approved agent actions against services you connect. It is
        operated by <strong>{OPERATOR.name}</strong> (<a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>),
        referred to below as &ldquo;the operator&rdquo;, &ldquo;we&rdquo; or &ldquo;us&rdquo;.
      </p>
      <p>
        <strong>The service is provided free of charge.</strong> There is no subscription, no
        billing and no payment of any kind. Nothing in these terms obliges you to pay us, and we do
        not collect payment details.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must give an accurate email address and keep your password confidential.</li>
        <li>You are responsible for everything done through your account.</li>
        <li>You must be old enough to form a binding contract where you live, and at least 13.</li>
        <li>Tell us promptly at <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> if you believe your account has been accessed by someone else.</li>
      </ul>

      <h2>3. Your content stays yours</h2>
      <p>
        You keep all rights in the documents you upload and the content you generate. You grant the
        operator only the narrow permission needed to run the service for you: to store your
        content, process it, transmit it to the AI provider you have selected for a given request,
        and return the result to you. We claim no ownership, and we do not use your content to
        train models.
      </p>
      <p>
        You are responsible for having the right to upload what you upload. Do not upload material
        you are not permitted to process.
      </p>

      <h2>4. Acceptable use</h2>
      <p>
        Your use of the service is subject to the <a href="/legal/acceptable-use">Acceptable Use
        Policy</a> and the <a href="/legal/community-guidelines">Community Guidelines</a>. In
        short: nothing illegal, nothing malicious, nothing that attacks the service or other
        people. Breaching those policies may result in suspension or removal of your account.
      </p>

      <h2>5. Third-party AI providers and connected services</h2>
      <p>
        The service calls AI providers and, when you connect them, external services such as GitHub
        and Gmail. Those are operated by third parties under their own terms. We are not
        responsible for their availability, their output, their pricing or their handling of data
        once it reaches them. If you supply your own provider API key, you are responsible for any
        charges that provider levies on you.
      </p>

      <h2>6. AI output</h2>
      <p>
        AI-generated output can be wrong, incomplete or misleading even when it cites a source.
        Review it before relying on it. See the <a href="/legal/disclaimer">Disclaimer</a> for the
        full position &mdash; it forms part of these terms.
      </p>

      <h2>7. Agent actions</h2>
      <p>
        The agent can take real actions on services you connect. Every action that writes or sends
        anything is shown to you for approval first. If you choose to auto-approve a read-only
        tool, you accept responsibility for the calls it then makes without asking. You are
        responsible for the consequences of any action you approve.
      </p>

      <h2>8. Availability</h2>
      <p>
        The service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. We
        do not promise uninterrupted service, and we may suspend it for maintenance. Because the
        service is free, no service level is guaranteed and no credit or compensation arises from
        downtime.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, the operator is not liable for indirect,
        incidental, special or consequential loss, for lost profits, or for loss or corruption of
        data arising from your use of the service. Nothing in these terms excludes liability that
        cannot lawfully be excluded, such as liability for fraud or for death or personal injury
        caused by negligence.
      </p>

      <h2>10. Ending the agreement</h2>
      <p>
        You may stop using the service and delete your account at any time from Account Settings;
        see the <a href="/legal/cancellation">Cancellation Policy</a>. We may suspend or terminate
        an account that breaches these terms, that is used unlawfully, or that threatens the
        integrity of the service. Where circumstances allow, we will tell you why.
      </p>

      <h2>11. Changes</h2>
      <p>
        These terms may be updated. The date at the top of this page records the last change, and
        material changes will be signalled in the application. Continuing to use the service after
        a change means you accept the updated terms.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these terms go to <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
      </p>
    </LegalPage>
  );
}
