"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinEvent } from "@/lib/api/client";
import { useParticipant } from "@/hooks/useParticipant";

type Props = {
  prefillCode?: string;
  prefillTitle?: string;
};

/**
 * JoinForm — used on /join and /join/[code].
 * Calls POST /api/join, stores identity in sessionStorage, navigates to /e/[code].
 * DESIGN §4.3.
 */
export function JoinForm({ prefillCode = "", prefillTitle }: Props) {
  const router = useRouter();
  const { saveIdentity } = useParticipant();

  const [code, setCode] = useState(prefillCode.toUpperCase());
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeHidden = !!prefillCode;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimName = displayName.trim();
    if (!trimName) {
      setError("Please enter your display name.");
      return;
    }
    if (trimName.length > 32) {
      setError("Display names must be 32 characters or fewer.");
      return;
    }
    const trimCode = code.trim().toUpperCase();
    if (trimCode.length !== 6) {
      setError("Please enter a 6-character event code.");
      return;
    }

    setLoading(true);
    try {
      const res = await joinEvent(trimCode, trimName);
      if (!res.ok || !res.data) {
        const msg = res.error?.message ?? "Something went wrong.";
        setError(msg);
        return;
      }
      const { eventId, participantId, code: resolvedCode, title, status } = res.data;

      if (status === "CLOSED") {
        setError("This event has ended.");
        return;
      }

      saveIdentity({
        participantId,
        displayName: trimName,
        eventId,
        code: resolvedCode,
        eventTitle: title,
      });

      router.push(`/e/${resolvedCode}`);
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
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)", width: "100%" }}
    >
      {prefillTitle && (
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-xl)",
            fontWeight: "var(--weight-semibold)",
            color: "var(--color-text-audience-primary)",
            textAlign: "center",
          }}
        >
          {prefillTitle}
        </div>
      )}

      {/* Display name input */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <label
          htmlFor="join-display-name"
          style={{
            fontSize: "var(--text-sm)",
            fontWeight: "var(--weight-medium)",
            color: "var(--color-text-audience-secondary)",
          }}
        >
          Your name
        </label>
        <input
          id="join-display-name"
          type="text"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Your display name"
          maxLength={32}
          disabled={loading}
          autoComplete="nickname"
          style={{
            background: "white",
            border: `1.5px solid var(--color-border-audience)`,
            borderRadius: "var(--radius-md)",
            color: "var(--color-text-audience-primary)",
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-base)",
            padding: "var(--space-4)",
            width: "100%",
            minHeight: "var(--touch-target-audience)",
            outline: "none",
            transition: `border-color var(--duration-fast)`,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--color-accent-audience)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border-audience)";
          }}
        />
      </div>

      {/* Code input (hidden if pre-filled) */}
      {!codeHidden && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <label
            htmlFor="join-code"
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: "var(--weight-medium)",
              color: "var(--color-text-audience-secondary)",
            }}
          >
            Event code
          </label>
          <input
            id="join-code"
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
              if (error) setError(null);
            }}
            placeholder="ABC123"
            maxLength={6}
            disabled={loading}
            aria-label="6-character join code"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            style={{
              background: "white",
              border: `1.5px solid var(--color-border-audience)`,
              borderRadius: "var(--radius-md)",
              color: "var(--color-text-audience-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xl)",
              fontWeight: "var(--weight-bold)",
              padding: "var(--space-4)",
              width: "100%",
              minHeight: "var(--touch-target-audience)",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              outline: "none",
              textAlign: "center",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--color-accent-audience)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-audience)";
            }}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <span
          role="alert"
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-status-error)",
          }}
        >
          {error}
        </span>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        style={{
          background: "var(--color-accent-audience)",
          color: "white",
          border: "none",
          borderRadius: "var(--radius-md)",
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-lg)",
          fontWeight: "var(--weight-semibold)",
          padding: "var(--space-4)",
          cursor: loading ? "wait" : "pointer",
          opacity: loading ? 0.7 : 1,
          width: "100%",
          minHeight: "var(--touch-target-audience)",
          transition: `background var(--duration-fast), opacity var(--duration-fast)`,
        }}
        onMouseEnter={(e) => {
          if (!loading) e.currentTarget.style.background = "var(--color-accent-audience-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--color-accent-audience)";
        }}
      >
        {loading ? "Joining…" : "Join →"}
      </button>
    </form>
  );
}
