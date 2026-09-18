import { PublicShell } from '@/components/layout/PublicShell';

/**
 * The policy pages sit outside the authenticated shell on purpose — they must
 * be readable by signed-out visitors and signed-in users alike.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
