import { LegalPage, legalMetadata, OPERATOR } from '@/components/legal/LegalPage';

export const metadata = legalMetadata(
  'Acceptable Use Policy',
  'What you may and may not do with IgniteAI Studio.'
);

export default function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable Use Policy"
      intro="IgniteAI Studio is a tool for working with your own documents and data. This policy sets the boundary on how it may be used."
    >
      <h2>The principle</h2>
      <p>
        Everything stored here is kept safe and is not used for any malicious or illegal activity
        &mdash; and the same is asked of you. Use the service for lawful work on material you are
        entitled to process.
      </p>

      <h2>You must not</h2>
      <ul>
        <li>
          <strong>Break the law.</strong> No activity that is illegal where you are, or where the
          service is operated.
        </li>
        <li>
          <strong>Upload material you have no right to.</strong> This includes other people&rsquo;s
          confidential documents, stolen data, and content that infringes copyright or trade
          secrets.
        </li>
        <li>
          <strong>Process sensitive personal data carelessly.</strong> Do not upload other
          people&rsquo;s health, financial, biometric or government-identifier data without a lawful
          basis and their knowledge.
        </li>
        <li>
          <strong>Generate harmful content.</strong> No malware, no phishing or fraud material, no
          content that sexualises minors, no targeted harassment, no incitement to violence, and no
          instructions for weapons intended to cause mass harm.
        </li>
        <li>
          <strong>Deceive people.</strong> Do not present AI output as human-authored where that
          misleads someone to their detriment, and do not impersonate a real person or organisation.
        </li>
        <li>
          <strong>Attack the service.</strong> No attempts to break authentication, reach another
          user&rsquo;s data, inject prompts to escape your own context, overload the service, or
          probe it for vulnerabilities outside the{' '}
          <a href="/legal/responsible-disclosure">Responsible Disclosure</a> process.
        </li>
        <li>
          <strong>Abuse the agent.</strong> Do not use connected tools to send spam, mass-message
          people, or take actions against accounts and repositories you do not control.
        </li>
        <li>
          <strong>Resell or strip-mine the service.</strong> No scraping, no automated bulk
          extraction, and no reselling access as your own product.
        </li>
      </ul>

      <h2>Agent actions are your responsibility</h2>
      <p>
        The agent asks before it writes or sends anything. Approving an action means you are
        accountable for it &mdash; including emails it sends and issues it opens on your behalf.
        Read what is proposed before you approve it.
      </p>

      <h2>Enforcement</h2>
      <p>
        Breaches may lead to content removal, suspension, or permanent closure of the account, in
        proportion to the seriousness of the breach and whether it is repeated. Activity that is
        unlawful or that endangers other users may be acted on immediately and without notice.
      </p>

      <h2>Reporting a breach</h2>
      <p>
        Report misuse to <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>. Include enough
        detail to identify what happened. Security vulnerabilities should go through{' '}
        <a href="/legal/responsible-disclosure">Responsible Disclosure</a> instead.
      </p>
    </LegalPage>
  );
}
