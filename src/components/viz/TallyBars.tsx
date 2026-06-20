"use client";

import { useEffect, useRef, useState } from "react";
import type { Tally } from "@/lib/dynamo/types";
import { useReducedMotion } from "@/hooks/useReducedMotion";

type Props = {
  tally: Tally;
  options: readonly string[];
  totalVotes: number;
  isHostVariant?: boolean;
};

/**
 * TallyBars — animated horizontal poll bars.
 * DESIGN §4.8. Uses scaleX transform on an inner element (compositor-friendly).
 * Host variant: compact with count + percentage labels.
 * Audience variant: lighter, result-overlay style.
 */
export function TallyBars({ tally, options, totalVotes, isHostVariant = false }: Props) {
  const reducedMotion = useReducedMotion();

  const maxVotes = Math.max(...options.map((o) => tally[o] ?? 0), 1);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: isHostVariant ? "var(--space-3)" : "var(--space-4)" }}
    >
      {options.map((option, i) => {
        const count = tally[option] ?? 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isLeading = count === maxVotes && count > 0;
        const fraction = maxVotes > 0 ? count / maxVotes : 0;

        return (
          <BarRow
            key={option}
            label={option}
            count={count}
            pct={pct}
            fraction={fraction}
            isLeading={isLeading}
            reducedMotion={reducedMotion}
            isHostVariant={isHostVariant}
            rank={i}
          />
        );
      })}

      {/* Accessible live region for screen readers */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {totalVotes} total votes.{" "}
        {options.map((o) => `${o}: ${tally[o] ?? 0} votes`).join(", ")}
      </div>
    </div>
  );
}

type BarRowProps = {
  label: string;
  count: number;
  pct: number;
  fraction: number;
  isLeading: boolean;
  reducedMotion: boolean;
  isHostVariant: boolean;
  rank: number;
};

function BarRow({ label, count, pct, fraction, isLeading, reducedMotion, isHostVariant, rank }: BarRowProps) {
  // JS tween for count number
  const [displayCount, setDisplayCount] = useState(count);
  const animRef = useRef<number | null>(null);
  const prevCountRef = useRef(count);

  useEffect(() => {
    if (reducedMotion) {
      // Intentional: syncing count to display immediately when motion is disabled.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayCount(count);
      return;
    }

    const start = prevCountRef.current;
    const end = count;
    prevCountRef.current = count;

    if (start === end) return;

    const DURATION = 220;
    const startTime = performance.now();

    const animate = (now: number): void => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / DURATION, 1);
      setDisplayCount(Math.round(start + (end - start) * progress));

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, [count, reducedMotion]);

  const fillColor = isLeading
    ? "var(--poll-bar-fill-lead)"
    : rank === 1
    ? "var(--poll-bar-fill-other)"
    : "var(--color-surface-elevated)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontSize: "var(--text-sm)",
            color: isLeading
              ? "var(--color-text-primary)"
              : "var(--color-text-secondary)",
            fontWeight: isLeading ? "var(--weight-medium)" : "var(--weight-regular)",
          }}
        >
          {label}
        </span>
        {isHostVariant && (
          <span
            className="tabular-nums"
            aria-label={`${displayCount} votes, ${pct} percent`}
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--color-text-secondary)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {displayCount.toLocaleString()} ({pct}%)
          </span>
        )}
      </div>

      {/* Track */}
      <div
        aria-hidden="true"
        style={{
          height: "var(--poll-bar-height)",
          background: "var(--poll-bar-track-bg)",
          borderRadius: "var(--poll-bar-radius)",
          overflow: "hidden",
        }}
      >
        {/* Fill using scaleX — compositor-friendly */}
        <div
          className="poll-bar-fill"
          aria-label={`${label}: ${pct}%`}
          style={{
            height: "100%",
            width: "100%",
            transform: `scaleX(${fraction})`,
            background: fillColor,
            borderRadius: "var(--poll-bar-radius)",
            ...(reducedMotion ? { transition: "none" } : {}),
          }}
        />
      </div>

      {!isHostVariant && (
        <span
          className="tabular-nums"
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--color-text-audience-secondary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {pct}%
        </span>
      )}
    </div>
  );
}
