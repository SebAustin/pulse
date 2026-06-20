"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLiveSnapshot } from "@/hooks/useLiveSnapshot";
import { useParticipant } from "@/hooks/useParticipant";
import { ConnectionStatus } from "@/components/ui/ConnectionStatus";
import { AudienceLobby } from "@/components/audience/AudienceLobby";
import { ClosedEventOverlay } from "@/components/audience/ClosedEventOverlay";
import { MomentStage } from "@/components/moment/MomentStage";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorBanner } from "@/components/ui/ErrorBanner";

type Props = { code: string };

/**
 * AudienceView — client-side live audience participation view.
 * DESIGN §3 /e/[code] — bright mobile-first surface.
 * Driven entirely by SSE snapshot; no route changes for moment transitions.
 */
export function AudienceView({ code }: Props) {
  const router = useRouter();
  const { identity, isHydrated } = useParticipant();

  // Redirect to join if no identity
  useEffect(() => {
    if (!isHydrated) return;
    if (!identity || identity.code !== code) {
      router.replace(`/join/${code}`);
    }
  }, [isHydrated, identity, code, router]);

  // SSE connection — only after hydration and identity confirmed
  const eventId = isHydrated && identity?.code === code ? identity.eventId : null;
  const { snapshot, connectionState } = useLiveSnapshot(eventId);

  const hasLostConnection = connectionState === "disconnected";
  const isPolling = connectionState === "polling";

  // Loading state
  if (!isHydrated || !identity) {
    return (
      <main
        className="audience-surface"
        style={{ flex: 1, minHeight: "100vh", padding: "var(--space-6)" }}
      >
        <div style={{ maxWidth: "480px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--space-4)", paddingTop: "var(--space-16)" }}>
          <Skeleton height="2rem" />
          <Skeleton height="1rem" width="60%" />
          <Skeleton height="1rem" width="80%" />
        </div>
      </main>
    );
  }

  const eventTitle = identity.eventTitle;
  const isClosed = snapshot?.eventStatus === "CLOSED";
  const hasActiveMoment = snapshot?.activeMoment !== null && snapshot?.activeMoment !== undefined;

  return (
    <div className="audience-surface" style={{ flex: 1, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Error/degraded connection banner */}
      {(hasLostConnection || isPolling) && (
        <ErrorBanner
          message={
            hasLostConnection
              ? "Connection lost — you may miss updates until we reconnect."
              : "Connection interrupted — results may be delayed."
          }
          isAudienceSurface
        />
      )}

      {/* Header bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-4) var(--space-5)",
          borderBottom: "1px solid var(--color-border-audience)",
          background: "var(--color-bg-audience)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-sm)",
            fontWeight: "var(--weight-semibold)",
            color: "var(--color-text-audience-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "calc(100% - 80px)",
            margin: 0,
          }}
        >
          {eventTitle}
        </h1>
        <ConnectionStatus state={connectionState} isAudienceSurface />
      </header>

      {/* Main content */}
      <main
        id="main-content"
        style={{
          flex: 1,
          padding: "var(--space-6) var(--space-5)",
          maxWidth: "480px",
          width: "100%",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Closed overlay */}
        {isClosed && <ClosedEventOverlay eventTitle={eventTitle} />}

        {/* No snapshot yet — loading */}
        {!snapshot && !isClosed && (
          <AudienceLobby eventTitle={eventTitle} displayName={identity.displayName} />
        )}

        {/* Snapshot exists */}
        {snapshot && !isClosed && (
          <>
            {hasActiveMoment ? (
              <MomentStage
                snapshot={snapshot}
                isHostVariant={false}
                participantId={identity.participantId}
                eventId={identity.eventId}
              />
            ) : (
              <AudienceLobby
                eventTitle={eventTitle}
                displayName={identity.displayName}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
