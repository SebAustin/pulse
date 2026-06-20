"use client";

import { useState, useCallback } from "react";
import { useLiveSnapshot } from "@/hooks/useLiveSnapshot";
import { ConnectionStatus } from "@/components/ui/ConnectionStatus";
import { OpsReadout } from "@/components/host/OpsReadout";
import { MomentLauncher } from "@/components/host/MomentLauncher";
import { MomentStage } from "@/components/moment/MomentStage";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Skeleton } from "@/components/ui/Skeleton";
import { closeEvent, closeMoment } from "@/lib/api/client";
import Link from "next/link";

type Props = {
  eventId: string;
  hostToken: string;
  eventTitle: string;
  code: string;
};

/**
 * HostConsole — three-column control room layout.
 * DESIGN §3 /host/[eventId]/[hostToken] — dark broadcast surface.
 * Left rail: ops + stats. Centre: moment control. Right rail: status + actions.
 */
export function HostConsole({ eventId, hostToken, eventTitle, code }: Props) {
  const { snapshot, connectionState } = useLiveSnapshot(eventId);
  const [closingEvent, setClosingEvent] = useState(false);
  const [closingMoment, setClosingMoment] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [eventClosed, setEventClosed] = useState(false);

  const isClosed =
    eventClosed || snapshot?.eventStatus === "CLOSED";
  const hasActiveMoment =
    snapshot?.activeMoment !== null && snapshot?.activeMoment !== undefined;

  const handleCloseMoment = useCallback(async () => {
    const momentId = snapshot?.activeMoment?.momentId;
    if (!momentId || closingMoment) return;
    setClosingMoment(true);
    setErrorMsg(null);
    const res = await closeMoment(eventId, momentId, hostToken);
    setClosingMoment(false);
    if (!res.ok) {
      setErrorMsg(res.error?.message ?? "Failed to close moment.");
    }
  }, [snapshot?.activeMoment?.momentId, closingMoment, eventId, hostToken]);

  const handleCloseEvent = useCallback(async () => {
    if (closingEvent) return;
    setClosingEvent(true);
    setErrorMsg(null);
    const res = await closeEvent(eventId, hostToken);
    setClosingEvent(false);
    if (!res.ok) {
      setErrorMsg(res.error?.message ?? "Failed to close event.");
    } else {
      setEventClosed(true);
    }
  }, [closingEvent, eventId, hostToken]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg-host)",
        color: "var(--color-text-primary)",
      }}
    >
      {errorMsg && (
        <ErrorBanner message={errorMsg} />
      )}

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
        {/* Wordmark + event info */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", overflow: "hidden" }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-base)",
              fontWeight: "var(--weight-bold)",
              color: "var(--color-accent-primary)",
              letterSpacing: "var(--tracking-tight)",
              flexShrink: 0,
            }}
          >
            Pulse
          </span>
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
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {eventTitle}
          </h1>

          {/* Join code badge */}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              color: "var(--color-text-tertiary)",
              background: "var(--color-surface-recessed)",
              padding: "2px var(--space-2)",
              borderRadius: "var(--radius-sm)",
              letterSpacing: "var(--tracking-widest)",
              flexShrink: 0,
            }}
          >
            {code}
          </span>

          {isClosed && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                color: "var(--color-status-error)",
                background: "oklch(22% 0.05 25)",
                padding: "2px var(--space-2)",
                borderRadius: "var(--radius-sm)",
                letterSpacing: "var(--tracking-widest)",
                flexShrink: 0,
              }}
            >
              CLOSED
            </span>
          )}
        </div>

        {/* Right: connection + summary link */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-5)", flexShrink: 0 }}>
          <ConnectionStatus state={connectionState} />
          <Link
            href={`/host/${eventId}/${hostToken}/summary`}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              color: "var(--color-accent-secondary)",
              textDecoration: "none",
              letterSpacing: "var(--tracking-wide)",
              opacity: 0.85,
            }}
          >
            SUMMARY →
          </Link>
        </div>
      </header>

      {/* Console body — 3-column on desktop */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "280px 1fr 240px",
          gap: 0,
          alignItems: "start",
        }}
      >
        {/* LEFT RAIL — Ops + stats */}
        <aside
          aria-label="Operations readout"
          style={{
            borderRight: "1px solid var(--color-border-subtle)",
            padding: "var(--space-6)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-5)",
            position: "sticky",
            top: "57px",
            maxHeight: "calc(100vh - 57px)",
            overflowY: "auto",
          }}
        >
          <OpsReadout eventId={eventId} hostToken={hostToken} />

          {/* Participant count from snapshot */}
          <div
            style={{
              background: "var(--color-surface-recessed)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                color: "var(--color-text-tertiary)",
                letterSpacing: "var(--tracking-widest)",
                textTransform: "uppercase",
                marginBottom: "var(--space-2)",
              }}
            >
              Participants
            </div>
            {!snapshot ? (
              <Skeleton height="1.5rem" />
            ) : (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-2xl)",
                  fontWeight: "var(--weight-bold)",
                  color: "var(--color-accent-secondary)",
                  lineHeight: 1,
                }}
                aria-live="polite"
                aria-atomic="true"
              >
                {snapshot.leaderboard.length > 0 ? snapshot.leaderboard.length : "—"}
              </div>
            )}
          </div>

          {/* Sequence */}
          {snapshot && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                color: "var(--color-text-quaternary, var(--color-text-tertiary))",
                letterSpacing: "var(--tracking-widest)",
              }}
            >
              SEQ #{snapshot.seq}
            </div>
          )}
        </aside>

        {/* CENTRE — Moment control */}
        <main
          id="main-content"
          style={{
            padding: "var(--space-8)",
            minHeight: "calc(100vh - 57px)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-6)",
          }}
        >
          {isClosed ? (
            <ClosedPanel eventId={eventId} hostToken={hostToken} />
          ) : !snapshot ? (
            <LoadingPanel />
          ) : hasActiveMoment ? (
            <MomentStage
              snapshot={snapshot}
              isHostVariant={true}
              eventId={eventId}
              onCloseMoment={handleCloseMoment}
              hostToken={hostToken}
            />
          ) : (
            <MomentLauncher
              eventId={eventId}
              hostToken={hostToken}
              participantCount={snapshot.leaderboard.length}
              onMomentLaunched={() => {/* SSE will push snapshot update */}}
            />
          )}
        </main>

        {/* RIGHT RAIL — Status + danger zone */}
        <aside
          aria-label="Event controls"
          style={{
            borderLeft: "1px solid var(--color-border-subtle)",
            padding: "var(--space-6)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-5)",
            position: "sticky",
            top: "57px",
            maxHeight: "calc(100vh - 57px)",
            overflowY: "auto",
          }}
        >
          {/* QR / share */}
          <div
            style={{
              background: "var(--color-surface-recessed)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                color: "var(--color-text-tertiary)",
                letterSpacing: "var(--tracking-widest)",
                textTransform: "uppercase",
                marginBottom: "var(--space-3)",
              }}
            >
              Join URL
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                color: "var(--color-accent-primary)",
                wordBreak: "break-all",
                lineHeight: "var(--leading-relaxed)",
              }}
            >
              /join/{code}
            </div>
            <div
              style={{
                marginTop: "var(--space-3)",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-3xl, 2rem)",
                fontWeight: "var(--weight-bold)",
                color: "var(--color-text-primary)",
                letterSpacing: "var(--tracking-widest)",
                textAlign: "center",
              }}
            >
              {code}
            </div>
          </div>

          {/* Moment close (if active) */}
          {hasActiveMoment && !isClosed && (
            <button
              type="button"
              onClick={handleCloseMoment}
              disabled={closingMoment}
              aria-busy={closingMoment}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                letterSpacing: "var(--tracking-wide)",
                textTransform: "uppercase",
                padding: "var(--space-3) var(--space-4)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-status-warning)",
                background: "transparent",
                color: "var(--color-status-warning)",
                cursor: closingMoment ? "not-allowed" : "pointer",
                opacity: closingMoment ? 0.5 : 1,
                width: "100%",
                minHeight: "var(--touch-target-min)",
                transition: "opacity var(--duration-fast)",
              }}
            >
              {closingMoment ? "Closing…" : "Close Moment"}
            </button>
          )}

          {/* Close event */}
          {!isClosed && (
            <button
              type="button"
              onClick={handleCloseEvent}
              disabled={closingEvent}
              aria-busy={closingEvent}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                letterSpacing: "var(--tracking-wide)",
                textTransform: "uppercase",
                padding: "var(--space-3) var(--space-4)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-status-error)",
                background: "transparent",
                color: "var(--color-status-error)",
                cursor: closingEvent ? "not-allowed" : "pointer",
                opacity: closingEvent ? 0.5 : 1,
                width: "100%",
                minHeight: "var(--touch-target-min)",
                transition: "opacity var(--duration-fast)",
              }}
            >
              {closingEvent ? "Closing…" : "End Event"}
            </button>
          )}

          {/* Summary link */}
          <Link
            href={`/host/${eventId}/${hostToken}/summary`}
            style={{
              display: "block",
              textAlign: "center",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              color: "var(--color-text-tertiary)",
              letterSpacing: "var(--tracking-wide)",
              textDecoration: "none",
              padding: "var(--space-2)",
              opacity: 0.7,
            }}
          >
            View Analytics →
          </Link>
        </aside>
      </div>

      {/* Mobile layout */}
      <style>{`
        @media (max-width: 1023px) {
          .host-console-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

/** Loading skeleton when snapshot hasn't arrived yet */
function LoadingPanel() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        maxWidth: "560px",
      }}
    >
      <Skeleton height="var(--text-xl)" width="60%" />
      <Skeleton height="var(--text-sm)" />
      <Skeleton height="var(--text-sm)" width="80%" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
        <Skeleton height="8rem" />
        <Skeleton height="8rem" />
        <Skeleton height="8rem" />
        <Skeleton height="8rem" />
      </div>
    </div>
  );
}

/** Panel shown after event closes */
function ClosedPanel({ eventId, hostToken }: { eventId: string; hostToken: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        gap: "var(--space-6)",
        textAlign: "center",
        paddingTop: "var(--space-16)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-4xl, 3rem)",
          color: "var(--color-text-tertiary)",
          lineHeight: 1,
        }}
      >
        ■
      </div>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-2xl)",
          fontWeight: "var(--weight-semibold)",
          color: "var(--color-text-primary)",
          margin: 0,
        }}
      >
        Event Closed
      </h2>
      <p
        style={{
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-sm)",
          maxWidth: "32ch",
          lineHeight: "var(--leading-relaxed)",
        }}
      >
        This event has ended. View the analytics summary to review results.
      </p>
      <Link
        href={`/host/${eventId}/${hostToken}/summary`}
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-sm)",
          fontWeight: "var(--weight-semibold)",
          color: "var(--color-bg-host)",
          background: "var(--color-accent-primary)",
          padding: "var(--space-3) var(--space-6)",
          borderRadius: "var(--radius-md)",
          textDecoration: "none",
          letterSpacing: "var(--tracking-wide)",
          minHeight: "var(--touch-target-min)",
          display: "inline-flex",
          alignItems: "center",
        }}
      >
        View Summary →
      </Link>
    </div>
  );
}
