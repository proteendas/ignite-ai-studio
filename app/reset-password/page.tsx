import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { ResetPasswordForm } from './ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Reset password · IgniteAI Studio',
  description: 'Choose a new password for your IgniteAI Studio account.',
};

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  return (
    <AuthShell
      icon="bi-shield-lock"
      title="Choose a new password"
      description="Pick something you don't use anywhere else. At least 8 characters."
      footer={
        <Link href="/login" className="focus-ignite text-ignite-light hover:underline">
          Back to sign in
        </Link>
      }
    >
      <ResetPasswordForm token={searchParams.token ?? ''} />
    </AuthShell>
  );
}
