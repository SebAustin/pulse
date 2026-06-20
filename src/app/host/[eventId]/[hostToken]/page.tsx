import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { HostConsole } from "./HostConsole";

type Props = {
  params: Promise<{ eventId: string; hostToken: string }>;
};

/**
 * /host/[eventId]/[hostToken] — Host console (server wrapper).
 * DESIGN §3 — dark control-room broadcast surface.
 *
 * Fetches event metadata server-side so the Client Component gets
 * eventTitle and code without an extra round-trip.
 */
export default async function HostPage({ params }: Props) {
  const { eventId, hostToken } = await params;

  // Build the base URL from the incoming request headers
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const baseUrl = `${proto}://${host}`;

  let eventTitle = "Event";
  let code = "";

  try {
    const res = await fetch(`${baseUrl}/api/events/${eventId}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      notFound();
    }

    const json = (await res.json()) as {
      ok: boolean;
      data?: { title: string; code: string; status: string };
    };

    if (!json.ok || !json.data) {
      notFound();
    }

    eventTitle = json.data.title;
    code = json.data.code;
  } catch {
    // On fetch error in dev (e.g. DB not started), show console with defaults
    // rather than hard crashing — HostConsole degrades gracefully.
  }

  return (
    <HostConsole
      eventId={eventId}
      hostToken={hostToken}
      eventTitle={eventTitle}
      code={code}
    />
  );
}
