import type { Metadata } from 'next';
import { StatusPage } from '@/components/states';

export const metadata: Metadata = { title: 'Access denied · IgniteAI Studio' };

export default function ForbiddenPage() {
  return (
    <StatusPage
      code="403"
      icon="bi-shield-lock"
      title="You don't have access to this"
      description="Your account is signed in but isn't allowed to view this resource. If you think that's wrong, the owner of the resource can grant you access."
      actions={[
        { href: '/dashboard', label: 'Back to dashboard', icon: 'bi-speedometer2' },
        { href: '/support', label: 'Request access', icon: 'bi-life-preserver', variant: 'secondary' },
      ]}
    />
  );
}
