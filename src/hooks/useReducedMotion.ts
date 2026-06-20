"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Returns true when the user has requested reduced motion via the OS/browser.
 * Falls back to false on the server and on first render (SSR-safe).
 *
 * Uses useSyncExternalStore for correct concurrent-mode integration
 * and to avoid the "setState in effect" anti-pattern.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
