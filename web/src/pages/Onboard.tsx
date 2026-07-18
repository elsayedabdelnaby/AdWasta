import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../context/Session';
import { useToast } from '../components/Toast';
import { ApiError } from '../lib/api';
import { Card, NoTenant, PageHead } from '../components/ui';

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

// jsdom has no URL.createObjectURL — previews just don't render in tests.
const objectUrl = (b: Blob): string | null =>
  typeof URL.createObjectURL === 'function' ? URL.createObjectURL(b) : null;

export default function Onboard() {
  const { tenantId, api } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    description: '',
    audience: '',
    voice: '',
    goals: '',
    competitors: '',
    platforms: '',
    website: '',
    facebookUrl: '',
    instagramUrl: '',
    twitterUrl: '',
    linkedinUrl: '',
    tiktokUrl: '',
    youtubeUrl: '',
  });
  const [busy, setBusy] = useState(false);

  // Prefill from the saved profile so edits start from what's stored, not blanks.
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    api.get<{
      description?: string;
      audience?: string;
      voice?: string;
      goals?: string[];
      competitors?: string[];
      platforms?: string[];
      website?: string;
      socialUrls?: Record<string, string>;
    }>(`/tenants/${tenantId}/profile`)
      .then((p) => {
        if (cancelled) return;
        const s = p.socialUrls ?? {};
        setForm({
          description: p.description ?? '',
          audience: p.audience ?? '',
          voice: p.voice ?? '',
          goals: (p.goals ?? []).join(', '),
          competitors: (p.competitors ?? []).join(', '),
          platforms: (p.platforms ?? []).join(', '),
          website: p.website ?? '',
          facebookUrl: s.facebook ?? '',
          instagramUrl: s.instagram ?? '',
          twitterUrl: s.twitter ?? '',
          linkedinUrl: s.linkedin ?? '',
          tiktokUrl: s.tiktok ?? '',
          youtubeUrl: s.youtube ?? '',
        });
      })
      .catch(() => {}); // no profile yet — keep the empty form
    return () => {
      cancelled = true;
    };
  }, [tenantId, api]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Show the already-uploaded logo (if any) until a new file is picked.
  useEffect(() => {
    if (!tenantId || logoFile) return;
    let cancelled = false;
    api.getBlob(`/tenants/${tenantId}/logo`)
      .then((b) => {
        if (!cancelled && b) setLogoPreview(objectUrl(b));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tenantId, logoFile, api]);

  if (!tenantId) return (<><PageHead title="Onboard" /><NoTenant /></>);

  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

  function pickLogo(e: { target: { files: FileList | null } }) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!LOGO_TYPES.includes(f.type)) {
      toast.fail('Logo must be a PNG, JPEG, or WebP image');
      return;
    }
    if (f.size > LOGO_MAX_BYTES) {
      toast.fail('Logo must be 2MB or smaller');
      return;
    }
    setLogoFile(f);
    setLogoPreview(objectUrl(f));
  }

  async function save() {
    setBusy(true);
    try {
      const socialUrls: Record<string, string> = {};
      if (form.facebookUrl.trim()) socialUrls.facebook = form.facebookUrl.trim();
      if (form.instagramUrl.trim()) socialUrls.instagram = form.instagramUrl.trim();
      if (form.twitterUrl.trim()) socialUrls.twitter = form.twitterUrl.trim();
      if (form.linkedinUrl.trim()) socialUrls.linkedin = form.linkedinUrl.trim();
      if (form.tiktokUrl.trim()) socialUrls.tiktok = form.tiktokUrl.trim();
      if (form.youtubeUrl.trim()) socialUrls.youtube = form.youtubeUrl.trim();
      await api.post(`/tenants/${tenantId}/onboard`, {
        description: form.description || undefined,
        audience: form.audience || undefined,
        voice: form.voice || undefined,
        goals: form.goals ? list(form.goals) : undefined,
        competitors: form.competitors ? list(form.competitors) : undefined,
        platforms: form.platforms ? list(form.platforms) : undefined,
        website: form.website.trim() || undefined,
        socialUrls: Object.keys(socialUrls).length ? socialUrls : undefined,
      });
      if (logoFile) {
        await api.putBinary(`/tenants/${tenantId}/logo`, logoFile);
      }
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
        <div className="field"><label htmlFor="ob-desc">Description</label><textarea id="ob-desc" rows={2} value={form.description} onChange={set('description')} /></div>
        <div className="split">
          <div className="field"><label htmlFor="ob-aud">Audience</label><input id="ob-aud" value={form.audience} onChange={set('audience')} /></div>
          <div className="field"><label htmlFor="ob-voice">Brand voice</label><input id="ob-voice" value={form.voice} onChange={set('voice')} /></div>
        </div>
        <div className="split">
          <div className="field"><label htmlFor="ob-goals">Goals (comma-separated)</label><input id="ob-goals" value={form.goals} onChange={set('goals')} /></div>
          <div className="field"><label htmlFor="ob-comp">Competitors (comma-separated)</label><input id="ob-comp" value={form.competitors} onChange={set('competitors')} /></div>
        </div>
        <div className="field"><label htmlFor="ob-plat">Platforms (comma-separated)</label><input id="ob-plat" value={form.platforms} onChange={set('platforms')} /></div>
        <div className="split">
          <div className="field"><label htmlFor="ob-website">Website</label><input id="ob-website" placeholder="https://yourbusiness.com" value={form.website} onChange={set('website')} /></div>
          <div className="field"><label htmlFor="ob-fb">Facebook page URL</label><input id="ob-fb" placeholder="https://facebook.com/yourpage" value={form.facebookUrl} onChange={set('facebookUrl')} /></div>
        </div>
        <div className="split">
          <div className="field"><label htmlFor="ob-ig">Instagram URL</label><input id="ob-ig" placeholder="https://instagram.com/yourhandle" value={form.instagramUrl} onChange={set('instagramUrl')} /></div>
          <div className="field"><label htmlFor="ob-tw">X / Twitter URL</label><input id="ob-tw" placeholder="https://x.com/yourhandle" value={form.twitterUrl} onChange={set('twitterUrl')} /></div>
        </div>
        <div className="split">
          <div className="field"><label htmlFor="ob-li">LinkedIn URL</label><input id="ob-li" placeholder="https://linkedin.com/company/yourco" value={form.linkedinUrl} onChange={set('linkedinUrl')} /></div>
          <div className="field"><label htmlFor="ob-tt">TikTok URL</label><input id="ob-tt" placeholder="https://tiktok.com/@yourhandle" value={form.tiktokUrl} onChange={set('tiktokUrl')} /></div>
        </div>
        <div className="field"><label htmlFor="ob-yt">YouTube URL</label><input id="ob-yt" placeholder="https://youtube.com/@yourchannel" value={form.youtubeUrl} onChange={set('youtubeUrl')} /></div>
        <div className="field">
          <label htmlFor="ob-logo">Logo (PNG/JPEG/WebP, max 2MB)</label>
          <input id="ob-logo" type="file" accept={LOGO_TYPES.join(',')} onChange={pickLogo} />
          {logoPreview && (
            <img src={logoPreview} alt="Logo preview" style={{ marginTop: 8, maxHeight: 64, maxWidth: 160, borderRadius: 6 }} />
          )}
        </div>
        <button className="primary" disabled={busy} onClick={save}>{busy ? <span className="spinner" /> : 'Save profile'}</button>
      </Card>
    </>
  );
}
