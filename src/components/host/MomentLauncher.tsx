"use client";

import { useState } from "react";
import type { LaunchMomentPayload } from "@/lib/api/client";
import { launchMoment } from "@/lib/api/client";
import { config } from "@/lib/config";

type Props = {
  eventId: string;
  hostToken: string;
  participantCount: number;
  onMomentLaunched: () => void;
};

type MomentType = "MC" | "WORDCLOUD" | "REACTION" | "TRIVIA";

/**
 * MomentLauncher — host console center panel when no moment is active.
 * DESIGN §4.6 / §4.7.
 */
export function MomentLauncher({ eventId, hostToken, participantCount, onMomentLaunched }: Props) {
  const [selected, setSelected] = useState<MomentType | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll state
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);

  // Word cloud state
  const [wcPrompt, setWcPrompt] = useState("");

  // Trivia state
  const [triviaQuestion, setTriviaQuestion] = useState("");
  const [triviaOptions, setTriviaOptions] = useState(["", ""]);
  const [triviaCorrectIndex, setTriviaCorrectIndex] = useState(0);
  const [triviaTimeLimit, setTriviaTimeLimit] = useState(30);

  async function handleLaunch() {
    setError(null);
    if (!selected) return;

    let payload: LaunchMomentPayload;

    if (selected === "MC") {
      const q = pollQuestion.trim();
      if (!q) { setError("Please enter a question."); return; }
      const opts = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) { setError("Please add at least 2 options."); return; }
      payload = { momentType: "MC", question: q, options: opts };
    } else if (selected === "WORDCLOUD") {
      const p = wcPrompt.trim();
      if (!p) { setError("Please enter a prompt."); return; }
      payload = { momentType: "WORDCLOUD", prompt: p };
    } else if (selected === "REACTION") {
      payload = { momentType: "REACTION" };
    } else {
      // TRIVIA
      const q = triviaQuestion.trim();
      if (!q) { setError("Please enter a question."); return; }
      const opts = triviaOptions.map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) { setError("Please add at least 2 options."); return; }
      if (triviaCorrectIndex >= opts.length) { setError("Please select a valid correct answer."); return; }
      payload = {
        momentType: "TRIVIA",
        question: q,
        options: opts,
        correctIndex: triviaCorrectIndex,
        timeLimitSec: triviaTimeLimit,
      };
    }

    setLaunching(true);
    try {
      const res = await launchMoment(eventId, hostToken, payload);
      if (!res.ok) {
        setError(res.error?.message ?? "Failed to launch moment. Try again.");
        return;
      }
      // Reset form
      setSelected(null);
      setPollQuestion(""); setPollOptions(["", ""]);
      setWcPrompt("");
      setTriviaQuestion(""); setTriviaOptions(["", ""]); setTriviaCorrectIndex(0);
      onMomentLaunched();
    } catch {
      setError("Failed to launch moment. Check your connection and try again.");
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      {/* Empty state banner if no participants */}
      {participantCount === 0 && (
        <div
          style={{
            background: "var(--color-accent-primary-subtle)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-4)",
            fontSize: "var(--text-sm)",
            color: "var(--color-text-secondary)",
          }}
        >
          Waiting for your first audience member. Share the code to get started.
        </div>
      )}

      {!selected ? (
        <MomentTypePicker onSelect={setSelected} />
      ) : (
        <MomentConfigForm
          type={selected}
          onBack={() => { setSelected(null); setError(null); }}
          onLaunch={handleLaunch}
          launching={launching}
          error={error}
          // Poll
          pollQuestion={pollQuestion} setPollQuestion={setPollQuestion}
          pollOptions={pollOptions} setPollOptions={setPollOptions}
          // Word cloud
          wcPrompt={wcPrompt} setWcPrompt={setWcPrompt}
          // Trivia
          triviaQuestion={triviaQuestion} setTriviaQuestion={setTriviaQuestion}
          triviaOptions={triviaOptions} setTriviaOptions={setTriviaOptions}
          triviaCorrectIndex={triviaCorrectIndex} setTriviaCorrectIndex={setTriviaCorrectIndex}
          triviaTimeLimit={triviaTimeLimit} setTriviaTimeLimit={setTriviaTimeLimit}
        />
      )}
    </div>
  );
}

