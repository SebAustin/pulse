"use client";

import { useEffect, useRef } from "react";
import type { LeaderboardEntry } from "@/lib/dynamo/types";
import { useReducedMotion } from "@/hooks/useReducedMotion";

type Props = {
  entries: LeaderboardEntry[];
  highlightParticipantId?: string;
  isHostVariant?: boolean;
};

/**
 * LiveLeaderboard — FLIP spring reorder on score updates.
 * DESIGN §4.11.
 */
export function Leaderboard({ entries, highlightParticipantId, isHostVariant = true }: Props) {
  const reducedMotion = useReducedMotion();
  const prevPositions = useRef<Map<string, DOMRect>>(new Map());
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Capture positions BEFORE DOM update
  useEffect(() => {
    const positions = new Map<string, DOMRect>();
    rowRefs.current.forEach((el, id) => {
      positions.set(id, el.getBoundingClientRect());
    });
    prevPositions.current = positions;
  }, [entries]);

  // Apply FLIP after DOM update
  useEffect(() => {
    if (reducedMotion) return;

    rowRefs.current.forEach((el, id) => {
      const prev = prevPositions.current.get(id);
      if (!prev) return;
      const next = el.getBoundingClientRect();
      const dy = prev.top - next.top;
      if (Math.abs(dy) < 1) return;

      el.style.transform = `translateY(${dy}px)`;
      el.style.transition = "none";

      requestAnimationFrame(() => {
        el.style.transition = `transform var(--duration-spring) var(--ease-spring)`;
        el.style.transform = "translateY(0)";
      });
    });
  }, [entries, reducedMotion]);

  const maxScore = Math.max(...entries.map((e) => e.score), 1);
  const top5 = entries.slice(0, 5);
  const selfEntry = highlightParticipantId
    ? entries.find((e) => e.participantId === highlightParticipantId)
    : null;
  const selfInTop5 = selfEntry && selfEntry.rank <= 5;

  return (
    <div>
      {isHostVariant && (
        <h3
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            letterSpacing: "var(--tracking-widest)",
            color: "var(--color-status-live)",
            marginBottom: "var(--space-3)",
            textTransform: "uppercase",
          }}
        >
          Leaderboard
        </h3>
      )}

      {!isHostVariant && selfEntry && (
        <div
          style={{
            textAlign: "center",
            marginBottom: "var(--space-6)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-3xl)",
              fontWeight: "var(--weight-bold)",
              color: "var(--color-accent-audience)",
            }}
          >
            #{selfEntry.rank}
          </div>
          <div
            style={{
              color: "var(--color-text-audience-secondary)",
              fontSize: "var(--text-sm)",
            }}
          >
            {selfEntry.score.toLocaleString()} pts
          </div>
        </div>
      )}

      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
      >
        {(isHostVariant ? entries.slice(0, 10) : top5).map((entry) => {
          const fraction = entry.score / maxScore;
          const isSelf = entry.participantId === highlightParticipantId;

          return (
            <div
              key={entry.participantId}
              ref={(el) => {
                if (el) rowRefs.current.set(entry.participantId, el);
                else rowRefs.current.delete(entry.participantId);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-md)",
                background: isSelf
                  ? (isHostVariant ? "var(--color-accent-primary-subtle)" : "var(--color-accent-audience-subtle)")
                  : "transparent",
              }}
            >
              <span
                className="tabular-nums"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-xs)",
                  color: entry.rank <= 3 ? "var(--color-accent-primary)" : "var(--color-text-tertiary)",
                  width: "2ch",
                  flexShrink: 0,
                }}
              >
                {entry.rank}.
              </span>

              <span
                style={{
                  flex: 1,
                  fontSize: "var(--text-sm)",
                  color: isHostVariant
                    ? (isSelf ? "var(--color-accent-primary)" : "var(--color-text-secondary)")
                    : (isSelf ? "var(--color-accent-audience)" : "var(--color-text-audience-primary)"),
                  fontWeight: isSelf ? "var(--weight-semibold)" : "var(--weight-regular)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {entry.displayName}
              </span>

              {isHostVariant && (
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  {/* Mini bar */}
                  <div
                    aria-hidden="true"
                    style={{
                      width: "80px",
                      height: "4px",
                      background: "var(--color-surface-elevated)",
                      borderRadius: "var(--radius-full)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      className="poll-bar-fill"
                      style={{
                        height: "100%",
                        width: "100%",
                        transform: `scaleX(${fraction})`,
                        background: "var(--color-accent-primary)",
                        borderRadius: "var(--radius-full)",
                      }}
                    />
                  </div>
                  <span
                    className="tabular-nums"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--text-xs)",
                      color: "var(--color-accent-primary)",
                      width: "6ch",
                      textAlign: "right",
                    }}
                  >
                    {entry.score.toLocaleString()}
                  </span>
                </div>
              )}

              {!isHostVariant && (
                <span
                  className="tabular-nums"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-sm)",
                    color: isHostVariant ? "var(--color-accent-primary)" : "var(--color-accent-audience)",
                    fontWeight: "var(--weight-semibold)",
                  }}
                >
                  {entry.score.toLocaleString()}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Show self outside top 5 on audience */}
      {!isHostVariant && selfEntry && !selfInTop5 && (
        <>
          <div style={{ textAlign: "center", color: "var(--color-text-audience-secondary)", padding: "var(--space-2)" }}>
            ···
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              padding: "var(--space-2) var(--space-3)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-accent-audience-subtle)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                color: "var(--color-accent-audience)",
                width: "2ch",
              }}
            >
              {selfEntry.rank}.
            </span>
            <span style={{ flex: 1, fontSize: "var(--text-sm)", color: "var(--color-accent-audience)", fontWeight: "var(--weight-semibold)" }}>
              {selfEntry.displayName} (you)
            </span>
            <span
              className="tabular-nums"
              style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--color-accent-audience)" }}
            >
              {selfEntry.score.toLocaleString()}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
