import { LegalPage, legalMetadata, OPERATOR } from '@/components/legal/LegalPage';

export const metadata = legalMetadata(
  'Cookie Policy',
  'The cookies and local storage IgniteAI Studio uses, and what each one is for.'
);

export default function CookiePolicyPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      intro="IgniteAI Studio uses a deliberately small number of cookies. None of them track you, and none are used for advertising."
    >
      <h2>What we use</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Purpose</th>
            <th>Lifetime</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>next-auth.session-token</code></td>
            <td>Strictly necessary</td>
            <td>Keeps you signed in. Without it every page load would log you out.</td>
            <td>Until sign-out or expiry</td>
          </tr>
          <tr>
            <td><code>next-auth.csrf-token</code></td>
            <td>Strictly necessary</td>
            <td>Protects sign-in and sign-out from cross-site request forgery.</td>
            <td>Session</td>
          </tr>
          <tr>
            <td><code>next-auth.callback-url</code></td>
            <td>Strictly necessary</td>
            <td>Returns you to the page you were heading for after signing in.</td>
            <td>Session</td>
          </tr>
          <tr>
            <td><code>igniteai-theme</code></td>
            <td>Preference (local storage)</td>
            <td>Remembers whether you chose the light or dark theme.</td>
            <td>Until you clear site data</td>
          </tr>
        </tbody>
      </table>

      <h2>What we do not use</h2>
      <ul>
        <li>No advertising or re-targeting cookies.</li>
        <li>No third-party behavioural analytics.</li>
        <li>No cross-site tracking, fingerprinting or data-broker pixels.</li>
      </ul>

      <h2>Strictly necessary cookies</h2>
      <p>
        The authentication cookies above are required for the service to function. They cannot be
        switched off while you are signed in, because switching them off would sign you out. They
        contain a signed session reference, not your password.
      </p>

      <h2>Preference storage</h2>
      <p>
        The theme choice is kept in your browser&rsquo;s local storage rather than in a cookie, so
        it is never transmitted to the server. Clearing your browser&rsquo;s site data resets it to
        the default dark theme.
      </p>

      <h2>Managing cookies</h2>
      <p>
        You can review and change what is stored on the{' '}
        <a href="/legal/cookie-preferences">Cookie Preferences</a> page, and you can clear or block
        cookies in your browser settings at any time. Blocking the strictly necessary cookies will
        prevent you from signing in.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about cookies go to <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.
      </p>
    </LegalPage>
  );
}