function MomentTypePicker({ onSelect }: { onSelect: (t: MomentType) => void }) {
  const cards: { type: MomentType; label: string; icon: string; desc: string }[] = [
    { type: "MC", label: "Poll", icon: "≡", desc: "Multiple choice question" },
    { type: "WORDCLOUD", label: "Word Cloud", icon: "☁", desc: "Collect free-text responses" },
    { type: "REACTION", label: "Emoji Reactions", icon: "🔥", desc: "Emoji burst from audience" },
    { type: "TRIVIA", label: "Trivia", icon: "⏱", desc: "Timed quiz with leaderboard" },
  ];

  return (
    <div>
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-2xl)",
          fontWeight: "var(--weight-bold)",
          color: "var(--color-text-primary)",
          marginBottom: "var(--space-2)",
          lineHeight: "var(--leading-tight)",
        }}
      >
        Ready to engage?
      </h2>
      <p
        style={{
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-sm)",
          marginBottom: "var(--space-6)",
        }}
      >
        Choose what to launch next for your audience.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "var(--space-4)",
        }}
      >
        {cards.map((card) => (
          <button
            key={card.type}
            type="button"
            onClick={() => onSelect(card.type)}
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: "var(--radius-lg)",
              padding: "var(--space-6)",
              cursor: "pointer",
              textAlign: "left",
              transition: `border-color var(--duration-fast), background var(--duration-fast), box-shadow var(--duration-fast)`,
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              minHeight: "140px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--color-accent-primary)";
              e.currentTarget.style.background = "var(--color-surface-elevated)";
              e.currentTarget.style.boxShadow = "var(--shadow-glow-sm)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--color-border-subtle)";
              e.currentTarget.style.background = "var(--color-surface-raised)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <span
              aria-hidden="true"
              style={{ fontSize: "1.5rem", lineHeight: 1 }}
            >
              {card.icon}
            </span>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--text-base)",
                fontWeight: "var(--weight-semibold)",
                color: "var(--color-text-primary)",
              }}
            >
              {card.label}
            </span>
            <span
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--color-text-tertiary)",
              }}
            >
              {card.desc}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

type ConfigFormProps = {
  type: MomentType;
  onBack: () => void;
  onLaunch: () => void;
  launching: boolean;
  error: string | null;
  pollQuestion: string; setPollQuestion: (v: string) => void;
  pollOptions: string[]; setPollOptions: (v: string[]) => void;
  wcPrompt: string; setWcPrompt: (v: string) => void;
  triviaQuestion: string; setTriviaQuestion: (v: string) => void;
  triviaOptions: string[]; setTriviaOptions: (v: string[]) => void;
  triviaCorrectIndex: number; setTriviaCorrectIndex: (v: number) => void;
  triviaTimeLimit: number; setTriviaTimeLimit: (v: number) => void;
};

