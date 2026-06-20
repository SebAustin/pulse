"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Snapshot } from "@/lib/dynamo/types";
import { getSnapshot } from "@/lib/api/client";

export type ConnectionState = "connecting" | "connected" | "polling" | "reconnecting" | "disconnected";

export interface LiveSnapshot {
  readonly snapshot: Snapshot | null;
  readonly connectionState: ConnectionState;
}

const SSE_RECONNECT_GRACE_MS = 3000;
const POLL_INTERVAL_MS = 3000;

/**
 * Transport-agnostic hook for receiving live snapshots.
 *
 * Primary: EventSource to GET /api/stream/[eventId] (SSE).
 * Fallback: GET /api/stream/[eventId]?once=1 polled every POLL_INTERVAL_MS.
 *
 * Exposes { snapshot, connectionState } — components are transport-agnostic.
 * PLAN §5.2, F-03.1, F-03.2.
 */
export function useLiveSnapshot(eventId: string | null): LiveSnapshot {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  const esRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gracTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const usingPolling = useRef(false);

  const clearPollTimer = useCallback((): void => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const clearGraceTimer = useCallback((): void => {
    if (gracTimerRef.current !== null) {
      clearTimeout(gracTimerRef.current);
      gracTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback((id: string): void => {
    if (!isMountedRef.current) return;
    usingPolling.current = true;
    setConnectionState("polling");

    const poll = async (): Promise<void> => {
      if (!isMountedRef.current) return;
      try {
        const res = await getSnapshot(id);
        if (res.ok && res.data && isMountedRef.current) {
          setSnapshot(res.data);
        }
      } catch {
        if (isMountedRef.current) {
          setConnectionState("disconnected");
        }
      }
    };

    void poll();
    pollTimerRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
  }, []);

  const connectSSE = useCallback(
    (id: string): void => {
      if (!isMountedRef.current) return;

      clearPollTimer();
      usingPolling.current = false;
      setConnectionState("connecting");

      const es = new EventSource(`/api/stream/${id}`);
      esRef.current = es;

      es.addEventListener("snapshot", (e: MessageEvent) => {
        clearGraceTimer();
        if (!isMountedRef.current) return;
        try {
          const data = JSON.parse(e.data as string) as Snapshot;
          setSnapshot(data);
          setConnectionState("connected");
        } catch {
          // malformed frame — ignore
        }
      });

      es.onerror = (): void => {
        if (!isMountedRef.current) return;
        setConnectionState("reconnecting");

        // Give the native EventSource reconnect a grace period before falling
        // back to polling — the browser auto-reconnects after a short delay.
        clearGraceTimer();
        gracTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          // Still not connected — switch to polling fallback
          es.close();
          esRef.current = null;
          startPolling(id);
        }, SSE_RECONNECT_GRACE_MS);
      };
    },
    [clearGraceTimer, clearPollTimer, startPolling]
  );

  useEffect(() => {
    isMountedRef.current = true;

    if (!eventId) return;

    // Check for EventSource support (not available in some environments)
    if (typeof EventSource === "undefined") {
      startPolling(eventId);
      return;
    }

    connectSSE(eventId);

    return () => {
      isMountedRef.current = false;
      clearGraceTimer();
      clearPollTimer();
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [eventId, connectSSE, startPolling, clearGraceTimer, clearPollTimer]);

  return { snapshot, connectionState };
}
