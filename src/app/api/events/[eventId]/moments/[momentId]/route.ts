/**
 * POST /api/events/[eventId]/moments/[momentId] — Close a moment (host-gated).
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { CloseMomentSchema, okResponse, errorResponse } from "@/lib/validation/schemas";
import { verifyToken } from "@/lib/auth/hostToken";
import { getEventById, closeMoment } from "@/lib/dynamo/repository";
import { evictCachedSnapshot } from "@/lib/sse/snapshot-cache";
import { log } from "@/lib/observability/log";

type Params = { params: Promise<{ eventId: string; momentId: string }> };

export async function POST(
  req: Request,
  { params }: Params
): Promise<NextResponse> {
  const { eventId, momentId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(errorResponse("VALIDATION", "Invalid JSON body"), {
      status: 400,
    });
  }

  const parsed = CloseMomentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      errorResponse("VALIDATION", parsed.error.issues[0]?.message ?? "Validation failed"),
      { status: 400 }
    );
  }

  const { hostToken } = parsed.data;

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

    const moment = await closeMoment(eventId, momentId);
    evictCachedSnapshot(eventId);

    return NextResponse.json(
      okResponse({ momentId: moment.momentId, status: moment.status })
    );
  } catch (err) {
    log.error("closeMoment failed", {
      eventId,
      momentId,
      errorType: (err as Error).name,
    });
    return NextResponse.json(
      errorResponse("INTERNAL", "Failed to close moment"),
      { status: 500 }
    );
  }
}
