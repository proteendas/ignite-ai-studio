import { LegalPage, legalMetadata } from '@/components/legal/LegalPage';
import { CookiePreferences } from './CookiePreferences';

export const metadata = legalMetadata(
  'Cookie Preferences',
  'Review and clear what IgniteAI Studio stores in your browser.'
);

export default function CookiePreferencesPage() {
  return (
    <LegalPage
      title="Cookie Preferences"
      intro="A live view of what IgniteAI Studio has stored in this browser, and a way to clear the parts that are optional."
    >
      <p>
        We do not run advertising, re-targeting or third-party analytics, so there is no tracking to
        opt out of. What remains is the authentication cookies the service needs to sign you in, and
        one optional preference. Both are listed below as they stand in this browser right now.
      </p>

      <CookiePreferences />

      <p>
        Clearing the authentication cookies signs you out; do that from the Sign out button, or
        through your browser&rsquo;s own site-data controls. For the full list and the reason behind
        each entry, see the <a href="/legal/cookies">Cookie Policy</a>.
      </p>
    </LegalPage>
  );
}
