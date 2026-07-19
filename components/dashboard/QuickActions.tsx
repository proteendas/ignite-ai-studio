'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';

interface QuickAction {
  href: string;
  icon: string;
  title: string;
  description: string;
}

const ACTIONS: QuickAction[] = [
  {
    href: '/chat',
    icon: 'bi-chat-dots',
    title: 'Start a chat',
    description: 'Ask grounded questions across your documents and data.',
  },
  {
    href: '/documents',
    icon: 'bi-upload',
    title: 'Upload a document',
    description: 'Add PDF, DOCX, or TXT files to ground your assistant.',
  },
  {
    href: '/content-generator',
    icon: 'bi-megaphone',
    title: 'Generate content',
    description: 'Create marketing copy grounded in your ingested docs.',
  },
];

export function QuickActions() {
  return (
    <div className="flex flex-col gap-3">
      {ACTIONS.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="focus-ignite rounded-lg"
        >
          <Card className="flex items-center gap-4 transition-shadow hover-glow">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-ignite/15 text-xl text-ignite">
              <i className={`bi ${action.icon}`} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-content">{action.title}</h3>
                <i
                  className="bi bi-arrow-right text-content-muted"
                  aria-hidden="true"
                />
              </div>
              <p className="mt-0.5 text-sm text-content-muted">{action.description}</p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
