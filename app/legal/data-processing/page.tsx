import { LegalPage, legalMetadata, OPERATOR } from '@/components/legal/LegalPage';

export const metadata = legalMetadata(
  'Data Processing Agreement',
  'Processor terms for organisations using IgniteAI Studio with personal data.'
);

export default function DataProcessingPage() {
  return (
    <LegalPage
      title="Data Processing Agreement"
      intro="If you use IgniteAI Studio to process personal data for which you are the controller, these processor terms apply alongside the Terms of Service."
    >
      <h2>1. Roles</h2>
      <p>
        You are the <strong>controller</strong> of any personal data contained in the documents and
        prompts you submit. <strong>{OPERATOR.name}</strong> (
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>) acts as the{' '}
        <strong>processor</strong>, handling that data only to provide the service to you.
      </p>

      <h2>2. Scope and instructions</h2>
      <p>
        We process your data only on your documented instructions, which the act of using the
        service constitutes: storing your documents, extracting and embedding their text, retrieving
        relevant passages, transmitting the necessary content to the AI provider you have selected,
        and returning results. We will not process your data for any other purpose, and we will not
        use it to train models.
      </p>

      <h2>3. Subject matter and duration</h2>
      <table>
        <thead>
          <tr><th>Item</th><th>Detail</th></tr>
        </thead>
        <tbody>
          <tr><td>Subject matter</td><td>Document analysis, retrieval-augmented question answering, content generation, and approved agent actions</td></tr>
          <tr><td>Duration</td><td>For as long as your account exists, ending on deletion</td></tr>
          <tr><td>Nature and purpose</td><td>Storage, text extraction, embedding, retrieval, transmission to selected AI providers, generation of output</td></tr>
          <tr><td>Categories of data</td><td>Whatever your uploaded documents and prompts contain, plus account identifiers and usage records</td></tr>
          <tr><td>Categories of data subject</td><td>Your users, customers, employees or other individuals referenced in your material</td></tr>
        </tbody>
      </table>

      <h2>4. Confidentiality</h2>
      <p>
        Access to your data is limited to the operator, who is bound to keep it confidential.
        Nobody else is given access to your documents, chats or keys.
      </p>

      <h2>5. Security measures</h2>
      <p>
        We apply the technical measures described in the{' '}
        <a href="/legal/security">Security Policy</a>, including bcrypt password hashing,
        AES-256-GCM encryption of stored API keys and connection tokens, per-owner scoping of every
        query, validated request bodies, rate limiting, and human approval of agent actions that
        cause side effects.
      </p>

      <h2>6. Sub-processors</h2>
      <p>
        The AI providers you enable act as sub-processors for the content you send them. You choose
        which ones to enable, so you control this list; the currently supported set is documented in
        the <a href="/legal/privacy">Privacy Policy</a>. Where the deployment is hosted by an
        infrastructure provider, that provider is also a sub-processor. If you select the local
        connection type and run Ollama, no AI sub-processor is involved at all.
      </p>
      <p>
        You authorise these sub-processors by enabling them. We will not add a sub-processor of our
        own that has access to your content without telling you.
      </p>

      <h2>7. International transfers</h2>
      <p>
        AI providers may process your content outside your own country. Because you select the
        provider for each request, you determine where that transfer goes. If your organisation is
        subject to residency requirements, select a provider that meets them, or run locally with
        Ollama.
      </p>

      <h2>8. Assisting you</h2>
      <p>
        We will help you, so far as is reasonable, to respond to data-subject requests, to carry out
        impact assessments, and to demonstrate compliance. Most requests can be satisfied directly
        through the application, which lets you view, export and delete your content yourself.
      </p>

      <h2>9. Personal data breach</h2>
      <p>
        If we become aware of a breach affecting your data, we will notify you without undue delay
        at the address on your account, describing what happened, the data affected, the likely
        consequences and the steps taken.
      </p>

      <h2>10. Deletion and return</h2>
      <p>
        You can delete any document, thread or generated item at any time. Deleting your account
        removes your user record and all associated documents, embeddings, chats, generated content,
        keys, connections, logs and preferences. Content already transmitted to a third-party AI
        provider is subject to that provider&rsquo;s own retention terms and is outside our control.
      </p>

      <h2>11. Audit</h2>
      <p>
        On reasonable written request, we will provide the information needed to demonstrate
        compliance with these terms. Because the application&rsquo;s source code is open, you can
        also inspect directly how data is handled.
      </p>

      <h2>12. Contact</h2>
      <p>
        To put this agreement in place formally, or to raise a data-protection question, write to{' '}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
      </p>
    </LegalPage>
  );
}
