"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
  setData: (value: T | null) => void;
}

export function useResource<T>(
  loader: () => Promise<T>,
  enabled = true,
): ResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  const requestIdRef = useRef(0);
  loaderRef.current = loader;

  const run = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current();
      if (requestId === requestIdRef.current) setData(result);
    } catch (caught) {
      if (requestId === requestIdRef.current) {
        setError(
          caught instanceof Error ? caught : new Error("Unexpected error"),
        );
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      setLoading(false);
      return;
    }
    void run();
  }, [enabled, loader, nonce, run]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { data, loading, error, reload, setData };
}

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
