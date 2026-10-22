"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init?.token) headers["x-host-token"] = init.token;
  const res = await fetch(path, { ...init, headers, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  return data as T;
}

export function post<T = unknown>(path: string, body: unknown, token?: string) {
  return api<T>(path, { method: "POST", body: JSON.stringify(body), token });
}

/**
 * Polls `fetcher` every `interval` ms (pausing while the tab is hidden).
 * `clockOffset` is the estimated server time minus local time, derived from
 * the `now` field every game response carries.
 */
export function usePoll<T extends { now: number }>(
  fetcher: (() => Promise<T>) | null,
  interval: number | ((data: T | null) => number),
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const fetcherRef = useRef(fetcher);
  const intervalRef = useRef(interval);
  const dataRef = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<() => void>(() => {});
  fetcherRef.current = fetcher;
  intervalRef.current = interval;

  const enabled = fetcher !== null;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let inFlight = false;

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      const iv = intervalRef.current;
      const ms = typeof iv === "function" ? iv(dataRef.current) : iv;
      timer.current = setTimeout(run, document.hidden ? ms * 4 : ms);
    };
    const run = async () => {
      const f = fetcherRef.current;
      if (cancelled || !f || inFlight) return;
      inFlight = true;
      const sentAt = Date.now();
      try {
        const d = await f();
        if (cancelled) return;
        const receivedAt = Date.now();
        // Assume the server stamped `now` halfway through the round trip.
        setClockOffset(d.now - (sentAt + receivedAt) / 2);
        dataRef.current = d;
        setData(d);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e as Error);
      } finally {
        inFlight = false;
        if (!cancelled) schedule();
      }
    };
    tick.current = run;
    run();
    const onVisible = () => !document.hidden && run();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  const refresh = useCallback(() => tick.current(), []);
  return { data, error, clockOffset, refresh };
}

/** Re-renders every `ms` and returns the estimated current server time. */
export function useServerNow(clockOffset: number, ms = 200) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now + clockOffset;
}

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode); the session just won't survive reloads.
  }
}

export const hostTokenKey = (code: string) => `quiz-host:${code}`;
export const playerIdKey = (code: string) => `quiz-player:${code}`;

export function formatSeconds(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`;
}