function MomentConfigForm({
  type, onBack, onLaunch, launching, error,
  pollQuestion, setPollQuestion, pollOptions, setPollOptions,
  wcPrompt, setWcPrompt,
  triviaQuestion, setTriviaQuestion, triviaOptions, setTriviaOptions,
  triviaCorrectIndex, setTriviaCorrectIndex, triviaTimeLimit, setTriviaTimeLimit,
}: ConfigFormProps) {
  const typeLabels: Record<MomentType, string> = {
    MC: "Poll",
    WORDCLOUD: "Word Cloud",
    REACTION: "Emoji Reactions",
    TRIVIA: "Trivia",
  };

  return (
    <div
      className="moment-drawer"
      style={{
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-6)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-5)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-secondary)",
            fontSize: "var(--text-sm)",
            padding: 0,
            minWidth: "var(--touch-target-min)",
            minHeight: "var(--touch-target-min)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Back to moment type selection"
        >
          ← Back
        </button>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-xl)",
            fontWeight: "var(--weight-bold)",
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          {typeLabels[type]}
        </h2>
      </div>

      {type === "MC" && (
        <PollConfig
          question={pollQuestion} setQuestion={setPollQuestion}
          options={pollOptions} setOptions={setPollOptions}
        />
      )}
      {type === "WORDCLOUD" && (
        <WordCloudConfig prompt={wcPrompt} setPrompt={setWcPrompt} />
      )}
      {type === "REACTION" && <ReactionConfig />}
      {type === "TRIVIA" && (
        <TriviaConfig
          question={triviaQuestion} setQuestion={setTriviaQuestion}
          options={triviaOptions} setOptions={setTriviaOptions}
          correctIndex={triviaCorrectIndex} setCorrectIndex={setTriviaCorrectIndex}
          timeLimit={triviaTimeLimit} setTimeLimit={setTriviaTimeLimit}
        />
      )}

      {error && (
        <p role="alert" style={{ color: "var(--color-status-error)", fontSize: "var(--text-sm)", margin: 0 }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onLaunch}
        disabled={launching}
        style={{
          background: "var(--color-accent-primary)",
          color: "oklch(98% 0.004 270)",
          border: "none",
          borderRadius: "var(--radius-md)",
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-base)",
          fontWeight: "var(--weight-semibold)",
          padding: "var(--space-4) var(--space-8)",
          cursor: launching ? "wait" : "pointer",
          opacity: launching ? 0.7 : 1,
          minHeight: "var(--touch-target-audience)",
          letterSpacing: "var(--tracking-wide)",
          transition: `opacity var(--duration-fast)`,
          boxShadow: "var(--shadow-glow-sm)",
        }}
      >
        {launching ? "Launching…" : `Launch ${typeLabels[type]}`}
      </button>
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--color-surface-recessed)",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-md)",
    color: "var(--color-text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: "var(--text-sm)",
    padding: "var(--space-3) var(--space-4)",
    width: "100%",
    minHeight: "var(--touch-target-min)",
    outline: "none",
  };
}

