/**
 * POST /api/reactions — Submit an emoji reaction.
 *
 * Reactions are unlimited per audience member (F-02.3.2).
 * Writes an ephemeral REACTION# item + increments a durable counter shard.
 * F-02.3, AP-13.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { ReactionSchema, okResponse, errorResponse } from "@/lib/validation/schemas";
import { getEventById, getMomentById, recordReaction } from "@/lib/dynamo/repository";
import {
  checkRateLimitKeyed,
  rateLimitKey,
  getClientIp,
  WRITE_LIMIT,
} from "@/lib/ratelimit";
import { log } from "@/lib/observability/log";

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

  const { eventId, momentId, participantId, emoji } = parsed.data;

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
