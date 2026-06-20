"use client";

import { useOpsReadout } from "@/hooks/useOpsReadout";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { config } from "@/lib/config";

type Props = {
  eventId: string;
  hostToken: string;
};

/**
 * OpsReadout — prestige component showing live DynamoDB write-sharding behavior.
 * DESIGN §4.5. Polls /api/events/[eventId]/ops every ~1s.
 * Degrades gracefully (shows "—") on fetch failure.
 */
export function OpsReadout({ eventId, hostToken }: Props) {
  const stats = useOpsReadout(eventId, hostToken);
  const reducedMotion = useReducedMotion();
  const SHARD_COUNT = config.SHARD_COUNT;

  const writeRate = stats?.recentWriteRatePerSec ?? null;
  const shards = stats?.shardWritesRecent ?? null;

  // Max writes/s for the bar — treat 2000 as the scale ceiling
  const MAX_WRITES = 2000;
  const barFillPct = writeRate !== null ? Math.min((writeRate / MAX_WRITES) * 100, 100) : 0;

  return (
    <div
      style={{
        background: "var(--color-surface-recessed)",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "var(--radius-md)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-xs)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "var(--space-2) var(--space-4)",
          borderBottom: "1px solid var(--color-border-subtle)",
          color: "var(--color-status-live)",
          letterSpacing: "var(--tracking-widest)",
          fontWeight: "var(--weight-medium)",
          fontSize: "var(--text-xs)",
        }}
      >
        LIVE OPS
      </div>

      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        {/* Writes/s row */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "var(--space-1)",
            }}
          >
            <span style={{ color: "var(--color-text-secondary)" }}>Writes/s</span>
            <span
              className="tabular-nums"
              style={{
                color: "var(--color-accent-primary)",
                fontWeight: "var(--weight-medium)",
              }}
            >
              {writeRate !== null ? writeRate.toLocaleString() : "—"}
            </span>
          </div>
          {/* Bar */}
          <div
            aria-hidden="true"
            style={{
              height: "4px",
              background: "var(--color-surface-elevated)",
              borderRadius: "var(--radius-full)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${barFillPct}%`,
                background: "var(--color-accent-primary)",
                borderRadius: "var(--radius-full)",
                transition: reducedMotion ? "none" : `width var(--duration-normal)`,
              }}
            />
          </div>
        </div>

        {/* Shard dots */}
        <div>
          <div style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-1)" }}>
            Shards
          </div>
          <div
            aria-label={`${SHARD_COUNT} write shards`}
            style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}
          >
            {Array.from({ length: SHARD_COUNT }, (_, i) => {
              const isActive = shards !== null && (shards[i] ?? 0) > 0;
              return (
                <span
                  key={i}
                  aria-hidden="true"
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "var(--radius-full)",
                    background: isActive
                      ? "var(--color-accent-primary)"
                      : "var(--color-surface-elevated)",
                    boxShadow: isActive && !reducedMotion
                      ? "var(--shadow-glow-sm)"
                      : "none",
                    transition: reducedMotion
                      ? "none"
                      : `background var(--duration-fast), box-shadow var(--duration-fast)`,
                  }}
                />
              );
            })}
            <span style={{ color: "var(--color-text-tertiary)", marginLeft: "var(--space-1)" }}>
              {SHARD_COUNT}
            </span>
          </div>
        </div>

        {/* Participant count */}
        <MetricRow
          label="Participants"
          value={stats?.participantCount ?? null}
        />

        {/* SSE connections */}
        <MetricRow
          label="SSE connections"
          value={stats?.sseSubscriberCount ?? null}
        />
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span
        className="tabular-nums"
        style={{
          color: "var(--color-accent-primary)",
          fontWeight: "var(--weight-medium)",
        }}
      >
        {value !== null ? value.toLocaleString() : "—"}
      </span>
    </div>
  );
}
