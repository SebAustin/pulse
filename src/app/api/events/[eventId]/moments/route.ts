/**
 * POST /api/events/[eventId]/moments — Launch a moment (host-gated).
 *
 * Sets activatedAt server-side for server-authoritative trivia timing.
 * PLAN §4.1, §4.5.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { LaunchMomentSchema, okResponse, errorResponse } from "@/lib/validation/schemas";
import { verifyToken } from "@/lib/auth/hostToken";
import { getEventById, launchMoment, getActiveMoment } from "@/lib/dynamo/repository";
import { log } from "@/lib/observability/log";

type Params = { params: Promise<{ eventId: string }> };

export async function POST(
  req: Request,
  { params }: Params
): Promise<NextResponse> {
  const { eventId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(errorResponse("VALIDATION", "Invalid JSON body"), {
      status: 400,
    });
  }

  const parsed = LaunchMomentSchema.safeParse({ ...body as object, eventId });
  if (!parsed.success) {
    return NextResponse.json(
      errorResponse("VALIDATION", parsed.error.issues[0]?.message ?? "Validation failed"),
      { status: 400 }
    );
  }

  const { hostToken, momentType } = parsed.data;

  try {
    const event = await getEventById(eventId);
    if (!event) {
      return NextResponse.json(errorResponse("NOT_FOUND", "Event not found"), {
        status: 404,
      });
    }

    if (!verifyToken(hostToken, event.hostTokenHash)) {
      return NextResponse.json(
        errorResponse("HOST_TOKEN_INVALID", "Invalid host token"),
        { status: 401 }
      );
    }

    if (event.status !== "ACTIVE") {
      return NextResponse.json(
        errorResponse("EVENT_CLOSED", "Event is not active"),
        { status: 410 }
      );
    }

    // Enforce one active moment per event (A-21)
    const existing = await getActiveMoment(eventId);
    if (existing && existing.status === "ACTIVE") {
      return NextResponse.json(
        errorResponse("VALIDATION", "An active moment already exists — close it first"),
        { status: 409 }
      );
    }

    const momentId = `m_${nanoid(8)}`;
    const data = parsed.data;

    const moment = await launchMoment({
      eventId,
      momentId,
      momentType,
      question: "question" in data ? data.question : undefined,
      options: "options" in data ? data.options as string[] : undefined,
      prompt: "prompt" in data ? data.prompt : undefined,
      correctIndex: "correctIndex" in data ? data.correctIndex : undefined,
      timeLimitSec: "timeLimitSec" in data ? data.timeLimitSec : undefined,
    });

    return NextResponse.json(
      okResponse({
        momentId: moment.momentId,
        momentType: moment.momentType,
        status: moment.status,
        activatedAt: moment.activatedAt,
      }),
      { status: 201 }
    );
  } catch (err) {
    log.error("launchMoment failed", {
      eventId,
      errorType: (err as Error).name,
    });
    return NextResponse.json(
      errorResponse("INTERNAL", "Failed to launch moment"),
      { status: 500 }
    );
  }
}
