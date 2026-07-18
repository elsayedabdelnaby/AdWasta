import { useState } from 'react';
import { useSession } from '../context/Session';
import { useToast } from '../components/Toast';
import { useResource } from '../lib/useResource';
import { ApiError } from '../lib/api';
import { Badge, Card, DataState, NoTenant, PageHead, StatusBadge } from '../components/ui';
import { relativeTime } from '../lib/format';

interface Item {
  id: string;
  type: 'comment' | 'message';
  platform: string;
  threadId: string | null;
  inboundText: string;
  draftReply: string | null;
  status: string;
  privacyFlag: boolean;
  createdAt: string;
}

export default function Engagement() {
  const { tenantId, api } = useSession();
  const toast = useToast();
  const [type, setType] = useState<'comment' | 'message'>('comment');
  const [platform, setPlatform] = useState('facebook');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const res = useResource(async () => {
    if (!tenantId) return { items: [] as Item[] };
    return api.get<{ items: Item[] }>(`/tenants/${tenantId}/engagement`);
  }, [tenantId]);

  if (!tenantId) return (<><PageHead title="Engagement" /><NoTenant /></>);

  async function draft() {
    if (!text.trim()) return toast.fail('Paste the inbound comment or DM');
    setBusy(true);
    try {
      await api.post(`/tenants/${tenantId}/engagement/draft`, { type, platform, inboundText: text });
      toast.notify('Reply drafted — awaiting approval (HIGH risk)');
      setText('');
      res.reload();
    } catch (e) {
      toast.fail(e instanceof ApiError ? `${e.status}: ${e.body}` : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function execute(id: string) {
    try {
      const out = await api.post<Record<string, unknown>>(`/tenants/${tenantId}/engagement/${id}/execute`, {});
      toast.notify(`Execute: ${JSON.stringify(out)}`);
      res.reload();
    } catch (e) {
      toast.fail(e instanceof ApiError ? `Send refused: ${e.status} ${e.body}` : String(e));
    }
  }

  return (
    <>
      <PageHead title="Engagement" subtitle="Comment & DM reply drafts. Both are HIGH risk — no silent send." action={<button onClick={res.reload}>Refresh</button>} />

      <Card title="Draft a reply (paste inbound thread)">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ width: 140 }}><label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as 'comment' | 'message')}>
              <option value="comment">comment</option>
              <option value="message">DM (message)</option>
            </select>
          </div>
          <div style={{ width: 140 }}><label>Platform</label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {['facebook', 'twitter', 'instagram', 'linkedin'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="field" style={{ marginTop: 10 }}><label>Inbound text</label><textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the comment or DM you received…" /></div>
        <button className="primary" disabled={busy} onClick={draft}>{busy ? <span className="spinner" /> : 'Draft reply'}</button>
      </Card>

      <div style={{ height: 16 }} />

      <Card title="Inbox">
        <DataState resource={res} empty={(d) => d.items.length === 0}>
          {({ items }) => (
            <div className="stack">
              {items.map((it) => (
                <div key={it.id} className="card" style={{ background: 'var(--bg-elev-2)' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="row">
                      <Badge color={it.type === 'message' ? 'purple' : 'blue'}>{it.type}</Badge>
                      <span className="faint">{it.platform}</span>
                      {it.privacyFlag && <Badge color="amber">private</Badge>}
                      <StatusBadge status={it.status} />
                    </span>
                    <span className="faint">{relativeTime(it.createdAt)}</span>
                  </div>
                  <p className="faint" style={{ margin: '8px 0 4px' }}>Inbound:</p>
                  <p className="muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{it.inboundText}</p>
                  {it.draftReply && (<><p className="faint" style={{ margin: '8px 0 4px' }}>Draft reply:</p><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{it.draftReply}</p></>)}
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="sm" onClick={() => execute(it.id)}>Execute (if armed)</button>
                    <span className="faint">Approve replies in the Approvals inbox first.</span>
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
