'use client';

import { useSession } from 'next-auth/react';
import { ProtectedShell } from '@/components/layout/ProtectedShell';
import { Card } from '@/components/ui/Card';
import { ProviderHealthPanel } from '@/components/providers/ProviderHealthPanel';
import { ApiKeyManager } from '@/components/settings/ApiKeyManager';
import { PreferencesForm } from '@/components/settings/PreferencesForm';
import { ConnectionsManager } from '@/components/settings/ConnectionsManager';
import { AutoApproveSettings } from '@/components/settings/AutoApproveSettings';
import { ChangePasswordForm } from '@/components/settings/ChangePasswordForm';
import { DangerZone } from '@/components/settings/DangerZone';

export default function SettingsPage() {
  const { data: session } = useSession();

  return (
    <ProtectedShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-content">Settings</h1>
          <p className="mt-1 text-sm text-content-muted">
            Manage your account, provider keys, defaults, and data.
          </p>
        </div>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <i className="bi bi-person-circle text-lg text-ignite" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-content">Account</h2>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-content-muted">Email</dt>
              <dd className="truncate text-content">{session?.user?.email ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-content-muted">Name</dt>
              <dd className="truncate text-content">{session?.user?.name || '—'}</dd>
            </div>
          </dl>
        </Card>

        <ProviderHealthPanel />

        <ApiKeyManager />

        <PreferencesForm />

        <ConnectionsManager />

        <AutoApproveSettings />

        <ChangePasswordForm />

        <DangerZone />
      </div>
    </ProtectedShell>
  );
}
