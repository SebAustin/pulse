/**
 * POST /api/join — Join an event by code.
 *
 * Resolves code -> event, issues participantId, registers participant.
 * Auth: none (audience endpoint).
 * PLAN §4, F-01.3, F-01.5.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { JoinSchema, okResponse, errorResponse } from "@/lib/validation/schemas";
import {
  getEventByCode,
  registerParticipant,
} from "@/lib/dynamo/repository";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { log } from "@/lib/observability/log";

export async function POST(req: Request): Promise<NextResponse> {
  // Rate limiting
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      errorResponse("RATE_LIMITED", "Too many requests — please slow down"),
      { status: 429 }
    );
  }

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

    return NextResponse.json(
      okResponse({
        eventId: event.eventId,
        participantId,
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
