"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "@/lib/api/client";

/**
 * EventCreateForm — landing page, left column.
 * DESIGN §4.1. Calls POST /api/events, redirects to host console.
 */
export function EventCreateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charCount = title.length;
  const showCount = charCount >= 80;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmed = title.trim();
    if (!trimmed) {
      setError("Please enter an event title.");
      return;
    }

    setLoading(true);
    try {
      const res = await createEvent(trimmed);
      if (!res.ok || !res.data) {
        setError(res.error?.message ?? "Something went wrong. Please try again.");
        return;
      }
      const { eventId, hostToken } = res.data;
      router.push(`/host/${eventId}/${hostToken}`);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={loading}
      noValidate
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <label
          htmlFor="event-title"
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: "var(--weight-medium)",
            color: "var(--color-text-secondary)",
            letterSpacing: "var(--tracking-wide)",
            textTransform: "uppercase",
          }}
        >
          Event title
        </label>
        <input
          id="event-title"
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError(null);
          }}
          placeholder="e.g. My Q3 All-Hands"
          maxLength={120}
          disabled={loading}
          aria-describedby={error ? "event-title-error" : showCount ? "event-title-count" : undefined}
          style={{
            background: "var(--color-surface-recessed)",
            border: `1px solid ${error ? "var(--color-status-error)" : "var(--color-border-default)"}`,
            borderRadius: "var(--radius-md)",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-base)",
            padding: "var(--space-3) var(--space-4)",
            width: "100%",
            minHeight: "var(--touch-target-min)",
            transition: `border-color var(--duration-fast)`,
            outline: "none",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--color-accent-primary)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = error
              ? "var(--color-status-error)"
              : "var(--color-border-default)";
          }}
        />
        {showCount && !error && (
          <span
            id="event-title-count"
            aria-live="polite"
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--color-text-tertiary)",
              fontFamily: "var(--font-mono)",
              textAlign: "right",
            }}
          >
            {charCount} / 120
          </span>
        )}
        {error && (
          <span
            id="event-title-error"
            role="alert"
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--color-status-error)",
            }}
          >
            {error}
          </span>
        )}
      </div>

      <button
        type="submit"
        aria-disabled={loading || !title.trim()}
        disabled={loading}
        style={{
          background: title.trim()
            ? "var(--color-accent-primary)"
            : "var(--color-surface-elevated)",
          color: title.trim() ? "oklch(98% 0.004 270)" : "var(--color-text-tertiary)",
          border: "none",
          borderRadius: "var(--radius-md)",
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-base)",
          fontWeight: "var(--weight-semibold)",
          padding: "var(--space-4) var(--space-8)",
          cursor: loading ? "wait" : title.trim() ? "pointer" : "not-allowed",
          opacity: loading ? 0.7 : 1,
          transition: `background var(--duration-normal), opacity var(--duration-fast)`,
          width: "100%",
          minHeight: "var(--touch-target-audience)",
          letterSpacing: "var(--tracking-wide)",
        }}
      >
        {loading ? "Creating…" : "Create event →"}
      </button>
    </form>
  );
}
