/**
 * POST /api/votes — Cast an MC or trivia vote.
 *
 * Hero flow: atomic dedup + counter increment in one TransactWriteItems.
 * PLAN §7.1 (MC), §7.3 (trivia), F-02.1.2, F-02.4.2, SC3, SC4.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { VoteSchema, okResponse, errorResponse } from "@/lib/validation/schemas";
import {
  getEventById,
  getMomentById,
  recordVote,
  recordTriviaAnswer,
} from "@/lib/dynamo/repository";
import { computeTriviaScore, isTriviaAnswerTimely } from "@/lib/moment/scoring";
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

  const parsed = VoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      errorResponse("VALIDATION", parsed.error.issues[0]?.message ?? "Validation failed"),
      { status: 400 }
    );
  }

  const { eventId, momentId, participantId, option, displayName } = parsed.data;

  // F-02 / F-06: IP + eventId scoped rate limit for all vote writes.
  const ip = getClientIp(req);
  if (!checkRateLimitKeyed(rateLimitKey(ip, eventId), WRITE_LIMIT)) {
    return NextResponse.json(
      errorResponse("RATE_LIMITED", "Too many requests"),
      { status: 429 }
    );
  }
  const serverReceiveTs = Date.now();

  try {
    const [event, moment] = await Promise.all([
      getEventById(eventId),
      getMomentById(eventId, momentId),
    ]);

    if (!event) {
      return NextResponse.json(errorResponse("NOT_FOUND", "Event not found"), {
        status: 404,
      });
    }
    if (event.status !== "ACTIVE") {
      return NextResponse.json(
        errorResponse("EVENT_CLOSED", "This event has ended."),
        { status: 410 }
      );
    }
    if (!moment) {
      return NextResponse.json(
        errorResponse("NOT_FOUND", "Moment not found"),
        { status: 404 }
      );
    }
    if (moment.status !== "ACTIVE") {
      return NextResponse.json(
        errorResponse("EVENT_CLOSED", "This moment has already closed."),
        { status: 410 }
      );
    }

    // Validate option is in the allowed set
    if (moment.options && !moment.options.includes(option)) {
      return NextResponse.json(
        errorResponse("VALIDATION", "Invalid option"),
        { status: 400 }
      );
    }

    // ---------- TRIVIA path ----------
    if (moment.momentType === "TRIVIA") {
      const { correctIndex, timeLimitSec = 30, activatedAt = 0 } = moment;

      // Reject answers arriving too late (beyond grace period)
      if (!isTriviaAnswerTimely(activatedAt, serverReceiveTs, timeLimitSec)) {
        return NextResponse.json(
          errorResponse("EVENT_CLOSED", "Time's up! Answer arrived after the grace period."),
          { status: 410 }
        );
      }

      const isCorrect =
        correctIndex !== undefined &&
        moment.options !== undefined &&
        moment.options.indexOf(option) === correctIndex;

      const awarded = computeTriviaScore(
        activatedAt,
        serverReceiveTs,
        timeLimitSec,
        isCorrect
      );

      // F-03: displayName is now validated through VoteSchema (max 32 chars,
      // non-empty).  We read it from parsed.data, never from the raw body,
      // so no attacker-controlled string can bypass the zod validation.
      const triviaDisplayName = displayName ?? "Unknown";

      const result = await recordTriviaAnswer({
        eventId,
        momentId,
        participantId,
        displayName: triviaDisplayName,
        option,
        awarded,
      });

      if (!result.accepted) {
        return NextResponse.json(
          errorResponse("DUPLICATE", "You've already answered this trivia question."),
          { status: 409 }
        );
      }

      return NextResponse.json(
        okResponse({ accepted: true, awarded: result.awarded, newScore: result.newScore })
      );
    }

    // ---------- MC poll path ----------
    const accepted = await recordVote({
      eventId,
      momentId,
      participantId,
      option,
    });

    if (!accepted) {
      return NextResponse.json(
        errorResponse("DUPLICATE", "You've already voted in this poll."),
        { status: 409 }
      );
    }

    return NextResponse.json(okResponse({ accepted: true }));
  } catch (err) {
    log.error("vote failed", {
      eventId,
      momentId,
      errorType: (err as Error).name,
    });
    return NextResponse.json(
      errorResponse("INTERNAL", "Couldn't submit your vote. Check your connection and try again."),
      { status: 500 }
    );
  }
}
