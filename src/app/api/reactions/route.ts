/**
 * POST /api/reactions — Submit an emoji reaction.
 *
 * Reactions are unlimited per audience member (F-02.3.2).
 * Writes an ephemeral REACTION# item + increments a durable counter shard.
 * F-02.3, AP-13.
 *
 * Identity: participantId is derived from the signed `pulse_pt_<eventId>`
 * cookie set at /api/join, NOT from the request body (F-02 / SC-identity).
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { ReactionSchema, okResponse, errorResponse } from "@/lib/validation/schemas";
import { getEventById, getMomentById, recordReaction } from "@/lib/dynamo/repository";
import {
  checkRateLimitKeyed,
  rateLimitKey,
  getClientIp,
  WRITE_LIMIT,
} from "@/lib/ratelimit";
import { log } from "@/lib/observability/log";
import { verifyParticipant, participantCookieName } from "@/lib/auth/participant";

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(errorResponse("VALIDATION", "Invalid JSON body"), {
      status: 400,
    });
  }

  const parsed = ReactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      errorResponse("VALIDATION", parsed.error.issues[0]?.message ?? "Validation failed"),
      { status: 400 }
    );
  }

  const { eventId, momentId, emoji } = parsed.data;

  // Derive authoritative participantId from the signed cookie, NOT the body.
  const cookieStore = await cookies();
  const cookieName = participantCookieName(eventId);
  const cookieValue = cookieStore.get(cookieName)?.value;
  const participantId = verifyParticipant(eventId, cookieValue);

  if (!participantId) {
    return NextResponse.json(
      errorResponse("UNAUTHORIZED", "Valid participant session required. Please re-join the event."),
      { status: 401 }
    );
  }

  // F-02 / F-06: IP + eventId scoped rate limit for all reaction writes.
  const ip = getClientIp(req);
  if (!checkRateLimitKeyed(rateLimitKey(ip, eventId), WRITE_LIMIT)) {
    return NextResponse.json(
      errorResponse("RATE_LIMITED", "Too many requests"),
      { status: 429 }
    );
  }

  try {
    const [event, moment] = await Promise.all([
      getEventById(eventId),
      getMomentById(eventId, momentId),
    ]);

    if (!event || event.status !== "ACTIVE") {
      return NextResponse.json(
        errorResponse("EVENT_CLOSED", "Event is not active"),
        { status: 410 }
      );
    }
    if (!moment || moment.status !== "ACTIVE") {
      return NextResponse.json(
        errorResponse("EVENT_CLOSED", "Moment is not active"),
        { status: 410 }
      );
    }

    const reactionId = nanoid(8);
    await recordReaction({ eventId, momentId, participantId, emoji, reactionId });

    return NextResponse.json(okResponse({ accepted: true }));
  } catch (err) {
    log.error("reaction failed", {
      eventId,
      momentId,
      errorType: (err as Error).name,
    });
    return NextResponse.json(
      errorResponse("INTERNAL", "Failed to submit reaction"),
      { status: 500 }
    );
  }
}
