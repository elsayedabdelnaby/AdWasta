import { useSession } from '../context/Session';
import { useResource } from '../lib/useResource';
import { Card, DataState, NoTenant, PageHead, StatusBadge } from '../components/ui';
import { shortDate } from '../lib/format';

interface AuditRow {
  id: string;
  actorType: string;
  actorId: string | null;
  category: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  message: string;
  createdAt: string;
}

export default function Audit() {
  const { tenantId, api } = useSession();
  const res = useResource(async () => {
    if (!tenantId) return { audit: [] as AuditRow[] };
    return api.get<{ audit: AuditRow[] }>(`/tenants/${tenantId}/audit?limit=200`);
  }, [tenantId]);

  if (!tenantId) return (<><PageHead title="Audit Log" /><NoTenant /></>);

  return (
    <>
      <PageHead title="Audit Log" subtitle="Append-only compliance record (approvals, publishes, credential changes)." action={<button onClick={res.reload}>Refresh</button>} />
      <Card>
        <DataState resource={res} empty={(d) => d.audit.length === 0}>
          {({ audit }) => (
            <table>
              <thead><tr><th>When</th><th>Category</th><th>Action</th><th>Actor</th><th>Resource</th><th>Message</th></tr></thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="nowrap faint">{shortDate(a.createdAt)}</td>
                    <td><StatusBadge status={a.category} /></td>
                    <td className="mono">{a.action}</td>
                    <td className="faint nowrap">{a.actorType}{a.actorId ? `:${a.actorId}` : ''}</td>
                    <td className="faint">{a.resourceType ?? '—'}</td>
                    <td className="muted">{a.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataState>
      </Card>
    </>
  );
}
