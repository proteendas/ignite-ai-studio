'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toaster';

const CONFIRM_WORD = 'delete';

export function DangerZone() {
  const { toast } = useToast();
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const canDelete = confirm.trim().toLowerCase() === CONFIRM_WORD && !deleting;

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to delete account.');
      toast('Account deleted. Signing out…', 'success');
      await signOut({ callbackUrl: '/login' });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete account.', 'error');
      setDeleting(false);
    }
  }

  return (
    <Card className="border-ignite/50 shadow-glow-sm">
      <div className="mb-4 flex items-center gap-2">
        <i className="bi bi-exclamation-triangle text-lg text-ignite" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ignite-light">Danger zone</h2>
      </div>

      <p className="mb-4 text-sm text-content-muted">
        Deleting your account permanently removes your profile and <strong>all</strong> of your data
        &mdash; documents, chats, generated content, provider keys, preferences, and usage logs.
        This action cannot be undone.
      </p>

      <div className="space-y-3">
        <div>
          <label htmlFor="delete-confirm" className="mb-1 block text-xs text-content-muted">
            Type <span className="font-mono text-ignite-light">{CONFIRM_WORD}</span> to confirm
          </label>
          <input
            id="delete-confirm"
            type="text"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={CONFIRM_WORD}
            className="focus-ignite w-full max-w-xs rounded-md border border-ignite/40 bg-surface-2 px-3 py-2 text-sm text-content placeholder:text-content-muted"
          />
        </div>

        <Button
          type="button"
          variant="danger"
          onClick={() => void handleDelete()}
          disabled={!canDelete}
          aria-label="Delete account and all data"
        >
          {deleting ? <Spinner /> : <i className="bi bi-trash" aria-hidden="true" />}
          Delete account &amp; all data
        </Button>
      </div>
    </Card>
  );
}
