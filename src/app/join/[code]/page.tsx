import { JoinForm } from "@/components/join/JoinForm";

type Props = {
  params: Promise<{ code: string }>;
};

/**
 * /join/[code] — Pre-filled join screen (from QR or shareable link).
 * DESIGN §3, §4.3.
 */
export default async function JoinWithCodePage({ params }: Props) {
  const { code } = await params;
  const upperCode = code.toUpperCase();

  return (
    <main
      id="main-content"
      className="audience-surface"
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "var(--space-6)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-8)",
        }}
      >
        {/* Pulse wordmark */}
        <header style={{ textAlign: "center" }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-2xl)",
              fontWeight: "var(--weight-bold)",
              color: "var(--color-text-audience-primary)",
              letterSpacing: "var(--tracking-tight)",
            }}
          >
            Pulse
          </span>
          <div
            style={{
              margin: "var(--space-2) auto 0",
              width: "2rem",
              height: "2px",
              background: "var(--color-accent-audience)",
              borderRadius: "var(--radius-full)",
            }}
            aria-hidden="true"
          />
        </header>

        <JoinForm prefillCode={upperCode} />
      </div>
    </main>
  );
}
