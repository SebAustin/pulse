import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { EventSummary } from "@/lib/dynamo/types";
import { AnalyticsSummary } from "@/components/host/AnalyticsSummary";

type Props = {
  params: Promise<{ eventId: string; hostToken: string }>;
};

/**
 * /host/[eventId]/[hostToken]/summary — Post-event analytics page.
 * DESIGN §3 — server-rendered for instant content paint; analytics component
 * is Client for potential future real-time updates.
 */
export default async function SummaryPage({ params }: Props) {
  const { eventId, hostToken } = await params;

  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const baseUrl = `${proto}://${host}`;

  let summary: EventSummary | null = null;
  let eventTitle = "Event";
  let fetchError: string | null = null;

  try {
    // F-01: host token sent as a request header to avoid query-param leakage
    // via access logs, Referer, or browser history.
    const res = await fetch(`${baseUrl}/api/summary/${eventId}`, {
      cache: "no-store",
      headers: { "x-pulse-host-token": hostToken },
    });

    if (res.status === 401 || res.status === 403) {
      notFound();
    }

    const json = (await res.json()) as { ok: boolean; data?: EventSummary; error?: { message: string } };

    if (json.ok && json.data) {
      summary = json.data;
      eventTitle = summary.title;
    } else {
      fetchError = json.error?.message ?? "Failed to load summary.";
    }
  } catch {
    fetchError = "Could not reach the server. Make sure the database is running.";
  }

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
            href={`/host/${eventId}/${hostToken}`}
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
          href={`/host/${eventId}/${hostToken}`}
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
            hostToken={hostToken}
          />
        )}
      </main>
    </div>
  );
}
