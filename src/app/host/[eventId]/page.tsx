/**
 * /host/[eventId] — Tokenless host console (Server Component).
 *
 * F-01 fix: the host token has been redeemed by Edge middleware into the
 * httpOnly cookie `pulse_host_<eventId>`.  This page reads the RAW cookie
 * value, then validates the recovered token against the event's stored
 * hostTokenHash via a direct repository call (no HTTP self-fetch).
 *
 * If the cookie is absent or the token is invalid the user sees an
 * "open your host link" prompt rather than a crash.
 *
 * DESIGN §3 — dark control-room broadcast surface.
 */

import { cookies } from "next/headers";
import { HostConsole } from "@/app/host/[eventId]/HostConsole";
import { hostSessionCookieName } from "@/lib/auth/hostCookie";
import { verifyToken } from "@/lib/auth/hostToken";
import { getEventById } from "@/lib/dynamo/repository";

type Props = {
  params: Promise<{ eventId: string }>;
};

type AuthOutcome =
  | { status: "ok"; eventTitle: string; code: string }
  | { status: "unauthorized" }
  | { status: "db-error"; message: string };

async function resolveAuth(eventId: string): Promise<AuthOutcome> {
  // Read the raw host token from the httpOnly cookie.
  const cookieStore = await cookies();
  const cookieName = hostSessionCookieName(eventId);
  const rawToken = cookieStore.get(cookieName)?.value;

  if (!rawToken) return { status: "unauthorized" };

  // Authorise: compare raw token against stored hash (direct repo call, no HTTP fetch).
  try {
    const event = await getEventById(eventId);

    if (!event) return { status: "unauthorized" };
    if (!verifyToken(rawToken, event.hostTokenHash)) return { status: "unauthorized" };

    return { status: "ok", eventTitle: event.title, code: event.code };
  } catch (err) {
    // Surface real errors rather than swallowing them silently.
    const message = err instanceof Error ? err.message : String(err);
    return { status: "db-error", message };
  }
}

export default async function HostPage({ params }: Props) {
  const { eventId } = await params;
  const auth = await resolveAuth(eventId);

  if (auth.status === "unauthorized") {
    return <UnauthorizedState />;
  }

  if (auth.status === "db-error") {
    return <DatabaseErrorState message={auth.message} />;
  }

  return (
    <HostConsole
      eventId={eventId}
      eventTitle={auth.eventTitle}
      code={auth.code}
    />
  );
}

/** Shown when the host session cookie is absent or invalid. */
function UnauthorizedState() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg-host)",
        color: "var(--color-text-primary)",
        gap: "var(--space-4)",
        padding: "var(--space-8)",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-xl)",
          fontWeight: "var(--weight-semibold)",
          color: "var(--color-text-primary)",
          margin: 0,
        }}
      >
        Session expired or not found
      </h1>
      <p
        style={{
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-sm)",
          maxWidth: "40ch",
          lineHeight: "var(--leading-relaxed)",
        }}
      >
        Please open your host link again to restore your session. The link
        sets a secure cookie that authorises your console access — it is not
        stored in the URL after that first visit.
      </p>
    </div>
  );
}

/** Shown when the repository throws (e.g. DB not running). */
function DatabaseErrorState({ message }: { message: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg-host)",
        color: "var(--color-text-primary)",
        gap: "var(--space-4)",
        padding: "var(--space-8)",
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-xl)",
          fontWeight: "var(--weight-semibold)",
          color: "var(--color-status-error)",
          margin: 0,
        }}
      >
        Could not load event
      </h1>
      <p
        style={{
          color: "var(--color-text-secondary)",
          fontSize: "var(--text-sm)",
          maxWidth: "50ch",
          fontFamily: "var(--font-mono)",
        }}
      >
        {message}
      </p>
    </div>
  );
}
