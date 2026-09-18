import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { VerifyEmailClient } from './VerifyEmailClient';

export const metadata: Metadata = {
  title: 'Verify email · IgniteAI Studio',
  description: 'Confirm your email address for IgniteAI Studio.',
};

export default function VerifyEmailPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? '';

  return (
    <AuthShell
      icon="bi-envelope-check"
      title={token ? 'Verifying your email' : 'Verify your email'}
      description={
        token
          ? 'Hold on while we confirm this link.'
          : 'Confirming your address secures your account and lets us reach you about password resets.'
      }
      footer={
        <Link href="/dashboard" className="focus-ignite text-ignite-light hover:underline">
          Go to dashboard
        </Link>
      }
    >
      <VerifyEmailClient token={token} />
    </AuthShell>
  );
}
