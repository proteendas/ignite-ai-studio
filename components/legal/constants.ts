import type { Metadata } from 'next';

/**
 * Plain data shared by the policy pages, the footer and the support form.
 * Kept separate from LegalPage.tsx so client components can import the
 * operator details without dragging a server component into their bundle.
 */
export const OPERATOR = {
  name: 'Proteen Das',
  email: 'prot.das15@gmail.com',
  product: 'IgniteAI Studio',
} as const;

/** Single source of truth for the "last updated" stamp across all policies. */
export const LAST_UPDATED = '18 September 2026';

export const LEGAL_PAGES: { href: string; label: string; icon: string; summary: string }[] = [
  { href: '/legal/privacy', label: 'Privacy Policy', icon: 'bi-shield-lock', summary: 'What we store, why, and for how long.' },
  { href: '/legal/terms', label: 'Terms of Service', icon: 'bi-file-earmark-text', summary: 'The agreement covering your use of the service.' },
  { href: '/legal/cookies', label: 'Cookie Policy', icon: 'bi-cookie', summary: 'The cookies we set and what each one does.' },
  { href: '/legal/cookie-preferences', label: 'Cookie Preferences', icon: 'bi-sliders', summary: 'Change your cookie choices.' },
  { href: '/legal/acceptable-use', label: 'Acceptable Use Policy', icon: 'bi-hand-thumbs-up', summary: 'What you may and may not do here.' },
  { href: '/legal/community-guidelines', label: 'Community Guidelines', icon: 'bi-people', summary: 'How we expect people to behave.' },
  { href: '/legal/security', label: 'Security Policy', icon: 'bi-shield-check', summary: 'How your data is protected.' },
  { href: '/legal/responsible-disclosure', label: 'Responsible Disclosure', icon: 'bi-bug', summary: 'How to report a vulnerability.' },
  { href: '/legal/data-processing', label: 'Data Processing Agreement', icon: 'bi-diagram-3', summary: 'Processor terms for business users.' },
  { href: '/legal/refund', label: 'Refund Policy', icon: 'bi-cash-stack', summary: 'The service is free; how that affects charges.' },
  { href: '/legal/cancellation', label: 'Cancellation Policy', icon: 'bi-x-octagon', summary: 'Closing your account and what happens to your data.' },
  { href: '/legal/disclaimer', label: 'Disclaimer', icon: 'bi-exclamation-triangle', summary: 'Limits on AI-generated output.' },
  { href: '/legal/accessibility', label: 'Accessibility Statement', icon: 'bi-universal-access', summary: 'Our accessibility commitments.' },
];

export function legalMetadata(title: string, description: string): Metadata {
  return { title: `${title} · ${OPERATOR.product}`, description };
}
