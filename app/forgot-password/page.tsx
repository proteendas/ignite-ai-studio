import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Forgot password · IgniteAI Studio',
  description: 'Request a link to reset your IgniteAI Studio password.',
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      icon="bi-key"
      title="Forgot your password?"
      description="Enter the email on your account and we'll send you a link to set a new password."
      footer={
        <>
          Remembered it?{' '}
          <Link href="/login" className="focus-ignite text-ignite-light hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
