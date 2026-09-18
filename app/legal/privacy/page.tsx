import { LegalPage, legalMetadata, OPERATOR } from '@/components/legal/LegalPage';

export const metadata = legalMetadata(
  'Privacy Policy',
  'What IgniteAI Studio stores about you, why it is stored, who it is shared with, and how to get it deleted.'
);

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This policy explains exactly what IgniteAI Studio stores about you, why, who else can see it, and how to remove it."
    >
      <h2>Who operates this service</h2>
      <p>
        IgniteAI Studio is operated by <strong>{OPERATOR.name}</strong>, who can be reached at{' '}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>. The application&rsquo;s source
        code is open, but the running deployment and the database behind it are held in an account
        controlled solely by the operator. You can raise any privacy question or request directly
        at that address.
      </p>
      <p>
        <strong>
          Your data is stored safely and is never used for any malicious or illegal purpose.
        </strong>{' '}
        It is not sold, rented, traded, or handed to advertisers or data brokers, and it is not
        mined to build profiles of you.
      </p>

      <h2>What we store</h2>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Why we hold it</th>
            <th>Kept until</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Email address, display name, password hash</td>
            <td>To create your account and sign you in</td>
            <td>You delete your account</td>
          </tr>
          <tr>
            <td>Documents you upload, and the text chunks extracted from them</td>
            <td>To answer your questions with grounded, cited results</td>
            <td>You delete the document or your account</td>
          </tr>
          <tr>
            <td>Vector embeddings of those chunks</td>
            <td>To find the passages relevant to each question</td>
            <td>You delete the document or your account</td>
          </tr>
          <tr>
            <td>Chat threads, messages and generated content</td>
            <td>So your conversations and drafts persist between visits</td>
            <td>You delete the thread, item or account</td>
          </tr>
          <tr>
            <td>Provider API keys and service connections you add</td>
            <td>To call AI providers and agent tools on your behalf</td>
            <td>You remove the key or your account</td>
          </tr>
          <tr>
            <td>Usage counts, request logs and error logs</td>
            <td>To show your dashboard and to diagnose faults</td>
            <td>You delete your account</td>
          </tr>
          <tr>
            <td>Preferences (theme, default provider, tone, auto-approve choices)</td>
            <td>To keep the app configured the way you left it</td>
            <td>You delete your account</td>
          </tr>
        </tbody>
      </table>
      <p>
        We do not collect analytics about your browsing, we do not run advertising or tracking
        pixels, and we do not use third-party behavioural analytics.
      </p>

      <h2>Secrets are encrypted at rest</h2>
      <p>
        API keys and service connection tokens are encrypted with{' '}
        <strong>AES-256-GCM</strong> before they touch the database. Only the ciphertext, the
        initialisation vector, the authentication tag and a short non-reversible preview (such as
        the last four characters) are stored &mdash; never the key itself. Passwords are stored
        only as bcrypt hashes and cannot be reversed. Password-reset and email-verification links
        are stored only as SHA-256 hashes, so a copy of the database cannot be used to replay them.
      </p>

      <h2>Third parties that see your content</h2>
      <p>
        IgniteAI Studio is a client for AI providers you choose. When you send a message, generate
        content or ingest a document, the relevant text is transmitted to the provider selected for
        that request &mdash; for example Groq, OpenAI, Azure OpenAI, Google Gemini, Mistral,
        Cohere, Cerebras, OpenRouter, Together, GitHub Models, Hugging Face or Cloudflare Workers
        AI. That provider&rsquo;s own privacy terms then apply to the data in transit and to any
        retention on their side. We do not control those terms, so review the policy of whichever
        provider you enable.
      </p>
      <p>
        If you choose the local connection type and run Ollama, your prompts and documents are
        processed on your own machine and are not sent to any third party at all.
      </p>
      <p>
        Agent tools only reach outside services you explicitly connect (such as GitHub or Gmail),
        and only for actions you approve. Every action the agent proposes is shown to you before it
        runs.
      </p>

      <h2>Your rights and controls</h2>
      <ul>
        <li>
          <strong>Access and export.</strong> Your documents, chats and generated content are all
          visible in the app, and generated content can be exported as <code>.txt</code>,{' '}
          <code>.md</code> or <code>.docx</code>.
        </li>
        <li>
          <strong>Correction.</strong> Account details and preferences can be changed at any time
          from Account Settings.
        </li>
        <li>
          <strong>Deletion.</strong> Delete individual documents, threads or saved content from
          within the app. Deleting your account from Account Settings removes your user record,
          documents, chats, generated content, keys, connections, logs and preferences.
        </li>
        <li>
          <strong>Withdrawing keys.</strong> Removing a provider key stops that provider being used
          for your requests immediately.
        </li>
      </ul>
      <p>
        To exercise any of these rights by email, or to ask what is held about you, write to{' '}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
      </p>

      <h2>Children</h2>
      <p>
        This service is not directed at children under 13, and accounts should not be created for
        them. If you believe a child has registered, contact the operator and the account will be
        removed.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If this policy changes in a way that materially affects you, the updated date at the top of
        this page will change and, where the change is significant, you will be notified in the
        application.
      </p>
    </LegalPage>
  );
}
