import { LegalPage, legalMetadata, OPERATOR } from '@/components/legal/LegalPage';

export const metadata = legalMetadata(
  'Security Policy',
  'How IgniteAI Studio protects accounts, secrets and stored documents.'
);

export default function SecurityPolicyPage() {
  return (
    <LegalPage
      title="Security Policy"
      intro="What IgniteAI Studio does to keep your account and your documents safe, and what remains your responsibility."
    >
      <h2>Our commitment</h2>
      <p>
        Data stored in IgniteAI Studio is held in an account controlled by{' '}
        <strong>{OPERATOR.name}</strong>, kept secure, and used only to operate the service for
        you. It is never used for any malicious or illegal activity, and it is never sold or shared
        with data brokers.
      </p>

      <h2>Authentication</h2>
      <ul>
        <li>Passwords are hashed with <strong>bcrypt</strong> and are never stored or logged in plain text.</li>
        <li>Sessions use signed JSON Web Tokens issued by NextAuth, carried in an HTTP-only cookie that JavaScript cannot read.</li>
        <li>Sign-in and sign-out are protected against cross-site request forgery.</li>
        <li>Optional Google and GitHub sign-in are available when configured by the operator.</li>
      </ul>

      <h2>Secrets at rest</h2>
      <p>
        Provider API keys and connected-service tokens are encrypted with{' '}
        <strong>AES-256-GCM</strong> before being written to the database, using a server-side
        encryption key that is never exposed to the browser. Only ciphertext, initialisation
        vector, authentication tag and a short display preview are stored. Rotating the server
        encryption key invalidates all stored secrets, which then have to be re-entered &mdash; a
        deliberate property, not a fault.
      </p>
      <p>
        Password-reset and email-verification links are stored only as SHA-256 hashes with a short
        expiry, and each link can be redeemed exactly once. A leaked database therefore cannot be
        used to replay a reset link.
      </p>

      <h2>Isolation between accounts</h2>
      <p>
        Every document, chat thread, generated item, log entry and stored key is keyed to an owner
        and every read is filtered by the signed-in user&rsquo;s identity. Retrieval for grounded
        answers is scoped to your own documents, so one account&rsquo;s content cannot surface in
        another account&rsquo;s results.
      </p>

      <h2>Input handling</h2>
      <ul>
        <li>Uploaded documents are sanitised during ingestion to reduce the risk of prompt-injection instructions embedded in a file steering the model.</li>
        <li>Natural-language database queries are constrained to read-only statements.</li>
        <li>Request bodies are schema-validated before use.</li>
        <li>Rate limits apply to expensive and sensitive endpoints, including sign-in, password reset, ingestion, chat and generation.</li>
      </ul>

      <h2>Human-in-the-loop for actions</h2>
      <p>
        The agent cannot silently act on the outside world. Every tool call that writes or sends
        anything is surfaced for explicit approval, and every proposal and decision is recorded in
        an activity log you can review. Read-only tools can be auto-approved only if you turn that
        on yourself; it is off by default.
      </p>

      <h2>What is your responsibility</h2>
      <ul>
        <li>Choose a strong, unique password and keep it private.</li>
        <li>Scope any provider or service token you add as narrowly as the task allows.</li>
        <li>Remove connections and keys you no longer use.</li>
        <li>Read agent proposals before approving them.</li>
        <li>Remember that a self-hosted deployment&rsquo;s server security is the responsibility of whoever runs it.</li>
      </ul>

      <h2>Reporting a problem</h2>
      <p>
        Suspected vulnerabilities go through <a href="/legal/responsible-disclosure">Responsible
        Disclosure</a>. If you believe your account has been compromised, change your password
        immediately and contact <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
      </p>
    </LegalPage>
  );
}
