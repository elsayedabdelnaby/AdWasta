import { useEffect, useState, type ReactNode } from 'react';
import { api, getConfig, setConfig, t, type ApiConfig } from './api.js';

// --- tiny UI kit ---
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e3e3e0', borderRadius: 10, padding: 16, marginBottom: 14 };
const btn: React.CSSProperties = { padding: '7px 12px', border: 0, borderRadius: 6, background: '#2f6f4f', color: '#fff', cursor: 'pointer', marginRight: 6, marginTop: 6 };
const input: React.CSSProperties = { width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box', marginTop: 4 };

function Json({ value }: { value: unknown }) {
  return <pre style={{ background: '#f4f4f1', padding: 10, borderRadius: 6, overflowX: 'auto', fontSize: 12 }}>{JSON.stringify(value, null, 2)}</pre>;
}

function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): { data?: T; error?: string; loading: boolean; reload: () => void } {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ loading: true });
    fn().then(
      (data) => live && setState({ data, loading: false }),
      (e) => live && setState({ error: String(e), loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...state, reload: () => setN((x) => x + 1) };
}

function Loader<T>({ hook, children }: { hook: ReturnType<typeof useAsync<T>>; children: (d: T) => ReactNode }) {
  if (hook.loading) return <p style={{ color: '#888' }}>loading…</p>;
  if (hook.error) return <p style={{ color: '#c44' }}>{hook.error}</p>;
  return <>{hook.data !== undefined ? children(hook.data) : null}</>;
}

// --- pages ---
function Setup({ onChange }: { onChange: () => void }) {
  const [cfg, setCfg] = useState<ApiConfig>(getConfig());
  const save = (next: ApiConfig) => {
    setCfg(next);
    setConfig(next);
    onChange();
  };
  const [msg, setMsg] = useState('');
  const createTenant = async () => {
    try {
      const r = await api<{ id: string }>('POST', '/tenants', { name: 'Demo Co', industry: 'coffee' });
      save({ ...cfg, tenant: r.id });
      setMsg('tenant created');
    } catch (e) {
      setMsg(String(e));
    }
  };
  const onboard = async () => {
    try {
      await api('POST', t('/onboard'), { description: 'Specialty coffee roaster', voice: 'warm', platforms: ['facebook', 'email'], competitors: ['Blue Bottle'] });
      setMsg('profile saved');
    } catch (e) {
      setMsg(String(e));
    }
  };
  return (
    <div style={card}>
      <h3>Connection</h3>
      <label>API base<input style={input} value={cfg.base} onChange={(e) => save({ ...cfg, base: e.target.value })} /></label>
      <label>Dev user<input style={input} value={cfg.user} onChange={(e) => save({ ...cfg, user: e.target.value })} /></label>
      <label>Tenant ID<input style={input} value={cfg.tenant} onChange={(e) => save({ ...cfg, tenant: e.target.value })} /></label>
      <button style={btn} onClick={createTenant}>Create tenant</button>
      <button style={{ ...btn, background: '#888' }} onClick={onboard}>Onboard demo profile</button>
      <span style={{ color: '#888', marginLeft: 8 }}>{msg}</span>
    </div>
  );
}

function Dashboard() {
  const events = useAsync(() => api<{ events: unknown[] }>('GET', t('/events')), []);
  const cost = useAsync(() => api('GET', t('/metrics')), []);
  const pillars = ['RESEARCH', 'STRATEGY', 'CREATION', 'OPS', 'MEASURE'];
  return (
    <div>
      <div style={card}>
        <h3>Five pillars</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {pillars.map((p) => (
            <span key={p} style={{ padding: '6px 10px', background: '#eef3ef', borderRadius: 6, fontSize: 13 }}>{p}</span>
          ))}
        </div>
      </div>
      <div style={card}>
        <h3>Cost (agent_traces)</h3>
        <Loader hook={cost}>{(d) => <Json value={d} />}</Loader>
      </div>
      <div style={card}>
        <h3>Recent activity</h3>
        <Loader hook={events}>{(d) => <Json value={d.events.slice(0, 10)} />}</Loader>
      </div>
    </div>
  );
}

function Campaign() {
  const [out, setOut] = useState<unknown>(null);
  const run = async (path: string) => {
    try {
      setOut(await api('POST', t(path)));
    } catch (e) {
      setOut(String(e));
    }
  };
  return (
    <div style={card}>
      <h3>Run pillars</h3>
      <button style={btn} onClick={() => run('/research/run')}>RESEARCH</button>
      <button style={btn} onClick={() => run('/strategy/generate')}>STRATEGY</button>
      <button style={btn} onClick={() => run('/content/recommend')}>CREATION</button>
      <button style={btn} onClick={() => run('/daily-brief')}>Daily brief</button>
      <button style={{ ...btn, background: '#888' }} onClick={() => run('/analyst/run')}>Analyst</button>
      {out ? <Json value={out} /> : null}
    </div>
  );
}

function Approvals() {
  const inbox = useAsync(() => api<{ all: { id: string; kind: string; risk: string; status: string; resourceId: string }[] }>('GET', t('/approvals')), []);
  const decide = async (id: string, decision: string) => {
    await api('POST', t(`/approvals/${id}/decide`), { decision });
    inbox.reload();
  };
  const copyPack = async (draftId: string) => alert(JSON.stringify(await api('GET', t(`/content/${draftId}/copy-pack`)), null, 2));
  const publish = async (draftId: string) => {
    await api('POST', t('/published-items'), { draftId, platform: 'facebook' });
    alert('marked published');
  };
  return (
    <div style={card}>
      <h3>Approval inbox</h3>
      <button style={{ ...btn, background: '#888' }} onClick={() => inbox.reload()}>Refresh</button>
      <Loader hook={inbox}>
        {(d) =>
          d.all.length === 0 ? (
            <p style={{ color: '#888' }}>inbox empty — run CREATION first</p>
          ) : (
            <>
              {d.all.map((it) => (
                <div key={it.id} style={{ ...card, marginTop: 10 }}>
                  <strong>{it.kind}</strong> <span style={{ color: '#888' }}>{it.risk} · {it.status}</span>
                  <div>
                    <button style={btn} onClick={() => decide(it.id, 'approve')}>Approve</button>
                    <button style={{ ...btn, background: '#c44' }} onClick={() => decide(it.id, 'reject')}>Reject</button>
                    <button style={{ ...btn, background: '#888' }} onClick={() => copyPack(it.resourceId)}>Copy pack</button>
                    <button style={{ ...btn, background: '#888' }} onClick={() => publish(it.resourceId)}>Mark published</button>
                  </div>
                </div>
              ))}
            </>
          )
        }
      </Loader>
    </div>
  );
}

function Performance() {
  const perf = useAsync(() => api('GET', t('/performance')), []);
  return (
    <div style={card}>
      <h3>Performance — angle scores + insights</h3>
      <Loader hook={perf}>{(d) => <Json value={d} />}</Loader>
    </div>
  );
}

function GenericList({ title, path, dataKey }: { title: string; path: string; dataKey: string }) {
  const hook = useAsync(() => api<Record<string, unknown>>('GET', t(path)), [path]);
  return (
    <div style={card}>
      <h3>{title}</h3>
      <button style={{ ...btn, background: '#888' }} onClick={() => hook.reload()}>Refresh</button>
      <Loader hook={hook}>{(d) => <Json value={d[dataKey] ?? d} />}</Loader>
    </div>
  );
}

function Settings() {
  const [platform, setPlatform] = useState('facebook');
  const [out, setOut] = useState<unknown>(null);
  const toggle = async (flag: string, value: boolean) => setOut(await api('PATCH', t(`/platforms/${platform}`), { [flag]: value }));
  return (
    <div style={card}>
      <h3>Platform settings</h3>
      <label>Platform<input style={input} value={platform} onChange={(e) => setPlatform(e.target.value)} /></label>
      <button style={btn} onClick={() => toggle('apiPublishEnabled', true)}>Enable API publish</button>
      <button style={btn} onClick={() => toggle('apiReplyEnabled', true)}>Enable comment reply</button>
      <button style={btn} onClick={() => toggle('apiDmReplyEnabled', true)}>Enable DM reply</button>
      <button style={btn} onClick={() => toggle('imageGenEnabled', true)}>Enable image gen</button>
      {out ? <Json value={out} /> : null}
      <p style={{ color: '#888', fontSize: 12 }}>Browser publishing is deferred (ADR-001) and not offered.</p>
    </div>
  );
}

const PAGES: Record<string, { label: string; el: ReactNode }> = {
  dashboard: { label: 'Dashboard', el: <Dashboard /> },
  campaign: { label: 'Campaign', el: <Campaign /> },
  approvals: { label: 'Approvals', el: <Approvals /> },
  performance: { label: 'Performance', el: <Performance /> },
  alerts: { label: 'Alerts', el: <GenericList title="Competitor alerts" path="/competitor-alerts" dataKey="alerts" /> },
  calendar: { label: 'Calendar', el: <GenericList title="Calendar" path="/calendar" dataKey="schedules" /> },
  engagement: { label: 'Engagement', el: <GenericList title="Engagement (comments + DMs)" path="/engagement" dataKey="items" /> },
  traces: { label: 'Traces', el: <GenericList title="Traces" path="/traces" dataKey="traces" /> },
  activity: { label: 'Activity', el: <GenericList title="Activity feed" path="/events" dataKey="events" /> },
  audit: { label: 'Audit', el: <GenericList title="Audit log" path="/audit" dataKey="audit" /> },
  settings: { label: 'Settings', el: <Settings /> },
};

export function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || 'dashboard');
  const [, force] = useState(0);
  useEffect(() => {
    const on = () => setRoute(location.hash.slice(1) || 'dashboard');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const page = PAGES[route] ?? PAGES.dashboard;
  const tenant = getConfig().tenant;
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#f6f6f4', minHeight: '100vh', color: '#1a1a1a' }}>
      <header style={{ background: '#2a2a28', color: '#fff', padding: '12px 20px' }}>
        <strong>AdWasta</strong> — control plane {tenant ? <span style={{ color: '#9a9' }}>· tenant {tenant.slice(0, 8)}</span> : <span style={{ color: '#c99' }}>· no tenant selected</span>}
      </header>
      <div style={{ display: 'flex', maxWidth: 1100, margin: '0 auto' }}>
        <nav style={{ width: 160, padding: 16 }}>
          {Object.entries(PAGES).map(([k, v]) => (
            <a key={k} href={`#${k}`} style={{ display: 'block', padding: '6px 8px', borderRadius: 6, textDecoration: 'none', color: route === k ? '#fff' : '#333', background: route === k ? '#2f6f4f' : 'transparent' }}>
              {v.label}
            </a>
          ))}
        </nav>
        <main style={{ flex: 1, padding: 16 }}>
          <Setup onChange={() => force((x) => x + 1)} />
          {tenant ? page.el : <div style={card}>Set or create a tenant above to load data.</div>}
        </main>
      </div>
    </div>
  );
}
