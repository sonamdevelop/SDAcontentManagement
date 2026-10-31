import { useEffect, useState } from 'react';
export function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    loading: boolean;
    data: T | null;
    error: unknown;
  }>({ key, loading: true, data: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key, loading: true, data: null, error: null });
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, loading: false, data, error: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ key, loading: false, data: null, error });
      });
    return () => controller.abort();
  }, [key, load, revision]);
  return {
    ...(state.key === key ? state : { key, loading: true, data: null, error: null }),
    retry: () => setRevision((n) => n + 1),
  };
}
