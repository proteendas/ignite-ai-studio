import { LegalPage, legalMetadata, OPERATOR } from '@/components/legal/LegalPage';

export const metadata = legalMetadata(
  'Cancellation Policy',
  'How to stop using IgniteAI Studio, close your account, and what happens to your data.'
);

export default function CancellationPolicyPage() {
  return (
    <LegalPage
      title="Cancellation Policy"
      intro="You can leave at any time, without notice and without asking anyone. This page explains how, and exactly what is removed."
    >
      <h2>There is nothing to cancel financially</h2>
      <p>
        IgniteAI Studio is free, with no subscription or recurring charge, so &ldquo;cancelling&rdquo;
        here means closing your account rather than ending a billing arrangement. See the{' '}
        <a href="/legal/refund">Refund Policy</a> for the position on charges.
      </p>

      <h2>Stopping without deleting</h2>
      <p>
        You can simply sign out and stop using the service. Your account and content remain as you
        left them until you choose to delete them, and no charges accrue in the meantime.
      </p>

      <h2>Deleting individual items</h2>
      <ul>
        <li><strong>Documents</strong> &mdash; delete from the Documents page; this also removes the embedded chunks used for retrieval.</li>
        <li><strong>Chat threads</strong> &mdash; delete from the thread sidebar; messages and any thread summary go with it.</li>
        <li><strong>Saved content</strong> &mdash; delete from the content library.</li>
        <li><strong>Provider keys and connections</strong> &mdash; remove from Account Settings; they stop being used immediately.</li>
      </ul>

      <h2>Deleting your whole account</h2>
      <p>
        Account Settings contains a delete-account action. It is immediate and cannot be undone.
        Deleting your account removes:
      </p>
      <ul>
        <li>Your user record, name and email address</li>
        <li>Every document you uploaded and its extracted, embedded chunks</li>
        <li>Every chat thread, message and thread summary</li>
        <li>All generated content saved to your library</li>
        <li>All stored provider API keys and connected-service tokens</li>
        <li>Agent action history and approval decisions</li>
        <li>Usage records, request logs, error logs and activity events</li>
        <li>Your preferences and any outstanding password-reset or verification links</li>
      </ul>
      <p>
        Export anything you want to keep before deleting &mdash; generated content can be downloaded
        as <code>.txt</code>, <code>.md</code> or <code>.docx</code>. Once deletion runs, we cannot
        recover it for you.
      </p>

      <h2>What we cannot delete</h2>
      <p>
        Content already transmitted to a third-party AI provider during a request is subject to that
        provider&rsquo;s own retention policy. Deleting your account here does not reach into their
        systems; contact the provider directly if you need that removed.
      </p>

      <h2>If you cannot access your account</h2>
      <p>
        If you are locked out and want your data deleted, email{' '}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> from the address on the account and
        the deletion will be carried out for you.
      </p>
    </LegalPage>
  );
}
