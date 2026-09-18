import { LegalPage, legalMetadata, OPERATOR } from '@/components/legal/LegalPage';

export const metadata = legalMetadata(
  'Community Guidelines',
  'How we expect people to behave around IgniteAI Studio.'
);

export default function CommunityGuidelinesPage() {
  return (
    <LegalPage
      title="Community Guidelines"
      intro="IgniteAI Studio is mostly a private workspace, but wherever people interact — shared content, support requests, issue reports — these expectations apply."
    >
      <h2>Be straight with people</h2>
      <p>
        Describe problems accurately, do not exaggerate to get attention, and do not misrepresent
        AI-generated text as something it is not. If you share content produced here and the
        distinction matters to your audience, say that a model wrote it.
      </p>

      <h2>Be decent</h2>
      <ul>
        <li>No harassment, threats, or abuse directed at anyone.</li>
        <li>
          No hate speech or demeaning content targeting people for their race, ethnicity, religion,
          caste, disability, gender, gender identity, sexual orientation, age or nationality.
        </li>
        <li>No doxxing &mdash; do not publish anyone&rsquo;s private information.</li>
        <li>No sexual content involving minors, in any form, ever.</li>
      </ul>

      <h2>Respect other people&rsquo;s data</h2>
      <p>
        If a document is not yours to process, do not upload it. If you are working with data about
        other people, handle it the way you would want your own handled &mdash; see the{' '}
        <a href="/legal/privacy">Privacy Policy</a> for how we hold it once it arrives.
      </p>

      <h2>Keep the service usable for everyone</h2>
      <p>
        Do not script bulk traffic, hammer the ingestion endpoint, or try to work around rate
        limits. The limits exist so that one account cannot degrade the service for others.
      </p>

      <h2>Report rather than retaliate</h2>
      <p>
        If someone is breaching these guidelines, report it to{' '}
        <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> rather than responding in kind.
      </p>

      <h2>Consequences</h2>
      <p>
        Most issues are resolved with a warning and a chance to correct course. Serious or repeated
        breaches lead to suspension or account closure. The{' '}
        <a href="/legal/acceptable-use">Acceptable Use Policy</a> sets the hard limits; these
        guidelines describe the spirit expected on top of them.
      </p>
    </LegalPage>
  );
}
