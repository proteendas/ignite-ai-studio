'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toaster';
import { StatTiles } from '@/components/dashboard/StatTiles';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { ActivityFeed, type ActivityItem } from '@/components/dashboard/ActivityFeed';

interface UsageSummary {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalRequests: number;
  byProvider: {
    provider: string;
    promptTokens: number;
    completionTokens: number;
    requests: number;
  }[];
}

interface UsageResponse {
  summary: UsageSummary;
  documents: number;
  contentPieces: number;
}

interface ActivityResponse {
  activity: ActivityItem[];
}

export function DashboardClient() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const [usageRes, activityRes] = await Promise.all([
          fetch('/api/usage'),
          fetch('/api/activity'),
        ]);

        if (!usageRes.ok || !activityRes.ok) {
          throw new Error('Request failed');
        }

        const usageData = (await usageRes.json()) as UsageResponse;
        const activityData = (await activityRes.json()) as ActivityResponse;

        if (!cancelled) {
          setUsage(usageData);
          setActivity(activityData.activity);
        }
      } catch {
        if (!cancelled) {
          toast('Could not load dashboard data.', 'error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const welcomeName = session?.user?.name ?? session?.user?.email ?? null;
  const tokensUsed = usage
    ? usage.summary.totalPromptTokens + usage.summary.totalCompletionTokens
    : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-content">Dashboard</h1>
        <p className="mt-1 text-sm text-content-muted">
          Welcome back{welcomeName ? `, ${welcomeName}` : ''}. Here is a snapshot of
          your workspace activity.
        </p>
      </header>

      {loading || !usage ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <StatTiles
          tokensUsed={tokensUsed}
          documents={usage.documents}
          contentPieces={usage.contentPieces}
          totalRequests={usage.summary.totalRequests}
        />
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-labelledby="quick-actions-heading" className="space-y-3">
          <h2
            id="quick-actions-heading"
            className="text-sm font-semibold uppercase tracking-wide text-content-muted"
          >
            Quick actions
          </h2>
          <QuickActions />
        </section>

        <section aria-labelledby="activity-heading" className="space-y-3">
          <h2
            id="activity-heading"
            className="text-sm font-semibold uppercase tracking-wide text-content-muted"
          >
            Recent activity
          </h2>
          <Card>
            {loading || activity === null ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-3/4" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ActivityFeed activity={activity} />
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
