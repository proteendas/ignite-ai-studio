'use client';

import { formatRelative, formatDateTime } from '@/lib/datetime';

export interface ActivityItem {
  id: string;
  ownerId: string;
  type: string;
  summary: string;
  createdAt: string;
}

export interface ActivityFeedProps {
  activity: ActivityItem[];
}

const TYPE_ICON: Record<string, string> = {
  upload: 'bi-upload',
  chat: 'bi-chat-dots',
  generate: 'bi-megaphone',
  delete: 'bi-trash',
};

function iconForType(type: string): string {
  return TYPE_ICON[type] ?? 'bi-dot';
}

export function ActivityFeed({ activity }: ActivityFeedProps) {
  if (activity.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <i
          className="bi bi-clock-history text-2xl text-content-muted"
          aria-hidden="true"
        />
        <p className="text-sm text-content-muted">
          No activity yet. Your recent actions will show up here.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-surface-3">
      {activity.map((item) => (
        <li key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ignite-light">
            <i className={`bi ${iconForType(item.type)}`} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-content">{item.summary}</p>
            <p className="mt-0.5 text-xs text-content-muted" title={formatDateTime(item.createdAt)}>
              {formatRelative(item.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
