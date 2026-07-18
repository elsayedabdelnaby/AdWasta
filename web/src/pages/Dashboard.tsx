import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../context/Session';
import { useToast } from '../components/Toast';
import { useResource } from '../lib/useResource';
import { ApiError } from '../lib/api';
import { Card, NoTenant, PageHead, StatusBadge } from '../components/ui';
import { relativeTime, usd } from '../lib/format';

interface CostSummary { total: number; byArm: { arm: string | null; cost: number }[] }
interface Ev { id: string; action: string; category: string; message: string | null; createdAt: string }

const PILLARS = [
  { key: 'research', persona: 'Alex', pillar: 'Research', label: 'Run research', path: '/research/run', to: '/research' },
  { key: 'strategy', persona: 'Sam', pillar: 'Strategy', label: 'Generate strategy', path: '/strategy/generate', to: '/campaign' },
  { key: 'creation', persona: 'Jordan', pillar: 'Creation', label: 'Draft content', path: '/content/recommend', to: '/approvals' },
  { key: 'ops', persona: 'Ops', pillar: 'Ops', label: 'Daily brief', path: '/daily-brief', to: '/calendar' },
  { key: 'measure', persona: 'Riley', pillar: 'Measure', label: 'Run analyst', path: '/analyst/run', to: '/performance' },
] as const;

export default function Dashboard() {
  const { tenantId, api } = useSession();
  const toast = useToast();
  const [running, setRunning] = useState<string | null>(null);

  const res = useResource(async () => {
    if (!tenantId) return null;
    const [cost, events, approvals, alerts] = await Promise.all([
      api.get<CostSummary>(`/tenants/${tenantId}/metrics`).catch(() => ({ total: 0, byArm: [] })),
      api.get<{ events: Ev[] }>(`/tenants/${tenantId}/events?limit=8`).catch(() => ({ events: [] })),
      api.get<{ all: unknown[] }>(`/tenants/${tenantId}/approvals`).catch(() => ({ all: [] })),
      api.get<{ alerts: unknown[] }>(`/tenants/${tenantId}/competitor-alerts`).catch(() => ({ alerts: [] })),
    ]);
    return { cost, events: events.events, approvals: approvals.all.length, alerts: alerts.alerts.length };
  }, [tenantId]);

  if (!tenantId) return (<><PageHead title="Dashboard" /><NoTenant /></>);

  async function runPillar(p: (typeof PILLARS)[number]) {
    setRunning(p.key);
    try {
      await api.post(`/tenants/${tenantId}${p.path}`, {});
      toast.notify(`${p.persona} finished ${p.pillar.toLowerCase()}`);
      res.reload();
    } catch (e) {
      toast.fail(e instanceof ApiError ? `${p.pillar} failed: ${e.status}` : String(e));
    } finally {
      setRunning(null);
    }
  }

  const d = res.data;
  return (
    <>
      <PageHead title="Dashboard" subtitle="Supervised Crew — one brain, five pillars." action={<button onClick={res.reload}>Refresh</button>} />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Card><div className="stat"><span className="value">{usd(d?.cost.total)}</span><span className="label">Spend (30d)</span></div></Card>
        <Card><div className="stat"><span className="value">{d?.approvals ?? '—'}</span><span className="label"><Link to="/approvals">Pending approvals</Link></span></div></Card>
        <Card><div className="stat"><span className="value">{d?.alerts ?? '—'}</span><span className="label"><Link to="/research">Open competitor alerts</Link></span></div></Card>
        <Card><div className="stat"><span className="value">{d?.cost.byArm.length ?? 0}</span><span className="label"><Link to="/traces">Active arms (billed)</Link></span></div></Card>
      </div>

      <h3 style={{ margin: '18px 0 10px' }}>The crew</h3>
      <div className="grid cols-5" style={{ marginBottom: 20 }}>
        {PILLARS.map((p) => (
          <Card key={p.key} className="pillar">
            <div className="persona">{p.persona}</div>
            <div className="num">{p.pillar}</div>
            <div style={{ marginTop: 10 }}>
              <button className="primary sm" disabled={running !== null} onClick={() => runPillar(p)}>
                {running === p.key ? <span className="spinner" /> : p.label}
              </button>
            </div>
            <div style={{ marginTop: 6 }}><Link to={p.to} className="faint">view →</Link></div>
          </Card>
        ))}
      </div>

      <Card title="Recent activity" action={<Link to="/activity">All activity →</Link>}>
        {res.error ? (
          <div className="banner error">{res.error.message}</div>
        ) : !d || d.events.length === 0 ? (
          <p className="faint">No activity yet — run a pillar above.</p>
        ) : (
          <table>
            <tbody>
              {d.events.map((e) => (
                <tr key={e.id}>
                  <td style={{ width: 120 }}><StatusBadge status={e.category} /></td>
                  <td className="mono">{e.action}</td>
                  <td className="muted">{e.message}</td>
                  <td className="right faint nowrap">{relativeTime(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
