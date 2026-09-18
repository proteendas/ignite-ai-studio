import type { Metadata } from 'next';
import { StatusPage } from '@/components/states';

export const metadata: Metadata = { title: 'Page not found · IgniteAI Studio' };

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      icon="bi-compass"
      title="We couldn't find that page"
      description="The link may be out of date, or the page may have been moved or deleted."
      actions={[
        { href: '/dashboard', label: 'Go to dashboard', icon: 'bi-speedometer2' },
        { href: '/help', label: 'Help centre', icon: 'bi-life-preserver', variant: 'secondary' },
      ]}
    />
  );
}
