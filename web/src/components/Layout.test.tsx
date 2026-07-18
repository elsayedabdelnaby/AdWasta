import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, mockApi } from '../test/render';
import { Layout } from './Layout';

describe('Layout — create workspace form', () => {
  it('creates a tenant with the entered name and industry', async () => {
    const { calls } = mockApi({
      'POST /tenants': { id: 't-new' },
      'GET /tenants/t-new/approvals': { all: [] },
      'GET /tenants/t-new/competitor-alerts': { alerts: [] },
    });
    renderWithProviders(<Layout>content</Layout>, { user: 'demo-owner' });

    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    await userEvent.type(screen.getByLabelText('Workspace name'), 'Aurora Coffee');
    await userEvent.type(screen.getByLabelText('Industry'), 'specialty coffee DTC');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.path === '/tenants');
      expect(post).toBeDefined();
      expect(post!.body).toEqual({ name: 'Aurora Coffee', industry: 'specialty coffee DTC' });
    });
    await screen.findByText('connected');
  });

  it('refuses to create a workspace without a name', async () => {
    const { calls } = mockApi({ 'POST /tenants': { id: 't-x' } });
    renderWithProviders(<Layout>content</Layout>, { user: 'demo-owner' });

    await userEvent.click(screen.getByRole('button', { name: 'New' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(calls.find((c) => c.method === 'POST' && c.path === '/tenants')).toBeUndefined();
    await screen.findByText('Give the workspace a name');
  });
});
