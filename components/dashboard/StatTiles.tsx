'use client';

import { Card } from '@/components/ui/Card';

export interface StatTilesProps {
  tokensUsed: number;
  documents: number;
  contentPieces: number;
  totalRequests: number;
}

interface Tile {
  key: string;
  icon: string;
  label: string;
  value: number;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function StatTiles({
  tokensUsed,
  documents,
  contentPieces,
  totalRequests,
}: StatTilesProps) {
  const tiles: Tile[] = [
    { key: 'tokens', icon: 'bi-cpu', label: 'Tokens Used', value: tokensUsed },
    {
      key: 'documents',
      icon: 'bi-file-earmark-text',
      label: 'Documents Ingested',
      value: documents,
    },
    {
      key: 'content',
      icon: 'bi-megaphone',
      label: 'Content Pieces Generated',
      value: contentPieces,
    },
    {
      key: 'requests',
      icon: 'bi-activity',
      label: 'Total Requests',
      value: totalRequests,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.key} className="flex flex-col gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-ignite/15 text-xl text-ignite shadow-glow-sm">
            <i className={`bi ${tile.icon}`} aria-hidden="true" />
          </span>
          <div>
            <div className="text-2xl font-semibold tabular-nums text-content">
              {formatNumber(tile.value)}
            </div>
            <div className="mt-0.5 text-sm text-content-muted">{tile.label}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}
