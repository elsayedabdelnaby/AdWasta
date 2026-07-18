import { useState } from 'react';
import { useSession } from '../context/Session';
import { useToast } from '../components/Toast';
import { useResource } from '../lib/useResource';
import { ApiError } from '../lib/api';
import { Badge, Card, DataState, JsonBlock, NoTenant, PageHead } from '../components/ui';
import { relativeTime } from '../lib/format';

interface Alert {
  id: string;
  competitorId: string;
  summary: string;
  citations: string[];
  status: string;
  createdAt: string;
}

const RUNS = [
  { key: 'full', label: 'Full research (Alex)', path: '/research/run' },
  { key: 'market', label: 'Market / SERP', path: '/intel/market' },
  { key: 'trends', label: 'Trends', path: '/intel/trends' },
  { key: 'competitors', label: 'Competitors', path: '/intel/competitors' },
] as const;

export default function Research() {
  const { tenantId, api } = useSession();
  const toast = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);

  const res = useResource(async () => {
    if (!tenantId) return { alerts: [] as Alert[] };
    return api.get<{ alerts: Alert[] }>(`/tenants/${tenantId}/competitor-alerts`);
  }, [tenantId]);

  if (!tenantId) return (<><PageHead title="Research & Alerts" /><NoTenant /></>);

  async function run(r: (typeof RUNS)[number]) {
    setRunning(r.key);
    try {
      const out = await api.post(`/tenants/${tenantId}${r.path}`, {});
      setLastResult(out);
      toast.notify(`${r.label} complete`);
      res.reload();
    } catch (e) {
      toast.fail(e instanceof ApiError ? `${r.label} failed: ${e.status}` : String(e));
    } finally {
      setRunning(null);
    }
  }

  async function dismiss(a: Alert) {
    try {
      await api.post(`/tenants/${tenantId}/competitor-alerts/${a.id}/dismiss`, {});
      toast.notify('Alert dismissed');
      res.reload();
    } catch (e) {
      toast.fail(String(e));
    }
  }

  async function counter(a: Alert) {
    try {
      await api.post(`/tenants/${tenantId}/campaign/counter`, { competitorAlertId: a.id });
      toast.notify('Counter-campaign started — see Approvals');
    } catch (e) {
      toast.fail(e instanceof ApiError ? `${e.status}: ${e.body}` : String(e));
    }
  }

  return (
    <>
      <PageHead title="Research & Alerts" subtitle="ToS-safe intel; hourly Tier-0 watch never calls an LLM." action={<button onClick={res.reload}>Refresh</button>} />

      <Card title="Run intelligence">
        <div className="row">
          {RUNS.map((r) => (
            <button key={r.key} className={r.key === 'full' ? 'primary' : ''} disabled={running !== null} onClick={() => run(r)}>
              {running === r.key ? <span className="spinner" /> : r.label}
            </button>
          ))}
        </div>
        {lastResult !== null && <div style={{ marginTop: 12 }}><JsonBlock value={lastResult} /></div>}
      </Card>

      <div style={{ height: 16 }} />

      <Card title="Open competitor alerts">
        <DataState resource={res} empty={(d) => d.alerts.length === 0}>
          {({ alerts }) => (
            <div className="stack">
              {alerts.map((a) => (
                <div key={a.id} className="card" style={{ background: 'var(--bg-elev-2)' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>Competitor campaign detected</strong>
                    <span className="faint">{relativeTime(a.createdAt)}</span>
                  </div>
                  <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{a.summary}</p>
                  {a.citations.length > 0 && (
                    <div className="row" style={{ marginBottom: 8 }}>
                      {a.citations.map((c, i) => <a key={i} href={c} target="_blank" rel="noreferrer"><Badge color="blue">source {i + 1}</Badge></a>)}
                    </div>
                  )}
                  <div className="row">
                    <button className="primary sm" onClick={() => counter(a)}>Start counter-campaign</button>
                    <button className="sm ghost" onClick={() => dismiss(a)}>Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DataState>
      </Card>
    </>
  );
}
