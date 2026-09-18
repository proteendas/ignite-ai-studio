import { PublicShell } from '@/components/layout/PublicShell';

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell width="wide">{children}</PublicShell>;
}
