/**
 * GET /api/summary/[eventId] — Event analytics summary (host-token-gated).
 *
 * All counts from durable items only — never from TTL'd REACTION# items.
 * F-04.1, F-04.2, PLAN §4.2.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { okResponse, errorResponse } from "@/lib/validation/schemas";
import { verifyToken, extractHostToken } from "@/lib/auth/hostToken";
import { getEventById, getEventSummary } from "@/lib/dynamo/repository";
import { log } from "@/lib/observability/log";

type Params = { params: Promise<{ eventId: string }> };

export async function GET(
  req: Request,
  { params }: Params
): Promise<NextResponse> {
  const { eventId } = await params;

  const hostToken = extractHostToken(req);
  if (!hostToken) {
    return NextResponse.json(
      errorResponse("HOST_TOKEN_INVALID", "Host token required"),
      { status: 401 }
    );
  }

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

    const summary = await getEventSummary(eventId);
    if (!summary) {
      return NextResponse.json(errorResponse("NOT_FOUND", "Summary not found"), {
        status: 404,
      });
    }

    return NextResponse.json(okResponse(summary));
  } catch (err) {
    log.error("getEventSummary failed", {
      eventId,
      errorType: (err as Error).name,
    });
    return NextResponse.json(
      errorResponse("INTERNAL", "Failed to generate summary"),
      { status: 500 }
    );
  }
}
