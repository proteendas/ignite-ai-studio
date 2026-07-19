import { Badge } from '@/components/ui/Badge';

export function ProviderBadge({ provider }: { provider: string }) {
  return (
    <Badge tone="brand">
      <i className="bi bi-cpu" aria-hidden="true" />
      via {provider}
    </Badge>
  );
}
