"use client";

import { useState, useCallback, useRef } from "react";
import type { Tally } from "@/lib/dynamo/types";
import { submitReaction } from "@/lib/api/client";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { config } from "@/lib/config";

type Props = {
  eventId: string;
  momentId: string;
  tally: Tally;
  isHostVariant: boolean;
  participantId?: string;
  momentStatus: "ACTIVE" | "CLOSED";
  onClose?: () => void;
};

interface Floater {
  id: string;
  emoji: string;
  left: number;
}

const MAX_FLOATERS = 20;
const DEBOUNCE_MS = 200;

/**
 * ReactionBurst — emoji reactions component.
 * DESIGN §4.10.
 * Host: aggregate counts + floating burst visualization.
 * Audience: 3x2 grid of large emoji buttons.
 */
export function ReactionBurst({
  eventId,
  momentId,
  tally,
  isHostVariant,
  participantId,
  momentStatus,
  onClose,
}: Props) {
  const reducedMotion = useReducedMotion();
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const lastFireRef = useRef<Record<string, number>>({});

  const totalReactions = Object.values(tally).reduce((a, b) => a + b, 0);
  const isClosed = momentStatus === "CLOSED";

  const addFloater = useCallback((emoji: string) => {
    if (reducedMotion) return;
    const id = `${Date.now()}-${Math.random()}`;
    const left = 50 + (Math.random() - 0.5) * 240;

    setFloaters((prev) => {
      const next = [...prev, { id, emoji, left }];
      return next.length > MAX_FLOATERS ? next.slice(next.length - MAX_FLOATERS) : next;
    });

    setTimeout(() => {
      setFloaters((prev) => prev.filter((f) => f.id !== id));
    }, 1300);
  }, [reducedMotion]);

  const handleReact = useCallback(async (emoji: string): Promise<void> => {
    if (!participantId || isClosed) return;

    const now = Date.now();
    const last = lastFireRef.current[emoji] ?? 0;
    if (now - last < DEBOUNCE_MS) return;
    lastFireRef.current[emoji] = now;

    addFloater(emoji);

    try {
      await submitReaction({ eventId, momentId, participantId, emoji });
    } catch {
      // silent — reaction is best-effort
    }
  }, [participantId, isClosed, eventId, momentId, addFloater]);

  if (isHostVariant) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              letterSpacing: "var(--tracking-widest)",
              color: isClosed ? "var(--color-text-tertiary)" : "var(--color-status-live)",
              textTransform: "uppercase",
            }}
          >
            {isClosed ? "CLOSED" : "REACTIONS · LIVE"}
          </span>
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="tabular-nums"
            style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}
          >
            {totalReactions.toLocaleString()} total
          </span>
        </div>

        {/* Burst visualization */}
        <div
          aria-hidden="true"
          style={{
            position: "relative",
            height: "200px",
            overflow: "hidden",
            background: "var(--color-surface-recessed)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          {floaters.map((f) => (
            <span
              key={f.id}
              className="emoji-floater"
              style={{ left: `${f.left}px` }}
              aria-hidden="true"
            >
              {f.emoji}
            </span>
          ))}
        </div>

        {/* Aggregate counts */}
        <div
          style={{
            display: "flex",
            gap: "var(--space-4)",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {config.EMOJI_PALETTE.map((emoji) => {
            const count = tally[emoji] ?? 0;
            return (
              <div
                key={emoji}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  minWidth: "3rem",
                }}
              >
                <span style={{ fontSize: "1.75rem" }} aria-hidden="true">{emoji}</span>
                <span
                  className="tabular-nums"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {count.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>

        {onClose && !isClosed && (
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid var(--color-status-error)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-status-error)",
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-sm)",
              fontWeight: "var(--weight-medium)",
              padding: "var(--space-3) var(--space-6)",
              cursor: "pointer",
              alignSelf: "flex-start",
              minHeight: "var(--touch-target-min)",
            }}
          >
            Close moment
          </button>
        )}
      </div>
    );
  }

  // Audience variant — 3x2 grid of emoji buttons
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)", alignItems: "center" }}>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-xl)",
          fontWeight: "var(--weight-semibold)",
          color: "var(--color-text-audience-primary)",
          textAlign: "center",
        }}
      >
        React!
      </h2>
      <p style={{ color: "var(--color-text-audience-secondary)", fontSize: "var(--text-sm)", margin: 0 }}>
        Tap any emoji to react. Tap as much as you want.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "var(--space-4)",
          width: "100%",
          maxWidth: "280px",
        }}
      >
        {config.EMOJI_PALETTE.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => void handleReact(emoji)}
            disabled={isClosed}
            aria-label={`React with ${emoji}`}
            style={{
              background: "var(--color-surface-audience)",
              border: "1.5px solid var(--color-border-audience)",
              borderRadius: "var(--radius-full)",
              width: "80px",
              height: "80px",
              fontSize: "2rem",
              cursor: isClosed ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: `transform var(--duration-fast) var(--ease-spring), border-color var(--duration-fast)`,
              boxShadow: "var(--shadow-audience-sm)",
            }}
            onMouseEnter={(e) => {
              if (!isClosed) {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.borderColor = "var(--color-accent-audience)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.borderColor = "var(--color-border-audience)";
            }}
            onMouseDown={(e) => {
              if (!reducedMotion) e.currentTarget.style.transform = "scale(1.15)";
            }}
            onMouseUp={(e) => {
              if (!reducedMotion) {
                e.currentTarget.style.transform = "scale(1)";
              }
            }}
          >
            {emoji}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: "var(--space-4)",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {config.EMOJI_PALETTE.map((emoji) => {
          const count = tally[emoji] ?? 0;
          return count > 0 ? (
            <span
              key={emoji}
              role="status"
              aria-live="polite"
              className="tabular-nums"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                color: "var(--color-text-audience-secondary)",
              }}
            >
              {emoji} {count}
            </span>
          ) : null;
        })}
      </div>
    </div>
  );
}
