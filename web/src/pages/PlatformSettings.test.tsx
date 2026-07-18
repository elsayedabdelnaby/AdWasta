import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlatformSettings from './PlatformSettings';
import { mockApi, renderWithProviders } from '../test/render';

const T = '22222222-2222-4222-8222-222222222222';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

function facebookCard() {
  return screen.getByText('facebook').closest('.card') as HTMLElement;
}

describe('PlatformSettings page', () => {
  it('reveals the credential wizard when API publish is enabled', async () => {
    const { calls } = mockApi({
      [`PATCH /tenants/${T}/platforms/facebook`]: {
        connection: { publishMode: 'copy_pack', apiPublishEnabled: true, apiReplyEnabled: false, apiDmReplyEnabled: false, apiEmailEnabled: false, imageGenEnabled: false },
        credentialRequirements: { fields: [{ name: 'pageId', label: 'Facebook Page ID', secret: false }, { name: 'accessToken', label: 'Page Access Token', secret: true }] },
      },
      [`POST /tenants/${T}/platforms/facebook/credentials`]: { saved: true, health: { ok: true } },
    });
    renderWithProviders(<PlatformSettings />, { tenantId: T });

    const card = facebookCard();
    await userEvent.click(within(card).getByRole('checkbox', { name: 'API publish' }));

    await waitFor(() => expect(within(card).getByText('Facebook Page ID')).toBeInTheDocument());
    // the PATCH sent only the changed flag (never a path-derived tenant)
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({ apiPublishEnabled: true });

    await userEvent.type(within(card).getByLabelText('Facebook Page ID'), '123');
    await userEvent.type(within(card).getByLabelText('Page Access Token'), 'secret-token');
    await userEvent.click(within(card).getByRole('button', { name: /Save credentials/ }));

    await waitFor(() => {
      const saved = calls.find((c) => c.path.endsWith('/credentials'));
      expect(saved?.body).toEqual({ pageId: '123', accessToken: 'secret-token' });
    });
  });

  it('keeps the browser-publishing toggle disabled (reserved, ADR-001)', () => {
    mockApi({});
    renderWithProviders(<PlatformSettings />, { tenantId: T });
    const card = facebookCard();
    expect(within(card).getByRole('checkbox', { name: 'Browser publishing (reserved)' })).toBeDisabled();
  });
});
