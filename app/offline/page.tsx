import type { Metadata } from 'next';
import { StatusPage } from '@/components/states';
import { OfflineRetry } from './OfflineRetry';

export const metadata: Metadata = { title: 'No connection · IgniteAI Studio' };

export default function OfflinePage() {
  return (
    <StatusPage
      icon="bi-wifi-off"
      tone="neutral"
      title="You're offline"
      description="IgniteAI Studio needs a connection to reach your documents and AI providers. We'll pick up where you left off once you're back online."
    >
      <OfflineRetry />
    </StatusPage>
  );
}
