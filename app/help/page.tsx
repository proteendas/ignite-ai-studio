import type { Metadata } from 'next';
import Link from 'next/link';
import { OPERATOR } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Help centre · IgniteAI Studio',
  description: 'Guides and answers for getting the most out of IgniteAI Studio.',
};

const TOPICS = [
  {
    icon: 'bi-rocket-takeoff',
    title: 'Getting started',
    items: [
      { q: 'How do I add my first document?', a: 'Open Documents and drop a PDF, DOCX, TXT or Markdown file onto the upload area. Ingestion runs automatically — the document shows as processing while its text is extracted, chunked and embedded, then flips to ready.' },
      { q: 'Why can’t I chat with a document yet?', a: 'Chatting is blocked until ingestion finishes, so an answer is never built on a half-indexed file. Wait for the ready badge on the Documents page.' },
      { q: 'Do I need an API key?', a: 'You need either a provider key or a local Ollama server. Several supported providers have a free tier, and the local connection type needs no key at all.' },
    ],
  },
  {
    icon: 'bi-chat-dots',
    title: 'Chat and retrieval',
    items: [
      { q: 'What do Grounded, General and Agent mode do?', a: 'Grounded answers only from your documents and shows the exact passages used. General answers from the model’s own knowledge with no retrieval. Agent can use tools to take real actions, asking your approval before anything is written or sent.' },
      { q: 'How do I check an answer?', a: 'In grounded mode, open the Sources panel. It lists the chunks retrieved and their similarity scores, so you can read the original passage behind any claim.' },
      { q: 'Can I change the tone?', a: 'Yes — the tone selector in the chat header changes the register of replies, and Account Settings sets your default.' },
    ],
  },
  {
    icon: 'bi-robot',
    title: 'Agent and tools',
    items: [
      { q: 'Will the agent act without asking?', a: 'No. Anything that writes or sends is shown for Approve, Edit or Cancel first. Only read-only tools can be auto-approved, and only if you switch that on yourself.' },
      { q: 'Where do I see what it did?', a: 'Each thread has an Agent Activity Log recording every proposal, your decision, and the result.' },
      { q: 'How do I connect GitHub or Gmail?', a: 'Account Settings has a Connections section. Tokens are encrypted before storage and can be removed at any time.' },
    ],
  },
  {
    icon: 'bi-shield-lock',
    title: 'Account and security',
    items: [
      { q: 'I forgot my password.', a: 'Use the forgot password link on the sign-in page. The reset link expires in an hour and works once.' },
      { q: 'How are my API keys stored?', a: 'Encrypted with AES-256-GCM before they reach the database. Only ciphertext and a short preview are kept — the key itself is never stored in readable form.' },
      { q: 'How do I delete everything?', a: 'Account Settings has a delete-account action. It removes your documents, chats, generated content, keys, connections, logs and preferences immediately and permanently.' },
    ],
  },
];

export default function HelpCentrePage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-content">Help centre</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-content-muted">
          Answers to the questions that come up most. If yours isn&rsquo;t here,{' '}
          <Link href="/support" className="focus-ignite text-ignite-light hover:underline">
            contact support
          </Link>
          .
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        {TOPICS.map((topic) => (
          <section
            key={topic.title}
            className="rounded-lg border border-surface-3 bg-surface-1 p-5"
          >
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-content">
              <i className={`bi ${topic.icon} text-ignite`} aria-hidden="true" />
              {topic.title}
            </h2>
            <dl className="space-y-4">
              {topic.items.map((item) => (
                <div key={item.q}>
                  <dt className="text-sm font-medium text-content">{item.q}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-content-muted">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <section className="rounded-lg border border-surface-3 bg-surface-1 p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-content">
          <i className="bi bi-journal-text text-ignite" aria-hidden="true" />
          Still stuck?
        </h2>
        <p className="text-sm leading-relaxed text-content-muted">
          Email <a href={`mailto:${OPERATOR.email}`} className="text-ignite-light hover:underline">{OPERATOR.email}</a>{' '}
          or open the <Link href="/support" className="text-ignite-light hover:underline">support page</Link>, which
          collects the details needed to diagnose a problem quickly.
        </p>
      </section>
    </div>
  );
}
