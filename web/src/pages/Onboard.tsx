import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/Session';
import { useToast } from '../components/Toast';
import { ApiError } from '../lib/api';
import { Card, NoTenant, PageHead } from '../components/ui';

export default function Onboard() {
  const { tenantId, api } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ description: 'Specialty coffee roaster, DTC', audience: '', voice: 'warm, unpretentious', goals: '', competitors: '', platforms: 'facebook, twitter' });
  const [busy, setBusy] = useState(false);

  if (!tenantId) return (<><PageHead title="Onboard" /><NoTenant /></>);

  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

  async function save() {
    setBusy(true);
    try {
      await api.post(`/tenants/${tenantId}/onboard`, {
        description: form.description || undefined,
        audience: form.audience || undefined,
        voice: form.voice || undefined,
        goals: form.goals ? list(form.goals) : undefined,
        competitors: form.competitors ? list(form.competitors) : undefined,
        platforms: form.platforms ? list(form.platforms) : undefined,
      });
      toast.notify('Profile saved');
      navigate('/');
    } catch (e) {
      toast.fail(e instanceof ApiError ? `${e.status}: ${e.body}` : String(e));
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <>
      <PageHead title="Onboard" subtitle="Business profile the crew reasons from." />
      <Card>
        <div className="field"><label>Description</label><textarea rows={2} value={form.description} onChange={set('description')} /></div>
        <div className="split">
          <div className="field"><label>Audience</label><input value={form.audience} onChange={set('audience')} /></div>
          <div className="field"><label>Brand voice</label><input value={form.voice} onChange={set('voice')} /></div>
        </div>
        <div className="split">
          <div className="field"><label>Goals (comma-separated)</label><input value={form.goals} onChange={set('goals')} /></div>
          <div className="field"><label>Competitors (comma-separated)</label><input value={form.competitors} onChange={set('competitors')} /></div>
        </div>
        <div className="field"><label>Platforms (comma-separated)</label><input value={form.platforms} onChange={set('platforms')} /></div>
        <button className="primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : 'Save profile'}</button>
      </Card>
    </>
  );
}
