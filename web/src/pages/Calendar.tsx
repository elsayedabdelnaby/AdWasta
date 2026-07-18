import { useState } from 'react';
import { useSession } from '../context/Session';
import { useToast } from '../components/Toast';
import { useResource } from '../lib/useResource';
import { ApiError } from '../lib/api';
import { Badge, Card, DataState, NoTenant, PageHead, StatusBadge } from '../components/ui';
import { shortDate } from '../lib/format';

interface Schedule {
  id: string;
  draftId: string | null;
  type: string;
  platform: string | null;
  scheduledAt: string;
  status: string;
  armed: boolean;
}

export default function Calendar() {
  const { tenantId, api } = useSession();
  const toast = useToast();
  const [type, setType] = useState<'social_post' | 'email_send'>('social_post');
  const [platform, setPlatform] = useState('facebook');
  const [when, setWhen] = useState('');
  const [draftId, setDraftId] = useState('');
  const [busy, setBusy] = useState(false);

  const res = useResource(async () => {
    if (!tenantId) return { schedules: [] as Schedule[] };
    return api.get<{ schedules: Schedule[] }>(`/tenants/${tenantId}/calendar`);
  }, [tenantId]);

  if (!tenantId) return (<><PageHead title="Calendar" /><NoTenant /></>);

  async function create() {
    if (!when) return toast.fail('Pick a date/time');
    setBusy(true);
    try {
      await api.post(`/tenants/${tenantId}/calendar`, {
        type,
        platform: type === 'social_post' ? platform : undefined,
        scheduledAt: new Date(when).toISOString(),
        draftId: draftId.trim() || undefined,
      });
      toast.notify('Scheduled');
      setWhen(''); setDraftId('');
      res.reload();
    } catch (e) {
      toast.fail(e instanceof ApiError ? `${e.status}: ${e.body}` : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function action(id: string, verb: 'arm' | 'remind' | 'execute') {
    try {
      const path = verb === 'arm' ? `/schedules/${id}/arm` : verb === 'remind' ? `/schedules/${id}/remind` : `/schedules/${id}/execute`;
      const out = await api.post<Record<string, unknown>>(`/tenants/${tenantId}${path}`, {});
      toast.notify(`${verb}: ${JSON.stringify(out)}`);
      res.reload();
    } catch (e) {
      toast.fail(e instanceof ApiError ? `${verb} refused: ${e.status} ${e.body}` : String(e));
    }
  }

  return (
    <>
      <PageHead title="Calendar" subtitle="Soft schedule + reminders. No execution without arm + permission." action={<button onClick={res.reload}>Refresh</button>} />

      <Card title="Schedule an item">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ width: 150 }}><label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as 'social_post' | 'email_send')}>
              <option value="social_post">social_post</option>
              <option value="email_send">email_send</option>
            </select>
          </div>
          {type === 'social_post' && (
            <div style={{ width: 140 }}><label>Platform</label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {['facebook', 'twitter', 'instagram', 'linkedin'].map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          )}
          <div style={{ width: 220 }}><label>When</label><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
          <div style={{ flex: 1, minWidth: 200 }}><label>Draft id (optional)</label><input className="mono" value={draftId} onChange={(e) => setDraftId(e.target.value)} placeholder="content_draft uuid" /></div>
          <button className="primary" disabled={busy} onClick={create}>{busy ? <span className="spinner" /> : 'Schedule'}</button>
        </div>
      </Card>

      <div style={{ height: 16 }} />

      <Card title="Upcoming">
        <DataState resource={res} empty={(d) => d.schedules.length === 0}>
          {({ schedules }) => (
            <table>
              <thead><tr><th>When</th><th>Type</th><th>Platform</th><th>Status</th><th>Armed</th><th className="right">Actions</th></tr></thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id}>
                    <td className="nowrap">{shortDate(s.scheduledAt)}</td>
                    <td className="mono">{s.type}</td>
                    <td>{s.platform ?? '—'}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>{s.armed ? <Badge color="amber">armed</Badge> : <Badge>soft</Badge>}</td>
                    <td className="right nowrap">
                      <button className="sm" onClick={() => action(s.id, 'remind')}>Remind</button>{' '}
                      <button className="sm" onClick={() => action(s.id, 'arm')}>Arm</button>{' '}
                      <button className="sm danger" onClick={() => action(s.id, 'execute')}>Execute</button>
                    </td>
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
