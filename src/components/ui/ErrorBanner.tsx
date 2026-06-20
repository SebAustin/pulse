"use client";

import { useState } from "react";

type Props = {
  message: string;
  isAudienceSurface?: boolean;
};

/**
 * Dismissable error banner (DESIGN §4.17).
 * Slides in from top, uses role="alert" for screen readers.
 */
export function ErrorBanner({ message, isAudienceSurface = false }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      style={{
        position: "fixed",
        top: "var(--space-4)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        background: isAudienceSurface
          ? "oklch(92% 0.05 35)"
          : "var(--color-accent-secondary-subtle)",
        border: `1px solid ${isAudienceSurface ? "var(--color-accent-audience)" : "var(--color-status-warning)"}`,
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3) var(--space-6)",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        maxWidth: "min(560px, 90vw)",
        animation: "slide-up var(--duration-fast) var(--ease-out-expo)",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <span
        style={{
          fontSize: "var(--text-sm)",
          color: isAudienceSurface
            ? "var(--color-text-audience-primary)"
            : "var(--color-text-primary)",
          lineHeight: "var(--leading-snug)",
        }}
      >
        {message}
      </span>
      <button
        type="button"
        aria-label="Dismiss error"
        onClick={() => setDismissed(true)}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "inherit",
          fontSize: "var(--text-base)",
          padding: "var(--space-1)",
          opacity: 0.7,
          lineHeight: 1,
          flexShrink: 0,
          minWidth: "var(--touch-target-min)",
          minHeight: "var(--touch-target-min)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ×
      </button>
    </div>
  );
}
