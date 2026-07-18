import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider, useSession } from './Session';

function Probe() {
  const { user, tenantId, setTenantId, setUser } = useSession();
  return (
    <div>
      <span data-testid="user">{user}</span>
      <span data-testid="tenant">{tenantId ?? 'none'}</span>
      <button onClick={() => setTenantId('t-123')}>pick</button>
      <button onClick={() => setUser('alice')}>login</button>
    </div>
  );
}

describe('SessionProvider', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to demo-owner and no tenant', () => {
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId('user')).toHaveTextContent('demo-owner');
    expect(screen.getByTestId('tenant')).toHaveTextContent('none');
  });

  it('persists a chosen tenant to localStorage', async () => {
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await userEvent.click(screen.getByText('pick'));
    expect(screen.getByTestId('tenant')).toHaveTextContent('t-123');
    expect(localStorage.getItem('adwasta.tenantId')).toBe('t-123');
  });

  it('rehydrates persisted identity + tenant on mount', () => {
    localStorage.setItem('adwasta.user', 'alice');
    localStorage.setItem('adwasta.tenantId', 'saved-tenant');
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    expect(screen.getByTestId('user')).toHaveTextContent('alice');
    expect(screen.getByTestId('tenant')).toHaveTextContent('saved-tenant');
  });

  it('throws if useSession is used outside the provider', () => {
    // Suppress the expected React error boundary console noise.
    const spy = () => render(<Probe />);
    expect(spy).toThrow(/within a SessionProvider/);
  });

  it('updating the user does not clobber the tenant', async () => {
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await userEvent.click(screen.getByText('pick'));
    await act(async () => {
      await userEvent.click(screen.getByText('login'));
    });
    expect(screen.getByTestId('user')).toHaveTextContent('alice');
    expect(screen.getByTestId('tenant')).toHaveTextContent('t-123');
  });
});
