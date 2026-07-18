import { useState } from 'react';
import { useSession } from '../context/Session';
import { useToast } from '../components/Toast';
import { useResource } from '../lib/useResource';
import { ApiError } from '../lib/api';
import { Badge, Card, DataState, JsonBlock, NoTenant, PageHead } from '../components/ui';
import type { BadgeColor } from '../components/ui';
import { relativeTime } from '../lib/format';

interface Alert {
  id: string;
  competitorId: string;
  summary: string;
  citations: string[];
  status: string;
  createdAt: string;
}

interface Competitor {
  id: string;
  name: string;
  url: string | null;
  watchEnabled: boolean;
  createdAt: string;
}

interface Discovery {
  discovered: { id: string; name: string; url?: string; why: string }[];
  skipped: string[];
  summary: string;
  citations: string[];
}

interface Comparison {
  summary: string;
  citations?: string[];
  data: {
    competitors: {
      name: string;
      positioning: string;
      strengths: string[];
      weaknesses: string[];
      threatLevel: string;
      keyDifference: string;
    }[];
    ourAdvantages: string[];
    ourGaps: string[];
    recommendations: string[];
    summary: string;
  };
}

const RUNS = [
  { key: 'full', label: 'Full research (Alex)', path: '/research/run' },
  { key: 'market', label: 'Market / SERP', path: '/intel/market' },
  { key: 'trends', label: 'Trends', path: '/intel/trends' },
  { key: 'competitors', label: 'Analyze competitors', path: '/intel/competitors' },
] as const;

function threatColor(level: string): BadgeColor {
  const l = level.toLowerCase();
  return l.includes('high') ? 'red' : l.includes('medium') ? 'amber' : 'green';
}

export default function Research() {
  const { tenantId, api } = useSession();
  const toast = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<unknown>(null);
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);

  const res = useResource(async () => {
    if (!tenantId) return { alerts: [] as Alert[] };
    return api.get<{ alerts: Alert[] }>(`/tenants/${tenantId}/competitor-alerts`);
  }, [tenantId]);

  const comps = useResource(async () => {
    if (!tenantId) return { competitors: [] as Competitor[] };
    return api.get<{ competitors: Competitor[] }>(`/tenants/${tenantId}/competitors`);
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

  async function discover() {
    setRunning('discover');
    try {
      const out = await api.post<Discovery>(`/tenants/${tenantId}/intel/competitors/discover`, {});
      setDiscovery(out);
      toast.notify(out.discovered.length > 0 ? `Discovered ${out.discovered.length} competitor(s)` : 'No new competitors found');
      comps.reload();
    } catch (e) {
      toast.fail(e instanceof ApiError ? `Discovery failed: ${e.status}` : String(e));
    } finally {
      setRunning(null);
    }
  }

  async function compare() {
    setRunning('compare');
    try {
      const out = await api.post<Comparison>(`/tenants/${tenantId}/intel/competitors/compare`, {});
      setComparison(out);
      toast.notify('Comparison complete');
      res.reload();
    } catch (e) {
      toast.fail(e instanceof ApiError ? `Comparison failed: ${e.status} ${e.body}` : String(e));
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

  const watched = comps.data?.competitors.filter((c) => c.watchEnabled) ?? [];

  return (
    <>
      <PageHead title="Research & Alerts" subtitle="ToS-safe intel; hourly Tier-0 watch never calls an LLM." action={<button onClick={() => { res.reload(); comps.reload(); }}>Refresh</button>} />

      <Card title="Competitors" action={
        <div className="row">
          <button className="primary sm" disabled={running !== null} onClick={discover}>
            {running === 'discover' ? <span className="spinner" /> : 'Discover from my business'}
          </button>
          <button className="sm" disabled={running !== null || watched.length === 0} onClick={compare}>
            {running === 'compare' ? <span className="spinner" /> : 'Study & compare'}
          </button>
        </div>
      }>
        <DataState resource={comps}>
          {({ competitors }) => competitors.length > 0 ? (
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {competitors.map((c) => (
                <Badge key={c.id} color={c.watchEnabled ? 'blue' : 'gray'}>
                  {c.name}{!c.watchEnabled && ' (unwatched)'}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="muted">No competitors tracked yet — click “Discover from my business” to find them from your onboarded profile, or add names on the Onboard page.</p>
          )}
        </DataState>

        {discovery && (
          <div style={{ marginTop: 12 }}>
            <p className="muted">{discovery.summary}</p>
            {discovery.discovered.length > 0 && (
              <div className="stack">
                {discovery.discovered.map((d) => (
                  <div key={d.id} className="card" style={{ background: 'var(--bg-elev-2)' }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <strong>{d.name}</strong>
                      {d.url && <a href={d.url} target="_blank" rel="noreferrer"><Badge color="blue">site</Badge></a>}
                    </div>
                    <p className="muted">{d.why}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <div style={{ height: 16 }} />

      {comparison && (
        <>
          <Card title="Competitor comparison">
            <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{comparison.data.summary}</p>
            <div className="stack">
              {comparison.data.competitors.map((c) => (
                <div key={c.name} className="card" style={{ background: 'var(--bg-elev-2)' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>{c.name}</strong>
                    <Badge color={threatColor(c.threatLevel)}>{c.threatLevel} threat</Badge>
                  </div>
                  <p className="muted">{c.positioning}</p>
                  <div className="split">
                    <div>
                      <strong className="faint">Strengths</strong>
                      <ul className="muted">{c.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    </div>
                    <div>
                      <strong className="faint">Weaknesses</strong>
                      <ul className="muted">{c.weaknesses.map((s, i) => <li key={i}>{s}</li>)}</ul>
                    </div>
                  </div>
                  <p className="muted"><strong className="faint">vs us:</strong> {c.keyDifference}</p>
                </div>
              ))}
            </div>
            <div className="split" style={{ marginTop: 12 }}>
              <div>
                <strong className="faint">Our advantages</strong>
                <ul className="muted">{comparison.data.ourAdvantages.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div>
                <strong className="faint">Our gaps</strong>
                <ul className="muted">{comparison.data.ourGaps.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
            <strong className="faint">Recommended moves</strong>
            <ul className="muted">{comparison.data.recommendations.map((s, i) => <li key={i}>{s}</li>)}</ul>
            {(comparison.citations ?? []).length > 0 && (
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {comparison.citations!.map((c, i) => <a key={i} href={c} target="_blank" rel="noreferrer"><Badge color="blue">source {i + 1}</Badge></a>)}
              </div>
            )}
          </Card>
          <div style={{ height: 16 }} />
        </>
      )}

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
