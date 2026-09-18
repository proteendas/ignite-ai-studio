import type { Metadata } from 'next';
import { StatusPage } from '@/components/states';

export const metadata: Metadata = { title: 'Session expired · IgniteAI Studio' };

export default function SessionExpiredPage() {
  return (
    <StatusPage
      icon="bi-hourglass-split"
      tone="neutral"
      title="Your session has expired"
      description="You were signed out to keep your account secure. Sign in again to carry on — nothing you saved has been lost."
      actions={[
        { href: '/login', label: 'Sign in again', icon: 'bi-box-arrow-in-right' },
        { href: '/legal/security', label: 'Why did this happen?', icon: 'bi-shield-check', variant: 'secondary' },
      ]}
    />
  );
}
