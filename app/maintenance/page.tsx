import type { Metadata } from 'next';
import { StatusPage } from '@/components/states';

export const metadata: Metadata = { title: 'Under maintenance · IgniteAI Studio' };

/**
 * Served for every route while MAINTENANCE_MODE=true (see middleware.ts).
 * Deliberately has no link back into the app, since nothing behind it works.
 */
export default function MaintenancePage() {
  return (
    <StatusPage
      icon="bi-tools"
      tone="neutral"
      title="IgniteAI Studio is under maintenance"
      description="We're applying an update and will be back shortly. Your documents, chats and settings are untouched — nothing is lost while we're away."
      actions={[{ href: '/legal/security', label: 'Security policy', icon: 'bi-shield-check', variant: 'secondary' }]}
    />
  );
}
