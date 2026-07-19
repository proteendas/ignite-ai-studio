import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { OnboardingTour } from '@/components/onboarding/OnboardingTour';

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-base">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
      {/* Self-gating: renders only on first login (checks /api/onboarding/status). */}
      <OnboardingTour />
    </div>
  );
}
