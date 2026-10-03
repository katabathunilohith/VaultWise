"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(url: string, body: unknown) =>
    request<T>(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  del: <T>(url: string) => request<T>(url, { method: "DELETE" }),
  upload: <T>(url: string, form: FormData) => request<T>(url, { method: "POST", body: form }),
};

/* ---------- Keyed query store (stale-while-revalidate) ---------- */

interface Entry {
  data?: unknown;
  error: string | null;
  loading: boolean;
}

const EMPTY: Entry = { error: null, loading: false };
const store = new Map<string, Entry>();
const subscribers = new Map<string, number>();
const listeners = new Set<() => void>();
const inflight = new Map<string, Promise<void>>();

function emit() {
  for (const l of listeners) l();
}

function set(url: string, patch: Partial<Entry>) {
  store.set(url, { ...(store.get(url) ?? EMPTY), ...patch });
  emit();
}

function fetchKey(url: string) {
  const running = inflight.get(url);
  if (running) return running;
  set(url, { loading: true });
  const p = request<unknown>(url)
    .then((data) => set(url, { data, error: null, loading: false }))
    .catch((e: Error) => set(url, { error: e.message, loading: false }))
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/** Refetches every query that's currently on screen (call after a mutation). */
export function refreshAll() {
  for (const [url, n] of subscribers) if (n > 0) fetchKey(url);
}

/** Drops cached responses (e.g. after the demo is reset). */
export function clearApiCache() {
  store.clear();
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useApi<T>(url: string | null, opts: { interval?: number } = {}) {
  const entry = useSyncExternalStore(
    subscribe,
    () => (url ? (store.get(url) ?? EMPTY) : EMPTY),
    () => EMPTY,
  );

  useEffect(() => {
    if (!url) return;
    subscribers.set(url, (subscribers.get(url) ?? 0) + 1);
    fetchKey(url);
    return () => {
      subscribers.set(url, (subscribers.get(url) ?? 1) - 1);
    };
  }, [url]);

  useEffect(() => {
    if (!opts.interval || !url) return;
    const id = setInterval(() => fetchKey(url), opts.interval);
    return () => clearInterval(id);
  }, [opts.interval, url]);

  const reload = useCallback(() => (url ? fetchKey(url) : Promise.resolve()), [url]);
  return { data: entry.data as T | undefined, error: entry.error, loading: entry.loading, reload };
}

/** Current time that re-renders on an interval (keeps render functions pure). */
export function useNow(intervalMs = 0) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!intervalMs) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
