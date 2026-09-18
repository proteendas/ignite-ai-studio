import { LegalPage, legalMetadata, OPERATOR } from '@/components/legal/LegalPage';

export const metadata = legalMetadata(
  'Responsible Disclosure',
  'How to report a security vulnerability in IgniteAI Studio.'
);

export default function ResponsibleDisclosurePage() {
  return (
    <LegalPage
      title="Responsible Disclosure"
      intro="If you have found a security flaw, we want to hear about it. This page sets out how to report it and what you can expect in return."
    >
      <h2>How to report</h2>
      <p>
        Email <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a> with the subject line
        &ldquo;Security report&rdquo;. Please include:
      </p>
      <ul>
        <li>A description of the issue and why you believe it is a security problem.</li>
        <li>Clear steps to reproduce it, ideally with a minimal example.</li>
        <li>The affected URL, endpoint or component.</li>
        <li>Any proof-of-concept you used, and your assessment of the impact.</li>
      </ul>

      <h2>What we ask of you</h2>
      <ul>
        <li>Report promptly and give us reasonable time to fix the issue before disclosing it publicly.</li>
        <li>Test only against your own account and your own data.</li>
        <li>Do not access, modify or delete anyone else&rsquo;s data. If you encounter someone else&rsquo;s data, stop and tell us.</li>
        <li>Do not run denial-of-service, spam or brute-force testing against the live service.</li>
        <li>Do not use social engineering or physical attacks against the operator or any provider.</li>
      </ul>

      <h2>What you can expect</h2>
      <ul>
        <li>An acknowledgement of your report, normally within five working days.</li>
        <li>An assessment of severity and an indication of the expected fix timeline.</li>
        <li>An update when the fix ships.</li>
        <li>Credit for the finding if you would like it &mdash; just say so in your report.</li>
      </ul>
      <p>
        This is a free, individually-operated service, so there is no paid bug bounty. Reports are
        still genuinely welcome and are taken seriously.
      </p>

      <h2>Safe harbour</h2>
      <p>
        If you act in good faith within the boundaries above, we will not pursue or support legal
        action against you for your research, and we will treat your report as an authorised
        contribution to the security of the service.
      </p>

      <h2>Out of scope</h2>
      <ul>
        <li>Vulnerabilities in third-party AI providers or connected services &mdash; report those to their own security teams.</li>
        <li>Findings that require a compromised device, a malicious browser extension, or physical access to a signed-in machine.</li>
        <li>Missing hardening headers or best-practice suggestions with no demonstrable exploit.</li>
        <li>Self-inflicted issues in a deployment you run yourself with insecure configuration.</li>
      </ul>
    </LegalPage>
  );
}
