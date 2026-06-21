/**
 * /host/[eventId]/summary — Tokenless post-event analytics page (Server Component).
 *
 * F-01 fix: reads the host session cookie set by Edge middleware during the
 * initial magic-link redemption.  The cookie stores the RAW host token;
 * this page verifies it against the event's hostTokenHash via a direct
 * repository call — no HTTP self-fetch (defect 4 fix).
 *
 * DESIGN §3 — host-token-gated analytics summary.
 */

import { cookies } from "next/headers";
import Link from "next/link";
import type { EventSummary } from "@/lib/dynamo/types";
import { AnalyticsSummary } from "@/components/host/AnalyticsSummary";
import { hostSessionCookieName } from "@/lib/auth/hostCookie";
import { verifyToken } from "@/lib/auth/hostToken";
import { getEventById, getEventSummary } from "@/lib/dynamo/repository";

type Props = {
  params: Promise<{ eventId: string }>;
};

type AuthOutcome =
  | { status: "unauthorized" }
  | { status: "error"; message: string }
  | { status: "ok"; eventTitle: string; summary: EventSummary | null };

async function resolveAuth(eventId: string): Promise<AuthOutcome> {
  // Read the raw host token from the httpOnly cookie.
  const cookieStore = await cookies();
  const cookieName = hostSessionCookieName(eventId);
  const rawToken = cookieStore.get(cookieName)?.value;

  if (!rawToken) return { status: "unauthorized" };

  // Fetch summary directly from the repository (no HTTP self-fetch).
  try {
    const event = await getEventById(eventId);

    if (!event) return { status: "unauthorized" };
    if (!verifyToken(rawToken, event.hostTokenHash)) return { status: "unauthorized" };

    const summary = await getEventSummary(eventId);
    return { status: "ok", eventTitle: event.title, summary };
  } catch (err) {
    // Surface real errors rather than swallowing silently.
    const message =
      err instanceof Error
        ? err.message
        : "Could not reach the database. Make sure it is running.";
    return { status: "error", message };
  }
}

export default async function SummaryPage({ params }: Props) {
  const { eventId } = await params;
  const auth = await resolveAuth(eventId);

  if (auth.status === "unauthorized") {
    return <UnauthorizedState />;
  }

  const fetchError =
    auth.status === "error"
      ? auth.message
      : auth.summary === null
      ? "Summary not yet available for this event."
      : null;

  const eventTitle = auth.status === "ok" ? auth.eventTitle : "";
  const summary = auth.status === "ok" ? auth.summary : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-bg-host)",
        color: "var(--color-text-primary)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-3) var(--space-6)",
          borderBottom: "1px solid var(--color-border-subtle)",
          background: "var(--color-surface-elevated)",
          position: "sticky",
          top: 0,
          zIndex: 20,
          gap: "var(--space-4)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
          <Link
            href={`/host/${eventId}`}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-base)",
              fontWeight: "var(--weight-bold)",
              color: "var(--color-accent-primary)",
              textDecoration: "none",
              letterSpacing: "var(--tracking-tight)",
            }}
          >
            Pulse
          </Link>
          <span
            aria-hidden="true"
            style={{
              width: "1px",
              height: "1.25rem",
              background: "var(--color-border-subtle)",
              flexShrink: 0,
            }}
          />
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-sm)",
              fontWeight: "var(--weight-semibold)",
              color: "var(--color-text-primary)",
              margin: 0,
            }}
          >
            {eventTitle}
          </h1>
        </div>

        <Link
          href={`/host/${eventId}`}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            color: "var(--color-text-tertiary)",
            textDecoration: "none",
            letterSpacing: "var(--tracking-wide)",
          }}
        >
          ← Console
        </Link>
      </header>

      {/* Content */}
      <main
        id="main-content"
        style={{
          flex: 1,
          padding: "var(--space-10) var(--space-8)",
          maxWidth: "900px",
          width: "100%",
          margin: "0 auto",
        }}
      >
        {/* Page heading */}
        <div style={{ marginBottom: "var(--space-10)" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              color: "var(--color-accent-secondary)",
              letterSpacing: "var(--tracking-widest)",
              textTransform: "uppercase",
              display: "block",
              marginBottom: "var(--space-2)",
            }}
          >
            Analytics Summary
          </span>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-3xl, 2rem)",
              fontWeight: "var(--weight-bold)",
              color: "var(--color-text-primary)",
              margin: 0,
              lineHeight: "var(--leading-tight)",
            }}
          >
            {eventTitle}
          </h2>
        </div>

        {/* Error state */}
        {fetchError && (
          <div
            role="alert"
            style={{
              background: "oklch(22% 0.05 25)",
              border: "1px solid var(--color-status-error)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-5)",
              color: "var(--color-status-error)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-sm)",
            }}
          >
            {fetchError}
          </div>
        )}

        {/* Summary */}
        {summary && (
          <AnalyticsSummary
            summary={summary}
            eventId={eventId}
          />
        )}
      </main>
    </div>
  );
}

/** Shown when the host session cookie is absent or invalid. */
function UnauthorizedState() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg-host)",
        color: "var(--color-text-primary)",
        gap: "var(--space-4)",
        padding: "var(--space-8)",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-xl)",
          fontWeight: "var(--weight-semibold)",
          color: "var(--color-text-primary)",
          margin: 0,
        }}
      >
        Session expired or not found
      </h1>
      <p
        style={{
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-sm)",
          maxWidth: "40ch",
          lineHeight: "var(--leading-relaxed)",
        }}
      >
        Please open your host link again to restore your session.
      </p>
    </div>
  );
}
