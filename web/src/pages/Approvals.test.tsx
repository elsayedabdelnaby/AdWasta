import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Approvals from './Approvals';
import { mockApi, renderWithProviders } from '../test/render';

const T = '11111111-1111-4111-8111-111111111111';

const draft = {
  id: 'd1',
  channel: 'social',
  platform: 'facebook',
  subject: null,
  preheader: null,
  body: 'Fresh single-origin, roasted this morning.',
  status: 'pending_approval',
  campaignId: null,
};
const approval = { id: 'a1', resourceType: 'content_draft', resourceId: 'd1', kind: 'post', risk: 'HIGH', status: 'pending', createdAt: '2026-07-18T10:00:00Z' };

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('Approvals page', () => {
  it('renders the draft body and approves it (approve-loop)', async () => {
    const { calls } = mockApi({
      [`GET /tenants/${T}/approvals`]: { all: [approval] },
      [`GET /tenants/${T}/content/drafts`]: { drafts: [draft] },
      [`POST /tenants/${T}/approvals/a1/decide`]: { ok: true },
    });
    renderWithProviders(<Approvals />, { tenantId: T });

    await waitFor(() => expect(screen.getByText(/Fresh single-origin/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      const decide = calls.find((c) => c.method === 'POST' && c.path.endsWith('/decide'));
      expect(decide?.body).toEqual({ decision: 'approve' });
    });
  });

  it('shows a membership hint when the API returns 403 (non-member)', async () => {
    mockApi({
      [`GET /tenants/${T}/approvals`]: { status: 403, body: { error: 'forbidden' } },
      [`GET /tenants/${T}/content/drafts`]: { status: 403, body: { error: 'forbidden' } },
    });
    renderWithProviders(<Approvals />, { tenantId: T });
    await waitFor(() => expect(screen.getByText(/not a member of this tenant/)).toBeInTheDocument());
  });

  it('prompts to pick a tenant when none is selected', async () => {
    renderWithProviders(<Approvals />);
    expect(await screen.findByText(/No workspace selected/)).toBeInTheDocument();
  });

  it('marks an approved draft as published from the Ready-to-publish list', async () => {
    const approved = { ...draft, id: 'd2', status: 'approved', body: 'Approved and ready to post.' };
    const { calls } = mockApi({
      [`GET /tenants/${T}/approvals`]: { all: [] },
      [`GET /tenants/${T}/content/drafts`]: { drafts: [approved] },
      [`POST /tenants/${T}/published-items`]: { published: true, id: 'p1' },
    });
    renderWithProviders(<Approvals />, { tenantId: T });
    await waitFor(() => expect(screen.getByText(/Approved and ready/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Mark published' }));
    await waitFor(() => {
      const pub = calls.find((c) => c.path.endsWith('/published-items'));
      expect(pub?.body).toEqual({ draftId: 'd2', platform: 'facebook' });
    });
  });
});
