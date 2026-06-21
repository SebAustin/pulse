/**
 * POST /api/join — Join an event by code.
 *
 * Resolves code -> event, issues participantId, registers participant.
 * Sets an httpOnly signed cookie `pulse_pt_<eventId>` that binds the
 * participant identity to this specific event. Subsequent writes (votes,
 * reactions, words) derive participantId from the cookie — never from the
 * request body — preventing ballot stuffing via rotating client-supplied IDs.
 *
 * Auth: none (audience endpoint).
 * PLAN §4, F-01.3, F-01.5, F-02 / SC-identity.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { JoinSchema, okResponse, errorResponse } from "@/lib/validation/schemas";
import {
  getEventByCode,
  registerParticipant,
} from "@/lib/dynamo/repository";
import {
  checkRateLimitKeyed,
  rateLimitKey,
  getClientIp,
  JOIN_LIMIT,
} from "@/lib/ratelimit";
import { log } from "@/lib/observability/log";
import { signParticipant, participantCookieName } from "@/lib/auth/participant";

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(errorResponse("VALIDATION", "Invalid JSON body"), {
      status: 400,
    });
  }

  const parsed = JoinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      errorResponse("VALIDATION", parsed.error.issues[0]?.message ?? "Validation failed"),
      { status: 400 }
    );
  }

  const { code, displayName } = parsed.data;

  // F-02 / F-06: Rate limit join attempts per IP per join-code.
  // True Sybil resistance requires account binding; this raises the cost.
  const ip = getClientIp(req);
  if (!checkRateLimitKeyed(rateLimitKey(ip, code), JOIN_LIMIT)) {
    return NextResponse.json(
      errorResponse("RATE_LIMITED", "Too many join attempts — please slow down"),
      { status: 429 }
    );
  }

  try {
    const event = await getEventByCode(code);
    if (!event) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", "That code doesn't match an active event. It may have ended, or there might be a typo."),
        { status: 404 }
      );
    }

    if (event.status === "CLOSED") {
      return NextResponse.json(
        errorResponse("EVENT_CLOSED", "This event has ended."),
        { status: 410 }
      );
    }

    const participantId = `u_${nanoid(12)}`;
    await registerParticipant({ eventId: event.eventId, participantId, displayName });

    // Issue a signed identity cookie bound to this specific event.
    // httpOnly prevents JS from reading the secret; sameSite=lax prevents
    // CSRF while still sending the cookie on top-level navigation.
    // secure=true is enforced in production to prevent cleartext transmission.
    const cookieName = participantCookieName(event.eventId);
    const cookieValue = signParticipant(event.eventId, participantId);
    // `Secure` tracks the actual request scheme, not NODE_ENV: a prod build over
    // plain HTTP (local `npm start` / CI e2e) must not set a Secure cookie the
    // browser drops. Vercel serves HTTPS (x-forwarded-proto=https) so it is Secure there.
    const isHttps =
      req.headers.get("x-forwarded-proto") === "https" ||
      req.url.startsWith("https:");

    const cookieStore = await cookies();
    cookieStore.set(cookieName, cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: isHttps,
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return NextResponse.json(
      okResponse({
        eventId: event.eventId,
        participantId, // returned for UI display state in sessionStorage; not trusted for writes
        code: event.code,
        title: event.title,
        status: event.status,
      }),
      { status: 201 }
    );
  } catch (err) {
    log.error("join failed", { errorType: (err as Error).name });
    return NextResponse.json(
      errorResponse("INTERNAL", "Failed to join event"),
      { status: 500 }
    );
  }
}
