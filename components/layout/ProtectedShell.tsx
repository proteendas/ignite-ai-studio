'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { OnboardingTour } from '@/components/onboarding/OnboardingTour';

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-base">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto overscroll-y-contain p-4 md:p-6">{children}</main>
      </div>
      {/* Self-gating: renders only on first login (checks /api/onboarding/status). */}
      <OnboardingTour />
    </div>
  );
}
