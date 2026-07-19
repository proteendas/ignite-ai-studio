'use client';

import { useState, FormEvent } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { useToast } from '@/components/ui/Toaster';

export function ChangePasswordForm() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setValidationError(null);

    if (newPassword.length < 8) {
      setValidationError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setValidationError('New password and confirmation do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setValidationError(json.error ?? 'Failed to change password.');
        return;
      }
      toast('Password changed successfully.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setValidationError('Failed to change password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <i className="bi bi-shield-lock text-lg text-ignite" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-content">Change password</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="current-password"
            className="mb-1 block text-xs text-content-muted"
          >
            Current password
          </label>
          <PasswordInput
            id="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
            required
            autoComplete="current-password"
            placeholder="••••••••"
            disabled={submitting}
          />
        </div>

        <div>
          <label
            htmlFor="new-password"
            className="mb-1 block text-xs text-content-muted"
          >
            New password
          </label>
          <PasswordInput
            id="new-password"
            value={newPassword}
            onChange={setNewPassword}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            disabled={submitting}
          />
        </div>

        <div>
          <label
            htmlFor="confirm-new-password"
            className="mb-1 block text-xs text-content-muted"
          >
            Confirm new password
          </label>
          <PasswordInput
            id="confirm-new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Repeat new password"
            disabled={submitting}
          />
        </div>

        {validationError && (
          <p className="text-sm text-ignite-light" role="alert">
            {validationError}
          </p>
        )}

        <div className="flex items-center justify-end">
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? <Spinner /> : <i className="bi bi-shield-lock" aria-hidden="true" />}
            Update password
          </Button>
        </div>
      </form>
    </Card>
  );
}
