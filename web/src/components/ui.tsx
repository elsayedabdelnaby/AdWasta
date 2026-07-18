import type { ReactNode } from 'react';
import type { Resource } from '../lib/useResource';

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`card${className ? ` ${className}` : ''}`}>
      {(title || action) && (
        <div className="card-head">
          {title ? <h3>{title}</h3> : <span />}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export type BadgeColor = 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'purple';

export function Badge({ color = 'gray', children }: { color?: BadgeColor; children: ReactNode }) {
  return <span className={`badge ${color}`}>{children}</span>;
}

const STATUS_COLORS: Record<string, BadgeColor> = {
  pending: 'amber',
  approved: 'green',
  completed: 'green',
  published: 'green',
  rejected: 'red',
  failed: 'red',
  error: 'red',
  open: 'amber',
  dismissed: 'gray',
  running: 'blue',
  queued: 'blue',
  provisional: 'purple',
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge>—</Badge>;
  return <Badge color={STATUS_COLORS[status] ?? 'gray'}>{status}</Badge>;
}

export function RiskBadge({ risk }: { risk: string | null | undefined }) {
  if (!risk) return null;
  const color: BadgeColor = risk === 'HIGH' ? 'red' : risk === 'MEDIUM' ? 'amber' : 'gray';
  return <Badge color={color}>{risk} risk</Badge>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function PageHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      <div style={{ flex: 1 }} />
      {action}
    </div>
  );
}

export function NoTenant() {
  return (
    <div className="banner info">
      No workspace selected. Create one or paste a tenant id in the bar above to begin.
    </div>
  );
}

export function ErrorBanner({ error }: { error: Error }) {
  const status = (error as { status?: number }).status;
  let hint = '';
  if (status === 403) hint = ' — the current dev user is not a member of this tenant.';
  else if (status === 401) hint = ' — not authenticated (set a dev user above).';
  else if (status === 400) hint = ' — pick or create a tenant first.';
  return (
    <div className="banner error">
      {error.message}
      {hint}
    </div>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  return <pre className="json">{JSON.stringify(value, null, 2)}</pre>;
}

/**
 * Renders the standard loading / error / empty / ready states for a Resource so
 * every page handles them consistently.
 */
export function DataState<T>({
  resource,
  empty,
  children,
}: {
  resource: Resource<T>;
  empty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}) {
  if (resource.loading && resource.data === undefined) {
    return (
      <div className="muted" style={{ padding: 24 }}>
        <span className="spinner" /> Loading…
      </div>
    );
  }
  if (resource.error) return <ErrorBanner error={resource.error} />;
  if (resource.data === undefined) return <EmptyState>No data.</EmptyState>;
  if (empty && empty(resource.data)) return <EmptyState>Nothing here yet.</EmptyState>;
  return <>{children(resource.data)}</>;
}
