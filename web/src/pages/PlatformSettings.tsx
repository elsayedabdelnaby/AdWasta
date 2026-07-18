import { useState } from 'react';
import { useSession } from '../context/Session';
import { useToast } from '../components/Toast';
import { ApiError } from '../lib/api';
import { Badge, Card, NoTenant, PageHead } from '../components/ui';

const PLATFORMS = ['facebook', 'twitter', 'instagram', 'linkedin', 'email'] as const;
type Platform = (typeof PLATFORMS)[number];

interface Conn {
  publishMode: 'copy_pack' | 'api';
  apiPublishEnabled: boolean;
  apiReplyEnabled: boolean;
  apiDmReplyEnabled: boolean;
  apiEmailEnabled: boolean;
  imageGenEnabled: boolean;
}
interface CredField { name: string; label: string; secret: boolean }

const DEFAULT_CONN: Conn = {
  publishMode: 'copy_pack',
  apiPublishEnabled: false,
  apiReplyEnabled: false,
  apiDmReplyEnabled: false,
  apiEmailEnabled: false,
  imageGenEnabled: false,
};

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="slider" />
    </label>
  );
}

function ToggleRow({ label, desc, checked, onChange, disabled }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="toggle-row">
      <div><div>{label}</div><div className="desc">{desc}</div></div>
      <Switch label={label} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function PlatformCard({ platform }: { platform: Platform }) {
  const { tenantId, api } = useSession();
  const toast = useToast();
  const [conn, setConn] = useState<Conn>(DEFAULT_CONN);
  const [credFields, setCredFields] = useState<CredField[] | null>(null);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<string | null>(null);
  const isEmail = platform === 'email';

  async function patch(partial: Partial<Conn>) {
    const next = { ...conn, ...partial };
    setConn(next); // optimistic
    try {
      const out = await api.patch<{ connection: Conn; credentialRequirements?: { fields: CredField[] } }>(
        `/tenants/${tenantId}/platforms/${platform}`,
        partial,
      );
      setConn({ ...DEFAULT_CONN, ...out.connection });
      setCredFields(out.credentialRequirements?.fields ?? null);
    } catch (e) {
      setConn(conn); // revert
      toast.fail(e instanceof ApiError ? `${e.status}: ${e.body}` : String(e));
    }
  }

  async function saveCreds() {
    try {
      const out = await api.post<{ saved: boolean; health?: { ok?: boolean; status?: string; message?: string } }>(
        `/tenants/${tenantId}/platforms/${platform}/credentials`,
        creds,
      );
      const h = out.health;
      setHealth(h ? (h.ok ? 'healthy' : (h.status ?? h.message ?? 'unhealthy')) : 'saved');
      toast.notify(`Credentials saved for ${platform}`);
    } catch (e) {
      toast.fail(e instanceof ApiError ? `${e.status}: ${e.body}` : String(e));
    }
  }

  return (
    <Card title={<span style={{ textTransform: 'capitalize' }}>{platform}</span>} action={<Badge color={conn.publishMode === 'api' ? 'amber' : 'green'}>{conn.publishMode}</Badge>}>
      <div className="field">
        <label>Publish mode</label>
        <select value={conn.publishMode} onChange={(e) => patch({ publishMode: e.target.value as 'copy_pack' | 'api' })}>
          <option value="copy_pack">copy_pack (default, zero account risk)</option>
          <option value="api">api (opt-in)</option>
        </select>
      </div>

      {!isEmail && (
        <>
          <ToggleRow label="API publish" desc="Publish via official API instead of copy pack." checked={conn.apiPublishEnabled} onChange={(v) => patch({ apiPublishEnabled: v })} />
          <ToggleRow label="Comment replies (API)" desc="Send approved comment replies via API." checked={conn.apiReplyEnabled} onChange={(v) => patch({ apiReplyEnabled: v })} />
          <ToggleRow label="DM replies (API)" desc="Independent of comment replies." checked={conn.apiDmReplyEnabled} onChange={(v) => patch({ apiDmReplyEnabled: v })} />
        </>
      )}
      {isEmail && (
        <ToggleRow label="Email send (API)" desc="Requires suppression list + unsubscribe + consent (design §21)." checked={conn.apiEmailEnabled} onChange={(v) => patch({ apiEmailEnabled: v })} />
      )}
      <ToggleRow label="Image generation" desc="Gemini / Nano Banana. Off by default (cost)." checked={conn.imageGenEnabled} onChange={(v) => patch({ imageGenEnabled: v })} />

      <div className="toggle-row">
        <div><div>Browser publishing</div><div className="desc">Deferred post-v1 — reserved flag only (ADR-001).</div></div>
        <Switch label="Browser publishing (reserved)" checked={false} onChange={() => {}} disabled />
      </div>

      {credFields && credFields.length > 0 && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>Credentials</strong>
            {health && <Badge color={health === 'healthy' || health === 'saved' ? 'green' : 'amber'}>{health}</Badge>}
          </div>
          {credFields.map((f) => {
            const fieldId = `cred-${platform}-${f.name}`;
            return (
              <div key={f.name} className="field"><label htmlFor={fieldId}>{f.label}</label>
                <input id={fieldId} type={f.secret ? 'password' : 'text'} value={creds[f.name] ?? ''} onChange={(e) => setCreds((p) => ({ ...p, [f.name]: e.target.value }))} />
              </div>
            );
          })}
          <button className="primary" onClick={saveCreds}>Save credentials & health check</button>
        </div>
      )}
    </Card>
  );
}

export default function PlatformSettings() {
  const { tenantId } = useSession();
  if (!tenantId) return (<><PageHead title="Platform Settings" /><NoTenant /></>);
  return (
    <>
      <PageHead title="Platform Settings" subtitle="Per-tenant feature toggles + credential wizard. Publishing still needs approval + execute." />
      <div className="banner info">Toggles apply immediately. Current state reflects your last change this session (no read-back endpoint in v1).</div>
      <div className="grid cols-2">
        {PLATFORMS.map((p) => <PlatformCard key={p} platform={p} />)}
      </div>
    </>
  );
}
