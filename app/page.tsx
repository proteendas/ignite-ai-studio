import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';

export default async function RootPage() {
  const session = await getServerSession(authOptions);
  redirect(session?.user ? '/dashboard' : '/login');
}
