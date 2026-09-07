import { useCallback, useEffect, useState } from 'react';

export type RemoteState<T> = {
  data: T | null;
  error: unknown;
  loading: boolean;
  refreshing: boolean;
};

/** A small fetch-state hook keeps each operational screen consistent. */
export function useRemote<T>(
  loader: () => Promise<T>,
  refreshEveryMs?: number,
) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<RemoteState<T>>({
    data: null,
    error: null,
    loading: true,
    refreshing: false,
  });

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let current = true;
    setState((previous) => ({
      ...previous,
      error: null,
      loading: previous.data === null,
      refreshing: previous.data !== null,
    }));

    void loader()
      .then((data) => {
        if (current) {
          setState({ data, error: null, loading: false, refreshing: false });
        }
      })
      .catch((error: unknown) => {
        if (current) {
          setState((previous) => ({
            ...previous,
            error,
            loading: false,
            refreshing: false,
          }));
        }
      });

    return () => {
      current = false;
    };
  }, [loader, version]);

  useEffect(() => {
    if (!refreshEveryMs) return undefined;
    const interval = window.setInterval(reload, refreshEveryMs);
    return () => window.clearInterval(interval);
  }, [refreshEveryMs, reload]);

  return { ...state, reload };
}
