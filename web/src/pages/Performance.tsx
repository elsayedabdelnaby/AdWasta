import { useState } from 'react';
import { useSession } from '../context/Session';
import { useToast } from '../components/Toast';
import { useResource } from '../lib/useResource';
import { ApiError } from '../lib/api';
import { Badge, Card, DataState, JsonBlock, NoTenant, PageHead } from '../components/ui';

interface AngleScore { id: string; angle: string; score: string | null; status: string }
interface Insight { id: string; kind: string; summary: string; citedMetricIds: string[]; provisional: boolean }
interface Perf { angleScores: AngleScore[]; kpis: unknown; insights: Insight[] }

const METRIC_FIELDS = ['impressions', 'reach', 'likes', 'comments', 'shares', 'clicks', 'saves', 'opens'] as const;

export default function Performance() {
  const { tenantId, api } = useSession();
  const toast = useToast();
  const [analystBusy, setAnalystBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [publishedItemId, setPublishedItemId] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [csv, setCsv] = useState('');

  const res = useResource(async () => {
    if (!tenantId) return null;
    return api.get<Perf>(`/tenants/${tenantId}/performance`);
  }, [tenantId]);

  if (!tenantId) return (<><PageHead title="Performance" /><NoTenant /></>);

  async function runAnalyst() {
    setAnalystBusy(true);
    try {
      await api.post(`/tenants/${tenantId}/analyst/run`, {});
      toast.notify('Analyst run complete');
      res.reload();
    } catch (e) {
      toast.fail(e instanceof ApiError ? `Analyst failed: ${e.status}` : String(e));
    } finally {
      setAnalystBusy(false);
    }
  }

  async function importMetrics() {
    setImportBusy(true);
    try {
      const body: { rows?: unknown[]; csv?: string } = {};
      if (publishedItemId.trim()) {
        const row: Record<string, unknown> = { publishedItemId: publishedItemId.trim() };
        for (const f of METRIC_FIELDS) if (fields[f]) row[f] = Number(fields[f]);
        body.rows = [row];
      }
      if (csv.trim()) body.csv = csv.trim();
      if (!body.rows && !body.csv) { toast.fail('Enter a row or CSV'); setImportBusy(false); return; }
      const out = await api.post<{ imported: number }>(`/tenants/${tenantId}/metrics/import`, body);
      toast.notify(`Imported ${out.imported} metric row(s)`);
      setPublishedItemId(''); setFields({}); setCsv('');
      res.reload();
    } catch (e) {
      toast.fail(e instanceof ApiError ? `Import failed: ${e.status} ${e.body}` : String(e));
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title="Performance"
        subtitle="Stats computed in code; the Analyst (Riley) only interprets — every insight cites metric rows."
        action={<span className="row"><button onClick={res.reload}>Refresh</button><button className="primary" disabled={analystBusy} onClick={runAnalyst}>{analystBusy ? <span className="spinner" /> : 'Run analyst'}</button></span>}
      />

      <div className="split">
        <Card title="Import metrics">
          <p className="faint" style={{ marginTop: 0 }}>Metrics must reference an existing published_items row (Mark as published on Approvals first).</p>
          <div className="field"><label>Published item id</label><input className="mono" value={publishedItemId} onChange={(e) => setPublishedItemId(e.target.value)} placeholder="published_item uuid" /></div>
          <div className="grid cols-4">
            {METRIC_FIELDS.map((f) => (
              <div key={f} className="field"><label>{f}</label><input type="number" value={fields[f] ?? ''} onChange={(e) => setFields((p) => ({ ...p, [f]: e.target.value }))} /></div>
            ))}
          </div>
          <div className="field"><label>…or paste CSV (Meta/X export)</label><textarea rows={3} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="published_item_id,impressions,reach,likes,…" /></div>
          <button className="primary" disabled={importBusy} onClick={importMetrics}>{importBusy ? <span className="spinner" /> : 'Import'}</button>
        </Card>

        <Card title="Angle scores">
          <DataState resource={res} empty={(d) => !d || d.angleScores.length === 0}>
            {(d) => (
              <table>
                <thead><tr><th>Angle</th><th className="right">Score</th><th>Status</th></tr></thead>
                <tbody>
                  {d!.angleScores.map((a) => (
                    <tr key={a.id}>
                      <td>{a.angle}</td>
                      <td className="right mono">{a.score ?? '—'}</td>
                      <td><Badge color={a.status === 'retired' ? 'gray' : 'green'}>{a.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </DataState>
        </Card>
      </div>

      <div style={{ height: 16 }} />

      <Card title="KPI targets">
        <DataState resource={res}>
          {(d) => (Array.isArray(d?.kpis) && d!.kpis.length ? <JsonBlock value={d!.kpis} /> : <p className="faint">No active marketing plan KPIs yet.</p>)}
        </DataState>
      </Card>

      <div style={{ height: 16 }} />

      <Card title="Performance insights">
        <DataState resource={res} empty={(d) => !d || d.insights.length === 0}>
          {(d) => (
            <div className="stack">
              {d!.insights.map((i) => (
                <div key={i.id} className="toggle-row">
                  <div style={{ maxWidth: 720 }}>
                    <div className="row"><Badge color={i.kind.includes('losing') ? 'red' : i.kind.includes('winning') ? 'green' : 'blue'}>{i.kind}</Badge>{i.provisional && <Badge color="purple">provisional</Badge>}</div>
                    <p className="muted" style={{ margin: '6px 0 0' }}>{i.summary}</p>
                  </div>
                  <span className="faint nowrap" title={i.citedMetricIds.join(', ')}>{i.citedMetricIds.length} cited row(s)</span>
                </div>
              ))}
            </div>
          )}
        </DataState>
      </Card>
    </>
  );
}
