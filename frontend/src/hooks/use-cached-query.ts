// R1 — cache-first data hook. Renders the last successful response INSTANTLY
// from AsyncStorage, then refreshes in the background and reconciles. No
// full-screen spinners in the core loop; a sleeping Render instance just means
// the user sees yesterday's data for a beat, never a spinner wall.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

const CACHE_PREFIX = "ammiai.cache.";
const STALE_MS = 24 * 60 * 60 * 1000; // 24h

type CacheEnvelope<T> = { ts: number; data: T };

export type CachedQuery<T> = {
  data: T | null;
  /** true while a background refresh is in flight (show a subtle shimmer, not a spinner) */
  updating: boolean;
  /** true when cached data is >24h old AND the latest refresh failed */
  stale: boolean;
  hasData: boolean;
  refetch: () => void;
};

// Low-level cache helpers for screens that keep their own state + mutation
// flow (Plan/Pantry/Grocery) but still want an instant first paint: seed state
// from readCache() on mount, and writeCache() on every successful load.
export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return (JSON.parse(raw) as CacheEnvelope<T>).data ?? null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  AsyncStorage.setItem(
    CACHE_PREFIX + key,
    JSON.stringify({ ts: Date.now(), data } as CacheEnvelope<T>),
  ).catch(() => {});
}

// The storage wrapper in src/utils/storage is primitives-only; cache payloads
// are objects, so we go straight to AsyncStorage with our own JSON envelope.
export function useCachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
): CachedQuery<T> {
  const [data, setData] = useState<T | null>(null);
  const [updating, setUpdating] = useState(false);
  const [stale, setStale] = useState(false);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const cacheTsRef = useRef<number | null>(null);
  const mounted = useRef(true);

  const run = useCallback(async () => {
    const ckey = CACHE_PREFIX + key;
    // 1) Hydrate from cache immediately (instant paint).
    try {
      const raw = await AsyncStorage.getItem(ckey);
      if (raw) {
        const env = JSON.parse(raw) as CacheEnvelope<T>;
        cacheTsRef.current = env.ts;
        if (mounted.current && env.data != null) setData(env.data);
      }
    } catch {
      /* corrupt cache — ignore, fall through to network */
    }
    // 2) Background refresh + reconcile.
    if (mounted.current) setUpdating(true);
    try {
      const fresh = await fetcherRef.current();
      cacheTsRef.current = Date.now();
      if (mounted.current) {
        setData(fresh);
        setStale(false);
      }
      AsyncStorage.setItem(
        ckey,
        JSON.stringify({ ts: cacheTsRef.current, data: fresh } as CacheEnvelope<T>),
      ).catch(() => {});
    } catch {
      const age = cacheTsRef.current ? Date.now() - cacheTsRef.current : Infinity;
      if (mounted.current && age > STALE_MS) setStale(true);
    } finally {
      if (mounted.current) setUpdating(false);
    }
  }, [key]);

  useFocusEffect(
    useCallback(() => {
      run();
    }, [run]),
  );

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  return { data, updating, stale, hasData: data !== null, refetch: run };
}
