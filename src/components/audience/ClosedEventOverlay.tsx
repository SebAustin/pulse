/**
 * ClosedEventOverlay — shown when the host ends the event.
 * DESIGN §4.15. Full-screen terminal state overlay.
 */
type Props = {
  eventTitle: string;
};

export function ClosedEventOverlay({ eventTitle }: Props) {
  return (
    <div
      className="closed-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--color-bg-audience)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-8)",
        gap: "var(--space-6)",
        zIndex: 50,
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "var(--text-base)",
          color: "var(--color-text-audience-secondary)",
          textAlign: "center",
        }}
      >
        Thanks for being part of
      </p>

      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-3xl)",
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
          width: "4rem",
          height: "2px",
          background: "var(--color-accent-audience)",
          borderRadius: "var(--radius-full)",
        }}
        aria-hidden="true"
      />

      <p
        style={{
          color: "var(--color-text-audience-secondary)",
          fontSize: "var(--text-sm)",
          textAlign: "center",
        }}
      >
        The host has ended this session.
      </p>
    </div>
  );
}
