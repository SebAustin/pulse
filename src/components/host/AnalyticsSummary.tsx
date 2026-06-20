"use client";

import type { EventSummary } from "@/lib/dynamo/types";

type Props = {
  summary: EventSummary;
  eventId: string;
  hostToken: string;
};

/**
 * AnalyticsSummary — post-event analytics display.
 * DESIGN §4.14 — stat cards + word cloud results.
 * Rendered client-side so future real-time re-fetching is easy to add.
 */
export function AnalyticsSummary({ summary }: Props) {
  const stats: Array<{ label: string; value: string | number; sub?: string }> = [
    {
      label: "Unique Participants",
      value: summary.uniqueParticipants.toLocaleString(),
    },
    {
      label: "Total Interactions",
      value: summary.totalInteractions.toLocaleString(),
    },
    {
      label: "Peak Concurrent",
      value: summary.peakConcurrent.toLocaleString(),
      sub: "simultaneous connections",
    },
    {
      label: "Moments Launched",
      value: summary.momentsLaunched,
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-10)",
      }}
    >
      {/* Status pill */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            letterSpacing: "var(--tracking-widest)",
            textTransform: "uppercase",
            padding: "2px var(--space-3)",
            borderRadius: "var(--radius-full)",
            background:
              summary.status === "CLOSED"
                ? "oklch(22% 0.05 25)"
                : "oklch(20% 0.08 150)",
            color:
              summary.status === "CLOSED"
                ? "var(--color-status-error)"
                : "var(--color-accent-secondary)",
            border: `1px solid ${
              summary.status === "CLOSED"
                ? "var(--color-status-error)"
                : "var(--color-accent-secondary)"
            }`,
          }}
        >
          {summary.status === "CLOSED" ? "Event Ended" : "Live"}
        </span>
      </div>

      {/* Stats grid */}
      <section aria-label="Event statistics">
        <h2
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            color: "var(--color-text-tertiary)",
            letterSpacing: "var(--tracking-widest)",
            textTransform: "uppercase",
            marginBottom: "var(--space-4)",
          }}
        >
          Overview
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "var(--space-4)",
          }}
        >
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
      </section>

      {/* Word clouds */}
      {summary.wordClouds.length > 0 && (
        <section aria-label="Word cloud results">
          <h2
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              color: "var(--color-text-tertiary)",
              letterSpacing: "var(--tracking-widest)",
              textTransform: "uppercase",
              marginBottom: "var(--space-5)",
            }}
          >
            Word Cloud Results
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            {summary.wordClouds.map((wc) => (
              <WordCloudResult key={wc.momentId} prompt={wc.prompt} top5={wc.top5} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div
      style={{
        background: "var(--color-surface-recessed)",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-5)",
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
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-3xl, 2rem)",
          fontWeight: "var(--weight-bold)",
          color: "var(--color-accent-primary)",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-xs)",
            color: "var(--color-text-tertiary)",
            marginTop: "var(--space-1)",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function WordCloudResult({
  prompt,
  top5,
}: {
  prompt: string;
  top5: Array<{ word: string; count: number }>;
}) {
  const maxCount = Math.max(...top5.map((w) => w.count), 1);

  return (
    <div
      style={{
        background: "var(--color-surface-recessed)",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-5)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-sm)",
          fontWeight: "var(--weight-semibold)",
          color: "var(--color-text-secondary)",
          marginBottom: "var(--space-5)",
          fontStyle: "italic",
        }}
      >
        &ldquo;{prompt}&rdquo;
      </div>

      {/* Screen-reader accessible list */}
      <ul
        aria-label={`Top responses to: ${prompt}`}
        style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}
      >
        {top5.map(({ word, count }, i) => {
          const pct = Math.round((count / maxCount) * 100);
          return (
            <li key={word}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "var(--space-1)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "var(--text-sm)",
                    fontWeight: i === 0 ? "var(--weight-bold)" : "var(--weight-medium)",
                    color: i === 0 ? "var(--color-accent-primary)" : "var(--color-text-primary)",
                  }}
                >
                  {word}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  {count}
                </span>
              </div>
              {/* scaleX bar */}
              <div
                style={{
                  height: "3px",
                  background: "var(--color-border-subtle)",
                  borderRadius: "var(--radius-full)",
                  overflow: "hidden",
                }}
                aria-hidden="true"
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background:
                      i === 0
                        ? "var(--color-accent-primary)"
                        : "var(--color-text-tertiary)",
                    borderRadius: "var(--radius-full)",
                    transition: "width var(--duration-normal) var(--ease-out-expo)",
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
