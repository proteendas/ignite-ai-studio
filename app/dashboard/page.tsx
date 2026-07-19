import { ProtectedShell } from '@/components/layout/ProtectedShell';
import { DashboardClient } from '@/components/dashboard/DashboardClient';

export default function DashboardPage() {
  return (
    <ProtectedShell>
      <DashboardClient />
    </ProtectedShell>
  );
}
