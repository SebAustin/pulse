"use client";

import { useState, useEffect, useRef } from "react";
import type { OpsStats } from "@/lib/dynamo/types";
import { getOpsStats } from "@/lib/api/client";

const POLL_INTERVAL_MS = 1000;

/**
 * Polls GET /api/events/[eventId]/ops every ~1s for the host console OpsReadout.
 * Degrades gracefully — fields are null on fetch failure.
 * PLAN §4.4, DESIGN §4.5.
 */
export function useOpsReadout(
  eventId: string | null,
  hostToken: string | null
): OpsStats | null {
  const [stats, setStats] = useState<OpsStats | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    if (!eventId || !hostToken) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async (): Promise<void> => {
      if (!isMountedRef.current) return;
      try {
        const res = await getOpsStats(eventId, hostToken);
        if (res.ok && res.data && isMountedRef.current) {
          setStats(res.data);
        }
      } catch {
        // silent — component renders "—" for null fields
      }

      if (isMountedRef.current) {
        timeoutId = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      isMountedRef.current = false;
      clearTimeout(timeoutId);
    };
  }, [eventId, hostToken]);

  return stats;
}
