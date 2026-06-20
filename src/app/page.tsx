import { EventCreateForm } from "@/components/create/EventCreateForm";
import { JoinForm } from "@/components/join/JoinForm";

/**
 * Landing page — "/"
 * DESIGN §3 — broadcast split-screen: create event (left) / join event (right).
 * Dark control-room aesthetic with scan-line divider.
 */
export default function LandingPage() {
  return (
    <main
      id="main-content"
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        minHeight: "100vh",
      }}
    >
      {/* Left panel — Create event (host) */}
      <section
        aria-labelledby="create-heading"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "clamp(2rem, 8vw, 6rem) clamp(2rem, 5vw, 4rem)",
          borderRight: "1px solid var(--color-border-subtle)",
          gap: "var(--space-10)",
        }}
      >
        {/* Hero headline */}
        <div>
          <h1
            id="create-heading"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-hero)",
              fontWeight: "var(--weight-bold)",
              color: "var(--color-text-primary)",
              lineHeight: "var(--leading-tight)",
              letterSpacing: "var(--tracking-tight)",
              margin: 0,
            }}
          >
            Pulse
            <span
              aria-hidden="true"
              style={{
                display: "block",
                width: "3ch",
                height: "3px",
                background: "var(--color-accent-primary)",
                borderRadius: "var(--radius-full)",
                marginTop: "var(--space-3)",
              }}
            />
          </h1>
          <p
            style={{
              marginTop: "var(--space-4)",
              color: "var(--color-text-secondary)",
              fontSize: "var(--text-lg)",
              lineHeight: "var(--leading-relaxed)",
              maxWidth: "36ch",
            }}
          >
            Real-time polls, word clouds, emoji bursts, and trivia — built on
            DynamoDB write-sharded counters for million-scale events.
          </p>
        </div>

        <div style={{ maxWidth: "420px" }}>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-xl)",
              fontWeight: "var(--weight-semibold)",
              color: "var(--color-text-primary)",
              marginBottom: "var(--space-5)",
              letterSpacing: "var(--tracking-wide)",
            }}
          >
            Host an event
          </h2>
          <EventCreateForm />
        </div>
      </section>

      {/* Right panel — Join event (audience) */}
      <section
        aria-labelledby="join-heading"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "clamp(2rem, 8vw, 6rem) clamp(2rem, 5vw, 4rem)",
          background: "var(--color-surface-recessed)",
          gap: "var(--space-8)",
        }}
      >
        <div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-xs)",
              color: "var(--color-text-tertiary)",
              letterSpacing: "var(--tracking-widest)",
              textTransform: "uppercase",
              display: "block",
              marginBottom: "var(--space-3)",
            }}
          >
            Already have a code?
          </span>
          <h2
            id="join-heading"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-2xl)",
              fontWeight: "var(--weight-semibold)",
              color: "var(--color-text-primary)",
              lineHeight: "var(--leading-tight)",
              margin: 0,
            }}
          >
            Join an event
          </h2>
        </div>

        {/* Audience-surface card */}
        <div
          style={{
            background: "var(--color-bg-audience)",
            borderRadius: "var(--radius-xl)",
            padding: "var(--space-8)",
            maxWidth: "380px",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <JoinForm />
        </div>
      </section>

      {/* Mobile layout */}
      <style>{`
        @media (max-width: 767px) {
          main[id="main-content"] {
            grid-template-columns: 1fr;
          }
          main[id="main-content"] > section:first-child {
            border-right: none;
            border-bottom: 1px solid var(--color-border-subtle);
          }
        }
      `}</style>
    </main>
  );
}
