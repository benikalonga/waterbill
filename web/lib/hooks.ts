'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

/** Load data from `fetcher(url)`; refetches when the url changes. Pass null to wait. */
export function useData<T = any>(fetcher: (url: string) => Promise<T>, url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const fn = useRef(fetcher);
  fn.current = fetcher;

  const reload = useCallback(async () => {
    if (!url) return;
    const run = ++latest.current;
    setLoading(true);
    try {
      const result = await fn.current(url);
      if (run === latest.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (run === latest.current) setError((e as Error).message);
    } finally {
      if (run === latest.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}

/** Run an action with a busy flag, showing any error as a toast. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <R,>(fn: () => Promise<R>, success?: string): Promise<R | undefined> => {
    setBusy(true);
    try {
      const result = await fn();
      if (success) toast.success(success);
      return result;
    } catch (e) {
      toast.error((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, run };
}

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const qs = (params: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && p.set(k, String(v)));
  const s = p.toString();
  return s ? `?${s}` : '';
};
