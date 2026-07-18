import { useCallback, useEffect, useRef, useState } from 'react';

export interface Resource<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  reload: () => void;
}

/**
 * Fetch-on-mount with manual reload. Re-runs when `deps` change. Guards against
 * setting state after unmount and ignores results from superseded requests.
 */
export function useResource<T>(fn: () => Promise<T>, deps: unknown[]): Resource<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const mine = ++seq.current;
    let active = true;
    setLoading(true);
    setError(undefined);
    fn()
      .then((result) => {
        if (active && mine === seq.current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active && mine === seq.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
    // fn identity is owned by the caller via deps; nonce forces manual reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, error, loading, reload };
}
