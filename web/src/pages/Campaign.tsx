import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../context/Session';
import { useToast } from '../components/Toast';
import { useResource } from '../lib/useResource';
import { ApiError } from '../lib/api';
import { Badge, Card, DataState, NoTenant, PageHead } from '../components/ui';

type StepState = 'idle' | 'running' | 'done' | 'failed';

interface Alert { id: string; summary: string; status: string }

const PIPELINE = [
  { key: 'research', label: 'Research (Alex)', path: '/research/run', body: {} as Record<string, unknown> },
  { key: 'strategy', label: 'Strategy (Sam)', path: '/strategy/generate', body: {} as Record<string, unknown> },
  {
    key: 'content',
    label: 'Creation (Jordan)',
    path: '/content/recommend',
    // Ask for a post on every platform (not just facebook) and generate images.
    body: { platforms: ['facebook', 'instagram', 'twitter', 'linkedin'], imageGenEnabled: true } as Record<string, unknown>,
  },
] as const;

const LANGUAGES = [
  { value: '', label: 'English (default)' },
  { value: 'ar', label: 'Arabic — العربية' },
  { value: 'fr', label: 'French — Français' },
  { value: 'es', label: 'Spanish — Español' },
  { value: 'de', label: 'German — Deutsch' },
  { value: 'tr', label: 'Turkish — Türkçe' },
  { value: 'ur', label: 'Urdu — اردو' },
  { value: 'hi', label: 'Hindi — हिन्दी' },
  { value: 'id', label: 'Indonesian — Bahasa' },
  { value: 'pt', label: 'Portuguese — Português' },
];

export default function Campaign() {
  const { tenantId, api } = useSession();
  const toast = useToast();
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [language, setLanguage] = useState('');

  const alerts = useResource(async () => {
    if (!tenantId) return { alerts: [] as Alert[] };
    return api.get<{ alerts: Alert[] }>(`/tenants/${tenantId}/competitor-alerts`);
  }, [tenantId]);

  if (!tenantId) return (<><PageHead title="Campaigns" /><NoTenant /></>);

  async function runPipeline() {
    setPipelineBusy(true);
    setSteps({});
    try {
      for (const s of PIPELINE) {
        setSteps((p) => ({ ...p, [s.key]: 'running' }));
        try {
          const body = s.key === 'content' && language ? { ...s.body, language } : s.body;
          await api.post(`/tenants/${tenantId}${s.path}`, body);
          setSteps((p) => ({ ...p, [s.key]: 'done' }));
        } catch (e) {
          setSteps((p) => ({ ...p, [s.key]: 'failed' }));
          toast.fail(e instanceof ApiError ? `${s.label} failed: ${e.status}` : String(e));
          return; // stop the pipeline on first failure — sequential by design
        }
      }
      toast.notify('Proactive campaign drafted — review in Approvals');
    } finally {
      setPipelineBusy(false);
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

  const badge = (s: StepState) =>
    s === 'done' ? <Badge color="green">done</Badge> : s === 'running' ? <Badge color="blue">running</Badge> : s === 'failed' ? <Badge color="red">failed</Badge> : <Badge>waiting</Badge>;

  return (
    <>
      <PageHead title="Campaigns" subtitle="Proactive pipeline and counter-campaigns. Nothing publishes without approval." />

      <Card title="Proactive campaign" action={<button className="primary" disabled={pipelineBusy} onClick={runPipeline}>{pipelineBusy ? <span className="spinner" /> : 'Run full pipeline'}</button>}>
        <p className="muted">Runs RESEARCH → STRATEGY → CREATION in order (sequential — Strategy never precedes Research). Drafts land in the approval inbox.</p>
        <div className="field" style={{ marginTop: 8, maxWidth: 320 }}>
          <label htmlFor="camp-lang">Post language</label>
          <select id="camp-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
        <div className="stack" style={{ marginTop: 8 }}>
          {PIPELINE.map((s) => (
            <div key={s.key} className="toggle-row">
              <span>{s.label}</span>
              {badge(steps[s.key] ?? 'idle')}
            </div>
          ))}
        </div>
        <p style={{ marginTop: 10 }}><Link to="/approvals">Go to Approvals →</Link></p>
      </Card>

      <div style={{ height: 16 }} />

      <Card title="Counter-campaigns" action={<button onClick={alerts.reload}>Refresh</button>}>
        <DataState resource={alerts} empty={(d) => d.alerts.length === 0}>
          {({ alerts: list }) => (
            <div className="stack">
              {list.map((a) => (
                <div key={a.id} className="toggle-row">
                  <span className="muted" style={{ maxWidth: 620 }}>{a.summary}</span>
                  <button className="primary sm" onClick={() => counter(a)}>Respond →</button>
                </div>
              ))}
            </div>
          )}
        </DataState>
      </Card>
    </>
  );
}
