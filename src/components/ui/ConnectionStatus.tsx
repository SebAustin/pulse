"use client";

import type { ConnectionState } from "@/hooks/useLiveSnapshot";

type Props = {
  state: ConnectionState;
  isAudienceSurface?: boolean;
};

const labels: Record<ConnectionState, string> = {
  connected: "Live",
  connecting: "Connecting…",
  polling: "Polling",
  reconnecting: "Reconnecting…",
  disconnected: "Offline",
};

/**
 * Connection status indicator dot + label.
 * DESIGN §4.4 — top-right corner of host console and audience view.
 * Uses aria-live="polite" + role="status" for a11y (DESIGN §7 ARIA table).
 */
export function ConnectionStatus({ state, isAudienceSurface }: Props) {
  const label = labels[state];

  const dotStyle: React.CSSProperties =
    state === "connected"
      ? {
          background: "var(--color-status-live)",
          position: "relative",
          display: "inline-block",
        }
      : state === "polling"
      ? {
          background: "var(--color-accent-secondary)",
          display: "inline-block",
          animation: "ripple 1.5s ease-out infinite",
        }
      : state === "reconnecting"
      ? {
          background: "var(--color-status-warning)",
          display: "inline-block",
        }
      : {
          background: "transparent",
          border: "2px solid var(--color-status-error)",
          display: "inline-block",
        };

  const textColor =
    isAudienceSurface
      ? "var(--color-text-audience-secondary)"
      : "var(--color-text-secondary)";

  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        fontSize: "var(--text-xs)",
        fontFamily: "var(--font-mono)",
        color: textColor,
      }}
    >
      <span
        aria-hidden="true"
        className={state === "connected" ? "status-dot-live" : ""}
        style={{
          ...dotStyle,
          width: "var(--status-dot-size)",
          height: "var(--status-dot-size)",
          borderRadius: "var(--radius-full)",
          flexShrink: 0,
        }}
      />
      <span className="sr-only">{label}</span>
      <span aria-hidden="true">{label}</span>
    </span>
  );
}