function PollConfig({
  question, setQuestion, options, setOptions,
}: {
  question: string; setQuestion: (v: string) => void;
  options: string[]; setOptions: (v: string[]) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <FormField label="Question" required>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What would you like to ask?"
          maxLength={200}
          rows={3}
          style={{ ...inputStyle(), resize: "vertical" }}
        />
      </FormField>

      {options.map((opt, i) => (
        <div key={i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <FormField label={`Option ${i + 1}`}>
            <input
              type="text"
              value={opt}
              onChange={(e) => {
                const next = [...options];
                next[i] = e.target.value;
                setOptions(next);
              }}
              maxLength={80}
              style={inputStyle()}
            />
          </FormField>
          {i >= 2 && (
            <button
              type="button"
              onClick={() => setOptions(options.filter((_, j) => j !== i))}
              aria-label={`Remove option ${i + 1}`}
              style={{
                background: "none",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-status-error)",
                cursor: "pointer",
                padding: "var(--space-2)",
                marginTop: "var(--space-5)",
                minWidth: "var(--touch-target-min)",
                minHeight: "var(--touch-target-min)",
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}

      {options.length < 6 && (
        <button
          type="button"
          onClick={() => setOptions([...options, ""])}
          style={{
            background: "none",
            border: "1px dashed var(--color-border-default)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-accent-primary)",
            cursor: "pointer",
            padding: "var(--space-3)",
            fontSize: "var(--text-sm)",
            minHeight: "var(--touch-target-min)",
          }}
        >
          + Add option
        </button>
      )}
    </div>
  );
}

function WordCloudConfig({ prompt, setPrompt }: { prompt: string; setPrompt: (v: string) => void }) {
  return (
    <FormField label="Prompt" required>
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="What comes to mind when you think of…"
        maxLength={120}
        style={inputStyle()}
      />
    </FormField>
  );
}

function ReactionConfig() {
  return (
    <div>
      <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)", margin: 0 }}>
        The audience can react freely with these emoji:
      </p>
      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)", flexWrap: "wrap" }}>
        {config.EMOJI_PALETTE.map((e) => (
          <span key={e} style={{ fontSize: "1.75rem" }}>
            {e}
          </span>
        ))}
      </div>
    </div>
  );
}

function TriviaConfig({
  question, setQuestion, options, setOptions,
  correctIndex, setCorrectIndex, timeLimit, setTimeLimit,
}: {
  question: string; setQuestion: (v: string) => void;
  options: string[]; setOptions: (v: string[]) => void;
  correctIndex: number; setCorrectIndex: (v: number) => void;
  timeLimit: number; setTimeLimit: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <FormField label="Question" required>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What is the maximum size of a DynamoDB item?"
          maxLength={200}
          rows={3}
          style={{ ...inputStyle(), resize: "vertical" }}
        />
      </FormField>

      {options.map((opt, i) => (
        <div key={i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <input
            type="radio"
            name="trivia-correct"
            checked={correctIndex === i}
            onChange={() => setCorrectIndex(i)}
            id={`trivia-opt-${i}`}
            style={{ accentColor: "var(--color-accent-primary)", flexShrink: 0 }}
          />
          <FormField label={`Option ${i + 1}${correctIndex === i ? " ✓ (correct)" : ""}`}>
            <input
              type="text"
              value={opt}
              onChange={(e) => {
                const next = [...options];
                next[i] = e.target.value;
                setOptions(next);
              }}
              maxLength={80}
              style={inputStyle()}
            />
          </FormField>
          {i >= 2 && (
            <button
              type="button"
              onClick={() => {
                const next = options.filter((_, j) => j !== i);
                setOptions(next);
                if (correctIndex >= next.length) setCorrectIndex(next.length - 1);
              }}
              aria-label={`Remove option ${i + 1}`}
              style={{
                background: "none",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-status-error)",
                cursor: "pointer",
                padding: "var(--space-2)",
                marginTop: "var(--space-5)",
                minWidth: "var(--touch-target-min)",
                minHeight: "var(--touch-target-min)",
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}

      {options.length < 6 && (
        <button
          type="button"
          onClick={() => setOptions([...options, ""])}
          style={{
            background: "none",
            border: "1px dashed var(--color-border-default)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-accent-primary)",
            cursor: "pointer",
            padding: "var(--space-3)",
            fontSize: "var(--text-sm)",
            minHeight: "var(--touch-target-min)",
          }}
        >
          + Add option
        </button>
      )}

      <FormField label="Time limit">
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          {[10, 20, 30, 60].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTimeLimit(s)}
              style={{
                background: timeLimit === s ? "var(--color-accent-primary)" : "var(--color-surface-elevated)",
                color: timeLimit === s ? "white" : "var(--color-text-secondary)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-2) var(--space-3)",
                cursor: "pointer",
                fontSize: "var(--text-sm)",
                fontFamily: "var(--font-mono)",
                minWidth: "var(--touch-target-min)",
                minHeight: "var(--touch-target-min)",
              }}
            >
              {s}s
            </button>
          ))}
        </div>
      </FormField>
    </div>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", flex: 1 }}>
      <label
        style={{
          fontSize: "var(--text-xs)",
          color: "var(--color-text-secondary)",
          fontWeight: "var(--weight-medium)",
          letterSpacing: "var(--tracking-wide)",
          textTransform: "uppercase",
        }}
      >
        {label}
        {required && (
          <span aria-hidden="true" style={{ color: "var(--color-status-error)", marginLeft: "2px" }}>
            *
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
