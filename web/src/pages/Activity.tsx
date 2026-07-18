import { useState } from 'react';
import { useSession } from '../context/Session';
import { useResource } from '../lib/useResource';
import { Card, DataState, NoTenant, PageHead, StatusBadge } from '../components/ui';
import { relativeTime } from '../lib/format';

interface Ev {
  id: string;
  actorType: string;
  actorId: string | null;
  category: string;
  action: string;
  severity: string;
  message: string;
  resourceType: string | null;
  createdAt: string;
}

const CATEGORIES = ['', 'tenant', 'toggle', 'credential', 'campaign', 'job', 'approval', 'ops', 'guardrail', 'budget', 'eval'];
const SEVERITIES = ['', 'info', 'warning', 'error', 'critical'];

export default function Activity() {
  const { tenantId, api } = useSession();
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('');

  const res = useResource(async () => {
    if (!tenantId) return { events: [] as Ev[] };
    const q = new URLSearchParams({ limit: '200' });
    if (category) q.set('category', category);
    if (severity) q.set('severity', severity);
    return api.get<{ events: Ev[] }>(`/tenants/${tenantId}/events?${q}`);
  }, [tenantId, category, severity]);

  if (!tenantId) return (<><PageHead title="Activity" /><NoTenant /></>);

  return (
    <>
      <PageHead title="Activity" subtitle="The full system event stream." action={<button onClick={res.reload}>Refresh</button>} />
      <Card>
        <div className="row" style={{ marginBottom: 12 }}>
          <div><label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 160 }}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c || 'all'}</option>)}
            </select>
          </div>
          <div><label>Severity</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={{ width: 140 }}>
              {SEVERITIES.map((s) => <option key={s} value={s}>{s || 'all'}</option>)}
            </select>
          </div>
        </div>
        <DataState resource={res} empty={(d) => d.events.length === 0}>
          {({ events }) => (
            <table>
              <thead><tr><th>When</th><th>Category</th><th>Action</th><th>Actor</th><th>Message</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap faint">{relativeTime(e.createdAt)}</td>
                    <td><StatusBadge status={e.category} /></td>
                    <td className="mono">{e.action}{e.severity !== 'info' && <> <span className="badge red">{e.severity}</span></>}</td>
                    <td className="faint nowrap">{e.actorType}{e.actorId ? `:${e.actorId}` : ''}</td>
                    <td className="muted">{e.message}</td>
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
