"use client";

import { useState } from "react";
import type { Tally } from "@/lib/dynamo/types";
import { TallyBars } from "@/components/viz/TallyBars";
import { castVote } from "@/lib/api/client";

type Props = {
  eventId: string;
  momentId: string;
  question: string;
  options: readonly string[];
  tally: Tally;
  isHostVariant: boolean;
  participantId?: string;
  momentStatus: "ACTIVE" | "CLOSED";
  onClose?: () => void;
  hostToken?: string;
};

/**
 * McPoll — MC poll component for both host and audience.
 * DESIGN §4.8.
 */
export function McPoll({
  eventId,
  momentId,
  question,
  options,
  tally,
  isHostVariant,
  participantId,
  momentStatus,
  onClose,
}: Props) {
  const [voted, setVoted] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalVotes = Object.values(tally).reduce((a, b) => a + b, 0);
  const isClosed = momentStatus === "CLOSED";
  const hasVoted = voted !== null;
  const showResults = isHostVariant || hasVoted || isClosed;

  async function handleVote(option: string) {
    if (!participantId || voting || hasVoted || isClosed) return;
    setVoting(true);
    setError(null);

    try {
      const res = await castVote({ eventId, momentId, participantId, option });
      if (!res.ok) {
        if (res.error?.code === "DUPLICATE") {
          setVoted(option);
          return;
        }
        setError(res.error?.message ?? "Couldn't submit your vote. Try again.");
        return;
      }
      setVoted(option);
    } catch {
      setError("Couldn't submit your vote. Check your connection and try again.");
    } finally {
      setVoting(false);
    }
  }

  if (isHostVariant) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              letterSpacing: "var(--tracking-widest)",
              color: isClosed ? "var(--color-text-tertiary)" : "var(--color-status-live)",
              textTransform: "uppercase",
            }}
          >
            {isClosed ? "CLOSED" : "POLL · LIVE"}
          </span>
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="tabular-nums"
            style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}
          >
            {totalVotes.toLocaleString()} votes
          </span>
        </div>

        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-xl)",
            fontWeight: "var(--weight-semibold)",
            color: "var(--color-text-primary)",
            lineHeight: "var(--leading-snug)",
          }}
        >
          {question}
        </h2>

        <TallyBars
          tally={tally}
          options={options}
          totalVotes={totalVotes}
          isHostVariant
        />

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
              transition: `background var(--duration-fast)`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "oklch(62% 0.22 25 / 0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "none";
            }}
          >
            Close moment
          </button>
        )}
      </div>
    );
  }

  // Audience variant
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-xl)",
          fontWeight: "var(--weight-semibold)",
          color: "var(--color-text-audience-primary)",
          lineHeight: "var(--leading-snug)",
        }}
      >
        {question}
      </h2>

      {showResults ? (
        <>
          <div
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--color-text-audience-secondary)",
            }}
          >
            {hasVoted && !isClosed && "Your vote is counted."}
            {isClosed && "This poll has closed."}
            {!hasVoted && !isClosed && ""}
          </div>
          <TallyBars tally={tally} options={options} totalVotes={totalVotes} isHostVariant={false} />
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--color-text-audience-secondary)",
              textAlign: "center",
            }}
          >
            {totalVotes.toLocaleString()} responses
          </div>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => void handleVote(option)}
              disabled={voting || isClosed}
              aria-disabled={voting || isClosed}
              style={{
                background: "white",
                border: "1.5px solid var(--color-border-audience)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-text-audience-primary)",
                fontFamily: "var(--font-body)",
                fontSize: "var(--text-base)",
                fontWeight: "var(--weight-medium)",
                padding: "var(--space-4) var(--space-5)",
                cursor: voting ? "wait" : "pointer",
                textAlign: "left",
                width: "100%",
                minHeight: "var(--touch-target-audience)",
                transition: `border-color var(--duration-fast), background var(--duration-fast), transform var(--duration-instant)`,
                boxShadow: "var(--shadow-audience-sm)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--color-accent-audience)";
                e.currentTarget.style.background = "var(--color-accent-audience-subtle)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-audience)";
                e.currentTarget.style.background = "white";
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = "scale(0.97)";
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--color-status-error)", fontSize: "var(--text-sm)", margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
