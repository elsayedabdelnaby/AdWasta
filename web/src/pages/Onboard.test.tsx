import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, mockApi } from '../test/render';
import Onboard from './Onboard';

describe('Onboard page — business links', () => {
  it('prefills the form from the saved profile so edits are not lost', async () => {
    mockApi({
      'GET /tenants/t1/profile': {
        description: 'Handcrafted mihrab decor',
        audience: 'mosques',
        goals: ['awareness', 'sales'],
        platforms: ['facebook'],
        website: 'https://mehrab-alquran.com',
        socialUrls: { facebook: 'https://facebook.com/mehrab.alquran', tiktok: 'https://tiktok.com/@mehrab.alquran' },
      },
    });
    renderWithProviders(<Onboard />, { tenantId: 't1', user: 'demo-owner' });

    await waitFor(() => expect(screen.getByLabelText('Website')).toHaveValue('https://mehrab-alquran.com'));
    expect(screen.getByLabelText('Description')).toHaveValue('Handcrafted mihrab decor');
    expect(screen.getByLabelText('Audience')).toHaveValue('mosques');
    expect(screen.getByLabelText('Goals (comma-separated)')).toHaveValue('awareness, sales');
    expect(screen.getByLabelText('Facebook page URL')).toHaveValue('https://facebook.com/mehrab.alquran');
    expect(screen.getByLabelText('TikTok URL')).toHaveValue('https://tiktok.com/@mehrab.alquran');
  });

  it('posts website and social page urls with the profile', async () => {
    const { calls } = mockApi({
      'POST /tenants/t1/onboard': (body: unknown) => ({ tenantId: 't1', echo: body }),
    });
    renderWithProviders(<Onboard />, { tenantId: 't1', user: 'demo-owner' });

    await userEvent.type(screen.getByLabelText('Website'), 'https://aurora.coffee');
    await userEvent.type(screen.getByLabelText('Facebook page URL'), 'https://facebook.com/aurora');
    await userEvent.type(screen.getByLabelText('Instagram URL'), 'https://instagram.com/aurora');
    await userEvent.type(screen.getByLabelText('LinkedIn URL'), 'https://linkedin.com/company/aurora');
    await userEvent.type(screen.getByLabelText('TikTok URL'), 'https://tiktok.com/@aurora');
    await userEvent.type(screen.getByLabelText('YouTube URL'), 'https://youtube.com/@aurora');
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const body = calls.find((c) => c.method === 'POST')!.body as { website: string; socialUrls: Record<string, string> };
    expect(body.website).toBe('https://aurora.coffee');
    expect(body.socialUrls).toEqual({
      facebook: 'https://facebook.com/aurora',
      instagram: 'https://instagram.com/aurora',
      linkedin: 'https://linkedin.com/company/aurora',
      tiktok: 'https://tiktok.com/@aurora',
      youtube: 'https://youtube.com/@aurora',
    });
  });

  it('uploads a picked logo to the logo endpoint on save', async () => {
    const { calls } = mockApi({
      'POST /tenants/t1/onboard': { tenantId: 't1' },
      'PUT /tenants/t1/logo': { tenantId: 't1' },
    });
    renderWithProviders(<Onboard />, { tenantId: 't1', user: 'demo-owner' });

    const file = new File(['fake-png-bytes'], 'logo.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText(/logo/i), file);
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => {
      const put = calls.find((c) => c.method === 'PUT' && c.path === '/tenants/t1/logo');
      expect(put).toBeDefined();
      expect((put!.body as File).type).toBe('image/png');
    });
  });

  it('rejects a non-image logo file client-side (no upload call)', async () => {
    const { calls } = mockApi({
      'POST /tenants/t1/onboard': { tenantId: 't1' },
      'PUT /tenants/t1/logo': { tenantId: 't1' },
    });
    renderWithProviders(<Onboard />, { tenantId: 't1', user: 'demo-owner' });

    const file = new File(['plain text'], 'notes.txt', { type: 'text/plain' });
    await userEvent.upload(screen.getByLabelText(/logo/i), file, { applyAccept: false });
    await screen.findByText('Logo must be a PNG, JPEG, or WebP image');
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT')).toBeUndefined();
  });

  it('omits website/socialUrls entirely when the fields are left empty', async () => {
    const { calls } = mockApi({
      'POST /tenants/t1/onboard': { tenantId: 't1' },
    });
    renderWithProviders(<Onboard />, { tenantId: 't1', user: 'demo-owner' });

    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));

    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const body = calls.find((c) => c.method === 'POST')!.body as Record<string, unknown>;
    expect(body.website).toBeUndefined();
    expect(body.socialUrls).toBeUndefined();
  });
});
