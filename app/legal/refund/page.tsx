import { LegalPage, legalMetadata, OPERATOR } from '@/components/legal/LegalPage';

export const metadata = legalMetadata(
  'Refund Policy',
  'IgniteAI Studio is free to use and collects no payments, so no refunds arise.'
);

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund Policy"
      intro="The short version: IgniteAI Studio charges nothing, so there is nothing to refund."
    >
      <h2>No charges are made</h2>
      <p>
        IgniteAI Studio is provided <strong>free of charge</strong>. There are no plans, no
        subscriptions, no one-off purchases and no usage fees. The service does not collect card
        details or any other payment information, and no payment gateway is connected to it.
      </p>
      <p>
        Because no money changes hands, no refund can arise from your use of the service.
      </p>

      <h2>Charges from AI providers are separate</h2>
      <p>
        If you add your own provider API key &mdash; for example for OpenAI, Azure OpenAI, Google
        Gemini, Mistral or another supported provider &mdash; that provider bills you directly under
        its own agreement with you. Those charges are between you and the provider.{' '}
        <strong>We never receive that money and cannot refund it.</strong>
      </p>
      <p>
        To dispute or seek a refund for provider usage, contact that provider&rsquo;s support. To
        stop further usage immediately, remove the key from Account Settings; once removed, it is no
        longer used for any request.
      </p>
      <p>
        Several supported providers offer a free tier, and the local connection type runs models on
        your own machine with no API cost at all.
      </p>

      <h2>If you were ever charged</h2>
      <p>
        If you believe you have been charged by IgniteAI Studio itself, that is an error &mdash; no
        such mechanism exists. Contact <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>{' '}
        straight away with the details so it can be investigated.
      </p>

      <h2>Related</h2>
      <p>
        To close your account and remove your data, see the{' '}
        <a href="/legal/cancellation">Cancellation Policy</a>.
      </p>
    </LegalPage>
  );
}
