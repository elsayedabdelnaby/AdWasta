import { Fragment, useState } from 'react';
import { useSession } from '../context/Session';
import { useResource } from '../lib/useResource';
import { Badge, Card, DataState, NoTenant, PageHead, StatusBadge } from '../components/ui';
import { relativeTime, titleCase, usd } from '../lib/format';

interface Step { action: string; tool?: string; model?: string; inputTokens?: number; outputTokens?: number; latencyMs?: number; costUsd?: number; promptVersion?: string; error?: string }
interface Trace { id: string; arm: string | null; crew: string | null; status: string; totalCostUsd: string; totalLatencyMs: number; steps: Step[]; createdAt: string }
interface Cost { total: number; byDay: { day: string; cost: number }[]; byArm: { arm: string | null; cost: number }[] }

const BUDGET_KEY = 'adwasta.dailyBudget';

export default function Traces() {
  const { tenantId, api } = useSession();
  const [open, setOpen] = useState<string | null>(null);
  const [budget, setBudget] = useState<number>(() => Number(localStorage.getItem(BUDGET_KEY) ?? 10));

  const cost = useResource(async () => {
    if (!tenantId) return null;
    return api.get<Cost>(`/tenants/${tenantId}/metrics`);
  }, [tenantId]);

  const traces = useResource(async () => {
    if (!tenantId) return { traces: [] as Trace[] };
    return api.get<{ traces: Trace[] }>(`/tenants/${tenantId}/traces?limit=100`);
  }, [tenantId]);

  if (!tenantId) return (<><PageHead title="Traces & Cost" /><NoTenant /></>);

  const maxDay = Math.max(1, ...(cost.data?.byDay.map((d) => d.cost) ?? [0]));
  const setBudgetPersist = (v: number) => { setBudget(v); localStorage.setItem(BUDGET_KEY, String(v)); };

  return (
    <>
      <PageHead title="Traces & Cost" subtitle="Per-tenant LLM spend and every arm run. Cost is computed in code, never by an LLM." action={<button onClick={() => { cost.reload(); traces.reload(); }}>Refresh</button>} />

      <div className="split">
        <Card title="Spend by day (30d)" action={<span className="idbox"><span className="faint">Daily budget $</span><input type="number" value={budget} onChange={(e) => setBudgetPersist(Number(e.target.value))} style={{ width: 70 }} /></span>}>
          <DataState resource={cost}>
            {(d) => (
              <div className="stack">
                <div className="stat"><span className="value">{usd(d?.total)}</span><span className="label">total (30d)</span></div>
                {(d?.byDay ?? []).map((row) => {
                  const over = row.cost > budget;
                  return (
                    <div key={row.day}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="mono faint">{row.day}</span>
                        <span className={over ? '' : 'muted'} style={over ? { color: 'var(--red)' } : undefined}>{usd(row.cost)}{over && ' ⚠'}</span>
                      </div>
                      <div className="bar"><span style={{ width: `${(row.cost / maxDay) * 100}%`, background: over ? 'var(--red)' : 'var(--accent)' }} /></div>
                    </div>
                  );
                })}
                {(!d || d.byDay.length === 0) && <p className="faint">No spend recorded yet.</p>}
              </div>
            )}
          </DataState>
        </Card>

        <Card title="Spend by arm">
          <DataState resource={cost}>
            {(d) => (
              <table>
                <thead><tr><th>Arm</th><th className="right">Cost</th></tr></thead>
                <tbody>
                  {(d?.byArm ?? []).map((r, i) => (
                    <tr key={i}><td>{r.arm ? titleCase(r.arm) : <span className="faint">unattributed</span>}</td><td className="right mono">{usd(r.cost)}</td></tr>
                  ))}
                  {(!d || d.byArm.length === 0) && <tr><td colSpan={2} className="faint">No arm runs yet.</td></tr>}
                </tbody>
              </table>
            )}
          </DataState>
        </Card>
      </div>

      <div style={{ height: 16 }} />

      <Card title="Traces">
        <DataState resource={traces} empty={(d) => d.traces.length === 0}>
          {({ traces: list }) => (
            <table>
              <thead><tr><th>When</th><th>Crew / Arm</th><th>Status</th><th className="right">Steps</th><th className="right">Cost</th><th className="right">Latency</th></tr></thead>
              <tbody>
                {list.map((t) => (
                  <Fragment key={t.id}>
                    <tr className="clickable" onClick={() => setOpen(open === t.id ? null : t.id)}>
                      <td className="nowrap faint">{relativeTime(t.createdAt)}</td>
                      <td>{titleCase(t.crew ?? '—')}{t.arm ? ` · ${titleCase(t.arm)}` : ''}</td>
                      <td><StatusBadge status={t.status} /></td>
                      <td className="right mono">{t.steps?.length ?? 0}</td>
                      <td className="right mono">{usd(t.totalCostUsd)}</td>
                      <td className="right mono">{t.totalLatencyMs}ms</td>
                    </tr>
                    {open === t.id && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--bg)' }}>
                          {(!t.steps || t.steps.length === 0) ? <span className="faint">No steps recorded.</span> : (
                            <table>
                              <thead><tr><th>#</th><th>Action</th><th>Model</th><th className="right">In</th><th className="right">Out</th><th className="right">Cost</th><th className="right">Latency</th><th>Prompt</th></tr></thead>
                              <tbody>
                                {t.steps.map((s, i) => (
                                  <tr key={i}>
                                    <td className="faint">{i + 1}</td>
                                    <td className="mono">{s.action}{s.tool ? ` (${s.tool})` : ''}{s.error && <> <Badge color="red">error</Badge></>}</td>
                                    <td className="faint">{s.model ?? '—'}</td>
                                    <td className="right mono">{s.inputTokens ?? '—'}</td>
                                    <td className="right mono">{s.outputTokens ?? '—'}</td>
                                    <td className="right mono">{s.costUsd !== undefined ? usd(s.costUsd) : '—'}</td>
                                    <td className="right mono">{s.latencyMs !== undefined ? `${s.latencyMs}ms` : '—'}</td>
                                    <td className="faint mono">{s.promptVersion ?? '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </DataState>
      </Card>
    </>
  );
}
