import { useState } from 'react';
import { useSession } from '../context/Session';
import { useToast } from '../components/Toast';
import { useResource } from '../lib/useResource';
import { ApiError } from '../lib/api';
import { Card, DataState, EmptyState, NoTenant, PageHead, RiskBadge, StatusBadge } from '../components/ui';
import { shortDate } from '../lib/format';

interface Approval {
  id: string;
  resourceType: string;
  resourceId: string;
  kind: string;
  risk: string;
  status: string;
  createdAt: string;
}
interface Draft {
  id: string;
  channel: string;
  platform: string | null;
  subject: string | null;
  preheader: string | null;
  body: string;
  status: string;
  campaignId: string | null;
}

export default function Approvals() {
  const { tenantId, api } = useSession();
  const toast = useToast();
  const [editing, setEditing] = useState<Record<string, { body: string; subject: string; preheader: string }>>({});
  const [packs, setPacks] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const res = useResource(async () => {
    if (!tenantId) return { approvals: [] as Approval[], drafts: [] as Draft[] };
    const [ap, dr] = await Promise.all([
      api.get<{ all: Approval[] }>(`/tenants/${tenantId}/approvals`),
      api.get<{ drafts: Draft[] }>(`/tenants/${tenantId}/content/drafts`),
    ]);
    return { approvals: ap.all, drafts: dr.drafts };
  }, [tenantId]);

  if (!tenantId) return (<><PageHead title="Approvals" /><NoTenant /></>);

  async function act(fn: () => Promise<unknown>, ok: string, key: string) {
    setBusy(key);
    try {
      await fn();
      toast.notify(ok);
      res.reload();
    } catch (e) {
      toast.fail(e instanceof ApiError ? `${e.status}: ${e.body || e.message}` : String(e));
    } finally {
      setBusy(null);
    }
  }

  const decide = (a: Approval, decision: 'approve' | 'reject') =>
    act(() => api.post(`/tenants/${tenantId}/approvals/${a.id}/decide`, { decision }), `Draft ${decision === 'approve' ? 'approved' : 'rejected'}`, a.id);

  const saveEdit = (a: Approval) => {
    const e = editing[a.id]!;
    return act(async () => {
      await api.post(`/tenants/${tenantId}/approvals/${a.id}/decide`, {
        decision: 'edit',
        edits: { body: e.body, subject: e.subject || undefined, preheader: e.preheader || undefined },
      });
      setEditing((prev) => { const n = { ...prev }; delete n[a.id]; return n; });
    }, 'Draft edited (still pending)', a.id);
  };

  const copyPack = (draftId: string) =>
    act(async () => {
      const pack = await api.get(`/tenants/${tenantId}/content/${draftId}/copy-pack`);
      setPacks((p) => ({ ...p, [draftId]: pack }));
    }, 'Copy pack ready', draftId);

  const markPublished = (draftId: string, platform: string | null | undefined) =>
    act(() => api.post(`/tenants/${tenantId}/published-items`, { draftId, platform: platform ?? 'facebook' }), 'Marked as published', draftId);

  return (
    <>
      <PageHead title="Approvals" subtitle="Nothing publishes or replies without a decision here." action={<button onClick={res.reload}>Refresh</button>} />
      <DataState resource={res}>
        {({ approvals, drafts }) => {
          const byId: Record<string, Draft> = {};
          for (const d of drafts) byId[d.id] = d;
          const readyToPublish = drafts.filter((d) => d.status === 'approved');
          return (
            <div className="stack">
              <Card title={`Pending (${approvals.length})`}>
                {approvals.length === 0 ? (
                  <EmptyState>Inbox empty — no pending items.</EmptyState>
                ) : (
                  <div className="stack">
                    {approvals.map((a) => {
                      const draft = byId[a.resourceId];
                      const isEditing = editing[a.id];
                      const email = draft?.channel === 'email';
                      return (
                        <div key={a.id} className="card" style={{ background: 'var(--bg-elev-2)' }}>
                          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                            <span><strong>{a.kind}</strong> <span className="faint">· {draft?.platform ?? draft?.channel ?? a.resourceType}</span></span>
                            <span className="row"><RiskBadge risk={a.risk} /> <StatusBadge status={a.status} /> <span className="faint">{shortDate(a.createdAt)}</span></span>
                          </div>
                          {isEditing ? (
                            <div className="stack">
                              {email && (
                                <>
                                  <div className="field"><label>Subject</label><input value={isEditing.subject} onChange={(e) => setEditing((p) => ({ ...p, [a.id]: { ...p[a.id]!, subject: e.target.value } }))} /></div>
                                  <div className="field"><label>Preheader</label><input value={isEditing.preheader} onChange={(e) => setEditing((p) => ({ ...p, [a.id]: { ...p[a.id]!, preheader: e.target.value } }))} /></div>
                                </>
                              )}
                              <div className="field"><label>Body</label><textarea rows={5} value={isEditing.body} onChange={(e) => setEditing((p) => ({ ...p, [a.id]: { ...p[a.id]!, body: e.target.value } }))} /></div>
                              <div className="row">
                                <button className="primary" disabled={busy !== null} onClick={() => saveEdit(a)}>Save edit</button>
                                <button className="ghost" onClick={() => setEditing((p) => { const n = { ...p }; delete n[a.id]; return n; })}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {email && draft?.subject && <div style={{ marginBottom: 6 }}><strong>{draft.subject}</strong>{draft.preheader ? <span className="faint"> — {draft.preheader}</span> : null}</div>}
                              <p style={{ whiteSpace: 'pre-wrap', margin: '0 0 12px' }}>{draft?.body ?? <span className="faint">draft {a.resourceId} not loaded</span>}</p>
                              <div className="row">
                                <button className="primary" disabled={busy !== null || a.status !== 'pending'} onClick={() => decide(a, 'approve')}>Approve</button>
                                <button className="danger" disabled={busy !== null || a.status !== 'pending'} onClick={() => decide(a, 'reject')}>Reject</button>
                                {draft && a.resourceType === 'content_draft' && (
                                  <button disabled={busy !== null} onClick={() => setEditing((p) => ({ ...p, [a.id]: { body: draft.body, subject: draft.subject ?? '', preheader: draft.preheader ?? '' } }))}>Edit</button>
                                )}
                                <button disabled={busy !== null} onClick={() => copyPack(a.resourceId)}>Copy pack</button>
                              </div>
                              {packs[a.resourceId] !== undefined && <pre className="json" style={{ marginTop: 12 }}>{JSON.stringify(packs[a.resourceId], null, 2)}</pre>}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              <Card title={`Ready to publish (${readyToPublish.length})`} action={<span className="faint">approved — grab the copy pack, post it, then mark published</span>}>
                {readyToPublish.length === 0 ? (
                  <EmptyState>No approved drafts awaiting publish.</EmptyState>
                ) : (
                  <div className="stack">
                    {readyToPublish.map((d) => (
                      <div key={d.id} className="card" style={{ background: 'var(--bg-elev-2)' }}>
                        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                          <span><strong>{d.channel}</strong> <span className="faint">· {d.platform ?? '—'}</span></span>
                          <StatusBadge status={d.status} />
                        </div>
                        {d.subject && <div style={{ marginBottom: 4 }}><strong>{d.subject}</strong></div>}
                        <p style={{ whiteSpace: 'pre-wrap', margin: '0 0 10px' }}>{d.body}</p>
                        <div className="row">
                          <button disabled={busy !== null} onClick={() => copyPack(d.id)}>Copy pack</button>
                          <button className="primary" disabled={busy !== null} onClick={() => markPublished(d.id, d.platform)}>Mark published</button>
                        </div>
                        {packs[d.id] !== undefined && <pre className="json" style={{ marginTop: 12 }}>{JSON.stringify(packs[d.id], null, 2)}</pre>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          );
        }}
      </DataState>
    </>
  );
}
