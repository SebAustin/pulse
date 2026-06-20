"use client";

import { useState, useMemo } from "react";
import type { WordCount } from "@/lib/dynamo/types";
import { submitWord } from "@/lib/api/client";
import { useReducedMotion } from "@/hooks/useReducedMotion";

type Props = {
  eventId: string;
  momentId: string;
  prompt: string;
  words: WordCount[];
  isHostVariant: boolean;
  participantId?: string;
  momentStatus: "ACTIVE" | "CLOSED";
  onClose?: () => void;
};

const COLORS = [
  "var(--color-accent-primary)",
  "var(--color-accent-secondary)",
  "var(--color-accent-tertiary)",
  "var(--color-status-live)",
];

/**
 * WordCloud component — host shows the live cloud; audience shows input + mini cloud.
 * DESIGN §4.9. Deterministic layout, no physics — words placed using a simple grid.
 */
export function WordCloud({
  eventId,
  momentId,
  prompt,
  words,
  isHostVariant,
  participantId,
  momentStatus,
  onClose,
}: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [word, setWord] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const reducedMotion = useReducedMotion();

  const isClosed = momentStatus === "CLOSED";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = word.trim();
    if (!trimmed || !participantId || submitted) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await submitWord({ eventId, momentId, participantId, word: trimmed });
      if (!res.ok) {
        if (res.error?.code === "DUPLICATE") {
          setSubmitted(true);
          return;
        }
        setError(res.error?.message ?? "Couldn't submit your response. Try again.");
        return;
      }
      setSubmitted(true);
      setConfirmation(true);
      setWord("");
      setTimeout(() => setConfirmation(false), 2000);
    } catch {
      setError("Couldn't submit your response. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
      {isHostVariant && (
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
            {isClosed ? "CLOSED" : "WORD CLOUD · LIVE"}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
            {words.length} responses
          </span>
        </div>
      )}

      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: isHostVariant ? "var(--text-xl)" : "var(--text-lg)",
          fontWeight: "var(--weight-semibold)",
          color: isHostVariant ? "var(--color-text-primary)" : "var(--color-text-audience-primary)",
          lineHeight: "var(--leading-snug)",
        }}
      >
        {prompt}
      </h2>

      {/* Audience input */}
      {!isHostVariant && !isClosed && (
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: "var(--space-3)" }}>
          <input
            type="text"
            value={word}
            onChange={(e) => setWord(e.target.value.slice(0, 40))}
            placeholder="One word…"
            disabled={submitted || submitting || isClosed}
            maxLength={40}
            style={{
              flex: 1,
              background: "white",
              border: "1.5px solid var(--color-border-audience)",
              borderRadius: "var(--radius-md)",
              color: "var(--color-text-audience-primary)",
              fontSize: "var(--text-base)",
              padding: "var(--space-4)",
              minHeight: "var(--touch-target-audience)",
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={submitted || submitting || !word.trim()}
            style={{
              background: "var(--color-accent-audience)",
              color: "white",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontWeight: "var(--weight-semibold)",
              padding: "var(--space-4) var(--space-6)",
              cursor: submitted || submitting ? "default" : "pointer",
              opacity: submitted || !word.trim() ? 0.6 : 1,
              minHeight: "var(--touch-target-audience)",
              whiteSpace: "nowrap",
            }}
          >
            {submitting ? "…" : submitted ? "Added!" : "Submit"}
          </button>
        </form>
      )}

      {confirmation && (
        <p style={{ color: "var(--color-status-success)", fontSize: "var(--text-sm)", margin: 0 }}>
          Added!
        </p>
      )}

      {error && (
        <p role="alert" style={{ color: "var(--color-status-error)", fontSize: "var(--text-sm)", margin: 0 }}>
          {error}
        </p>
      )}

      {/* Word cloud visualization */}
      <WordCloudViz words={words} reducedMotion={reducedMotion} isHostVariant={isHostVariant} />

      {/* Screen-reader accessible word list */}
      <ul
        role="list"
        className="sr-only"
        aria-live="polite"
        aria-label="Top words in cloud"
      >
        {words.slice(0, 10).map((w) => (
          <li key={w.word}>
            {w.word}: {w.count} {w.count === 1 ? "response" : "responses"}
          </li>
        ))}
      </ul>

      {isHostVariant && onClose && !isClosed && (
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

function WordCloudViz({
  words,
  reducedMotion,
  isHostVariant,
}: {
  words: WordCount[];
  reducedMotion: boolean;
  isHostVariant: boolean;
}) {
  const displayWords = useMemo(() => words.slice(0, 30), [words]);
  const maxCount = Math.max(...displayWords.map((w) => w.count), 1);

  if (displayWords.length === 0) {
    return (
      <div
        aria-hidden="true"
        style={{
          height: isHostVariant ? "200px" : "120px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: isHostVariant ? "var(--color-text-tertiary)" : "var(--color-text-audience-secondary)",
          fontSize: "var(--text-sm)",
        }}
      >
        Waiting for responses…
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--space-3)",
        alignItems: "center",
        justifyContent: "center",
        minHeight: isHostVariant ? "200px" : "120px",
        padding: "var(--space-4)",
      }}
    >
      {displayWords.map((wc, i) => {
        const ratio = wc.count / maxCount;
        const fontSize = isHostVariant
          ? `clamp(0.75rem, ${0.75 + ratio * 1.5}rem, 2.25rem)`
          : `clamp(0.75rem, ${0.75 + ratio}rem, 1.5rem)`;

        const colorIndex =
          i < 3 ? 0 : i < 8 ? 1 : i < 15 ? 2 : 3;
        const color = COLORS[colorIndex];

        return (
          <span
            key={wc.word}
            className="word-entry"
            style={{
              fontSize,
              color,
              fontFamily: "var(--font-display)",
              fontWeight: ratio > 0.7 ? "var(--weight-bold)" : "var(--weight-medium)",
              lineHeight: 1.2,
              userSelect: "none",
              ...(reducedMotion ? {} : {}),
            }}
          >
            {wc.word}
          </span>
        );
      })}
    </div>
  );
}
