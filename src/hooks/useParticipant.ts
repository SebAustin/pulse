"use client";

import { useState, useCallback } from "react";

export interface ParticipantIdentity {
  readonly participantId: string;
  readonly displayName: string;
  readonly eventId: string;
  readonly code: string;
  readonly eventTitle: string;
}

const STORAGE_KEY = "pulse_participant";

function readStorage(): ParticipantIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ParticipantIdentity;
  } catch {
    return null;
  }
}

/**
 * Manages the audience participant identity stored in sessionStorage.
 *
 * Identity is issued by the server on join (POST /api/join) and stored here
 * so it survives page refreshes within the same tab session but not across tabs.
 *
 * PLAN §1.2 identity boundary — participantId is server-issued.
 *
 * Uses a lazy initializer for state so sessionStorage is read at most once,
 * during the first client render, without violating the `setState-in-effect` rule.
 * `isHydrated` is always `true` after mount since we read in the initializer.
 */
export function useParticipant() {
  // Lazy initializer runs once at mount on the client; returns null during SSR
  const [identity, setIdentity] = useState<ParticipantIdentity | null>(() =>
    readStorage()
  );

  // isHydrated: false only on the very first SSR render where we can't read storage
  const [isHydrated] = useState(() => typeof window !== "undefined");

  const saveIdentity = useCallback((next: ParticipantIdentity): void => {
    setIdentity(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // sessionStorage unavailable — identity lives only in state
    }
  }, []);

  const clearIdentity = useCallback((): void => {
    setIdentity(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { identity, isHydrated, saveIdentity, clearIdentity };
}
