import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, mockApi } from '../test/render';
import Campaign from './Campaign';

describe('Campaign page — post language', () => {
  it('sends the selected language to the creation step only', async () => {
    const { calls } = mockApi({
      'GET /tenants/t1/competitor-alerts': { alerts: [] },
      'POST /tenants/t1/research/run': {},
      'POST /tenants/t1/strategy/generate': {},
      'POST /tenants/t1/content/recommend': { draftIds: [], imageCount: 0, cappedChannels: [] },
    });
    renderWithProviders(<Campaign />, { tenantId: 't1', user: 'demo-owner' });

    await userEvent.selectOptions(screen.getByLabelText('Post language'), 'ar');
    await userEvent.click(screen.getByRole('button', { name: /run full pipeline/i }));

    await waitFor(() => {
      const content = calls.find((c) => c.path === '/tenants/t1/content/recommend');
      expect(content).toBeDefined();
      expect((content!.body as { language?: string }).language).toBe('ar');
    });
    const strategy = calls.find((c) => c.path === '/tenants/t1/strategy/generate');
    expect((strategy!.body as { language?: string }).language).toBeUndefined();
  });

  it('omits language entirely when left on the English default', async () => {
    const { calls } = mockApi({
      'GET /tenants/t1/competitor-alerts': { alerts: [] },
      'POST /tenants/t1/research/run': {},
      'POST /tenants/t1/strategy/generate': {},
      'POST /tenants/t1/content/recommend': { draftIds: [], imageCount: 0, cappedChannels: [] },
    });
    renderWithProviders(<Campaign />, { tenantId: 't1', user: 'demo-owner' });

    await userEvent.click(screen.getByRole('button', { name: /run full pipeline/i }));

    await waitFor(() => {
      const content = calls.find((c) => c.path === '/tenants/t1/content/recommend');
      expect(content).toBeDefined();
      expect((content!.body as { language?: string }).language).toBeUndefined();
    });
  });
});
