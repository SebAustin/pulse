"use client";

import { useState, useEffect, useRef } from "react";
import type { Tally, LeaderboardEntry } from "@/lib/dynamo/types";
import { castVote } from "@/lib/api/client";
import { Leaderboard } from "@/components/viz/Leaderboard";
import { useReducedMotion } from "@/hooks/useReducedMotion";

type Props = {
  eventId: string;
  momentId: string;
  question: string;
  options: readonly string[];
  tally: Tally;
  correctIndex?: number;
  timeLimitSec?: number;
  activatedAt?: number;
  leaderboard: LeaderboardEntry[];
  isHostVariant: boolean;
  participantId?: string;
  momentStatus: "ACTIVE" | "CLOSED";
  onClose?: () => void;
};

/**
 * Trivia moment — countdown driven by server activatedAt + timeLimitSec.
 * Score is server-authoritative. Client countdown is purely informational.
 * DESIGN §4.11, PLAN §4.5.
 */
export function Trivia({
  eventId,
  momentId,
  question,
  options,
  tally,
  correctIndex,
  timeLimitSec = 30,
  activatedAt,
  leaderboard,
  isHostVariant,
  participantId,
  momentStatus,
  onClose,
}: Props) {
  const reducedMotion = useReducedMotion();
  const [voted, setVoted] = useState<string | null>(null);
  const [voteResult, setVoteResult] = useState<{ awarded: number; correct: boolean } | null>(null);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeAnnounce, setTimeAnnounce] = useState<string | null>(null);

  // Countdown state (informational only)
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const has10sAlertRef = useRef(false);
  const hasExpiredAlertRef = useRef(false);

  const isClosed = momentStatus === "CLOSED";
  const totalVotes = Object.values(tally).reduce((a, b) => a + b, 0);

  useEffect(() => {
    if (!activatedAt || !timeLimitSec || isClosed) return;

    const update = (): void => {
      const elapsed = (Date.now() - activatedAt) / 1000;
      const remaining = Math.max(0, timeLimitSec - elapsed);
      setRemainingSec(Math.ceil(remaining));

      // Fire ARIA announcements at 10s and at 0s
      if (remaining <= 10 && remaining > 0 && !has10sAlertRef.current) {
        has10sAlertRef.current = true;
        setTimeAnnounce("10 seconds left!");
        setTimeout(() => setTimeAnnounce(null), 2000);
      }
      if (remaining <= 0 && !hasExpiredAlertRef.current) {
        hasExpiredAlertRef.current = true;
        setTimeAnnounce("Time's up!");
        setTimeout(() => setTimeAnnounce(null), 2000);
      }
    };

    update();
    const id = setInterval(update, 200);
    return () => clearInterval(id);
  }, [activatedAt, timeLimitSec, isClosed]);

  const timerFraction =
    remainingSec !== null && timeLimitSec > 0
      ? remainingSec / timeLimitSec
      : isClosed ? 0 : 1;

  const timerColor =
    timerFraction > 0.5
      ? "var(--color-timer-full)"
      : timerFraction > 0.25
      ? "var(--color-timer-half)"
      : "var(--color-timer-low)";

  async function handleVote(option: string) {
    if (!participantId || voting || voted !== null || isClosed) return;
    setVoting(true);
    setError(null);

    try {
      const res = await castVote({ eventId, momentId, participantId, option });
      if (!res.ok) {
        if (res.error?.code === "DUPLICATE") {
          setVoted(option);
          return;
        }
        setError(res.error?.message ?? "Couldn't submit. Try again.");
        return;
      }
      setVoted(option);
      const awarded = res.data?.awarded ?? 0;
      const isCorrect = correctIndex !== undefined && option === options[correctIndex];
      setVoteResult({ awarded, correct: isCorrect });
    } catch {
      setError("Couldn't submit. Check your connection and try again.");
    } finally {
      setVoting(false);
    }
  }

  if (isHostVariant) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              letterSpacing: "var(--tracking-widest)",
              color: isClosed ? "var(--color-text-tertiary)" : "var(--color-status-live)",
              textTransform: "uppercase",
            }}
          >
            {isClosed ? "CLOSED" : "TRIVIA · LIVE"}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            {!isClosed && remainingSec !== null && (
              <span
                role="timer"
                className="tabular-nums"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-sm)",
                  color: timerColor,
                  fontWeight: "var(--weight-semibold)",
                }}
              >
                {remainingSec}s
              </span>
            )}
            <span
              className="tabular-nums"
              style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}
            >
              {totalVotes.toLocaleString()} answers
            </span>
          </div>
        </div>

        {/* Timer bar */}
        {!isClosed && (
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
                width: "100%",
                transform: `scaleX(${timerFraction})`,
                transformOrigin: "left",
                background: timerColor,
                borderRadius: "var(--radius-full)",
                transition: reducedMotion ? "none" : `transform 200ms linear, background var(--duration-fast)`,
              }}
            />
          </div>
        )}

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

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {options.map((opt, i) => {
            const isCorrect = i === correctIndex;
            const count = tally[opt] ?? 0;
            return (
              <div
                key={opt}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  background: isCorrect
                    ? "oklch(72% 0.18 145 / 0.15)"
                    : "var(--color-surface-recessed)",
                  border: `1px solid ${isCorrect ? "var(--color-status-success)" : "transparent"}`,
                }}
              >
                <span
                  style={{
                    width: "1.25rem",
                    height: "1.25rem",
                    borderRadius: "var(--radius-full)",
                    background: isCorrect ? "var(--color-status-success)" : "var(--color-surface-elevated)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.625rem",
                    flexShrink: 0,
                    color: "white",
                  }}
                >
                  {isCorrect ? "✓" : String.fromCharCode(65 + i)}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: "var(--text-sm)",
                    color: isCorrect ? "var(--color-status-success)" : "var(--color-text-secondary)",
                  }}
                >
                  {opt}
                </span>
                <span
                  className="tabular-nums"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  {count}
                </span>
              </div>
            );
          })}
        </div>

        {leaderboard.length > 0 && (
          <Leaderboard entries={leaderboard} isHostVariant />
        )}

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

  // Audience variant
  const hasAnswered = voted !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      {/* Timer bar */}
      {!isClosed && !hasAnswered && (
        <div
          aria-hidden="true"
          style={{
            height: "6px",
            background: "var(--color-border-audience)",
            borderRadius: "var(--radius-full)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: "100%",
              transform: `scaleX(${timerFraction})`,
              transformOrigin: "left",
              background: timerColor,
              borderRadius: "var(--radius-full)",
              transition: reducedMotion ? "none" : "transform 200ms linear",
            }}
          />
        </div>
      )}

      {/* Timer ARIA announce — only at 10s and 0s */}
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
        {timeAnnounce}
      </div>

      {remainingSec !== null && !isClosed && !hasAnswered && (
        <div
          role="timer"
          className="tabular-nums"
          style={{
            textAlign: "right",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-sm)",
            color: timerColor,
          }}
        >
          {remainingSec}s
        </div>
      )}

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

      {hasAnswered && voteResult ? (
        <div
          style={{
            textAlign: "center",
            padding: "var(--space-6)",
            background: voteResult.correct ? "oklch(72% 0.18 145 / 0.1)" : "oklch(62% 0.22 25 / 0.1)",
            borderRadius: "var(--radius-lg)",
            border: `2px solid ${voteResult.correct ? "var(--color-status-success)" : "var(--color-status-error)"}`,
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "var(--space-2)" }}>
            {voteResult.correct ? "✓" : "✗"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-2xl)",
              fontWeight: "var(--weight-bold)",
              color: voteResult.correct ? "var(--color-status-success)" : "var(--color-status-error)",
            }}
          >
            {voteResult.correct ? `+${voteResult.awarded} pts` : "0 pts"}
          </div>
          <div style={{ color: "var(--color-text-audience-secondary)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
            {voteResult.correct ? "Correct!" : "Better luck next time"}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {options.map((option, i) => (
            <button
              key={option}
              type="button"
              onClick={() => void handleVote(option)}
              disabled={voting || hasAnswered || isClosed || (remainingSec !== null && remainingSec <= 0)}
              aria-disabled={voting || hasAnswered || isClosed}
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
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
                transition: `border-color var(--duration-fast), background var(--duration-fast)`,
                boxShadow: "var(--shadow-audience-sm)",
              }}
              onMouseEnter={(e) => {
                if (!voting && !hasAnswered && !isClosed) {
                  e.currentTarget.style.borderColor = "var(--color-accent-audience)";
                  e.currentTarget.style.background = "var(--color-accent-audience-subtle)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--color-border-audience)";
                e.currentTarget.style.background = "white";
              }}
            >
              <span
                style={{
                  width: "1.5rem",
                  height: "1.5rem",
                  borderRadius: "var(--radius-full)",
                  background: "var(--color-border-audience)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  flexShrink: 0,
                  fontFamily: "var(--font-mono)",
                  fontWeight: "var(--weight-bold)",
                  color: "var(--color-text-audience-secondary)",
                }}
              >
                {String.fromCharCode(65 + i)}
              </span>
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

      {isClosed && !hasAnswered && (
        <p style={{ color: "var(--color-text-audience-secondary)", fontSize: "var(--text-sm)", textAlign: "center" }}>
          This moment has closed.
        </p>
      )}

      {/* Mini leaderboard for audience */}
      {leaderboard.length > 0 && (hasAnswered || isClosed) && (
        <Leaderboard
          entries={leaderboard}
          highlightParticipantId={participantId}
          isHostVariant={false}
        />
      )}
    </div>
  );
}
