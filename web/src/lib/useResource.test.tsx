import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useResource } from './useResource';

function View({ fn }: { fn: () => Promise<string> }) {
  const { data, error, loading, reload } = useResource(fn, []);
  return (
    <div>
      {loading && <span>loading</span>}
      {error && <span>error:{error.message}</span>}
      {data && <span>data:{data}</span>}
      <button onClick={reload}>reload</button>
    </div>
  );
}

describe('useResource', () => {
  it('shows loading then resolves data', async () => {
    render(<View fn={async () => 'hello'} />);
    expect(screen.getByText('loading')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('data:hello')).toBeInTheDocument());
  });

  it('captures errors', async () => {
    render(<View fn={async () => { throw new Error('boom'); }} />);
    await waitFor(() => expect(screen.getByText('error:boom')).toBeInTheDocument());
  });

  it('re-runs fn on reload', async () => {
    let count = 0;
    const fn = vi.fn(async () => `n${++count}`);
    render(<View fn={fn} />);
    await waitFor(() => expect(screen.getByText('data:n1')).toBeInTheDocument());
    await userEvent.click(screen.getByText('reload'));
    await waitFor(() => expect(screen.getByText('data:n2')).toBeInTheDocument());
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
