import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSession } from '../context/Session';
import { useToast } from './Toast';
import { useResource } from '../lib/useResource';
import { ApiError } from '../lib/api';

interface NavItem {
  to: string;
  label: string;
  badge?: number;
}

function NavSection({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div className="nav-group">
      <h4>{title}</h4>
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.to === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <span>{it.label}</span>
          {it.badge ? <span className="count">{it.badge}</span> : null}
        </NavLink>
      ))}
    </div>
  );
}

function TenantBar() {
  const { user, setUser, tenantId, setTenantId, api } = useSession();
  const toast = useToast();
  const [draft, setDraft] = useState(tenantId ?? '');
  const [busy, setBusy] = useState(false);

  async function createTenant() {
    setBusy(true);
    try {
      const r = await api.post<{ id: string }>('/tenants', { name: 'New Workspace', industry: 'demo' });
      setTenantId(r.id);
      setDraft(r.id);
      toast.notify('Workspace created');
    } catch (e) {
      toast.fail(e instanceof ApiError ? `Create failed: ${e.status}` : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="topbar">
      <div className="idbox">
        <span>User</span>
        <input value={user} onChange={(e) => setUser(e.target.value)} title="x-dev-user (dev auth)" />
      </div>
      <div className="idbox">
        <span>Tenant</span>
        <input
          value={draft}
          placeholder="paste a tenant id…"
          onChange={(e) => setDraft(e.target.value)}
          className="mono"
        />
        <button className="sm" onClick={() => setTenantId(draft.trim() || null)}>Use</button>
        <button className="sm" onClick={createTenant} disabled={busy}>
          {busy ? <span className="spinner" /> : 'New'}
        </button>
      </div>
      <div className="spacer" />
      {tenantId ? <span className="badge green">connected</span> : <span className="badge amber">no tenant</span>}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { tenantId, api } = useSession();
  const location = useLocation();

  // Sidebar counts: pending approvals + open competitor alerts. Refetched on
  // navigation so acting on an item updates the badge when you move on.
  const counts = useResource(async () => {
    if (!tenantId) return { approvals: 0, alerts: 0 };
    const [ap, al] = await Promise.all([
      api.get<{ all: unknown[] }>(`/tenants/${tenantId}/approvals`).catch(() => ({ all: [] })),
      api.get<{ alerts: unknown[] }>(`/tenants/${tenantId}/competitor-alerts`).catch(() => ({ alerts: [] })),
    ]);
    return { approvals: ap.all?.length ?? 0, alerts: al.alerts?.length ?? 0 };
  }, [tenantId, location.pathname]);

  const c = counts.data ?? { approvals: 0, alerts: 0 };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="dot" /> AdWasta</div>
        <NavSection title="Overview" items={[{ to: '/', label: 'Dashboard' }, { to: '/activity', label: 'Activity' }]} />
        <NavSection title="Research · Alex" items={[{ to: '/research', label: 'Research & Alerts', badge: c.alerts }]} />
        <NavSection title="Strategy · Sam" items={[{ to: '/campaign', label: 'Campaigns' }]} />
        <NavSection title="Creation · Jordan" items={[{ to: '/approvals', label: 'Approvals', badge: c.approvals }]} />
        <NavSection title="Ops" items={[{ to: '/calendar', label: 'Calendar' }, { to: '/engagement', label: 'Engagement' }]} />
        <NavSection title="Measure · Riley" items={[{ to: '/performance', label: 'Performance' }]} />
        <NavSection title="Admin" items={[{ to: '/onboard', label: 'Onboard' }, { to: '/settings', label: 'Platform Settings' }, { to: '/traces', label: 'Traces & Cost' }, { to: '/audit', label: 'Audit Log' }]} />
      </aside>
      <div className="content">
        <TenantBar />
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
