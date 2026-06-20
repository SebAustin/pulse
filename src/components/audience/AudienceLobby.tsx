/**
 * AudienceLobby — idle state shown while no moment is active.
 * DESIGN §4.14.
 */
type Props = {
  eventTitle: string;
  displayName: string;
};

export function AudienceLobby({ eventTitle, displayName }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        padding: "var(--space-8)",
        gap: "var(--space-6)",
        minHeight: "60vh",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-2xl)",
          fontWeight: "var(--weight-bold)",
          color: "var(--color-text-audience-primary)",
          textAlign: "center",
          lineHeight: "var(--leading-snug)",
        }}
      >
        {eventTitle}
      </h1>

      <div
        style={{
          width: "3rem",
          height: "1px",
          background: "var(--color-border-audience)",
        }}
        aria-hidden="true"
      />

      <p
        style={{
          color: "var(--color-text-audience-secondary)",
          fontSize: "var(--text-base)",
          textAlign: "center",
        }}
      >
        Waiting for something to start…
      </p>

      {/* Three-dot pulse */}
      <div
        aria-hidden="true"
        style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}
      >
        <span
          className="dot-pulse-1"
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "var(--radius-full)",
            background: "var(--color-accent-audience)",
            display: "inline-block",
          }}
        />
        <span
          className="dot-pulse-2"
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "var(--radius-full)",
            background: "var(--color-accent-audience)",
            display: "inline-block",
          }}
        />
        <span
          className="dot-pulse-3"
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "var(--radius-full)",
            background: "var(--color-accent-audience)",
            display: "inline-block",
          }}
        />
      </div>

      {/* Screen reader text */}
      <p className="sr-only" aria-live="polite">
        Waiting for something to start.
      </p>

      <p
        style={{
          fontSize: "var(--text-sm)",
          color: "var(--color-text-audience-secondary)",
          marginTop: "auto",
        }}
      >
        Hi, {displayName}
      </p>
    </div>
  );
}
