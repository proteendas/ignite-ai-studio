'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { SiteFooter } from './SiteFooter';
import { OnboardingTour } from '@/components/onboarding/OnboardingTour';
import { VerifyEmailBanner } from '@/components/auth/VerifyEmailBanner';

export function ProtectedShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-base">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        {/* The scroll container holds the footer too, so the legal links are
            reachable from inside the app without stealing vertical space from
            the fixed-height views (chat) above it. */}
        <div className="flex flex-1 flex-col overflow-y-auto overscroll-y-contain">
          <VerifyEmailBanner />
          <main className="flex-1 p-4 md:p-6">{children}</main>
          <SiteFooter />
        </div>
      </div>
      {/* Self-gating: renders only on first login (checks /api/onboarding/status). */}
      <OnboardingTour />
    </div>
  );
}
