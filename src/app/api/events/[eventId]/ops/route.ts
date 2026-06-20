/**
 * GET /api/events/[eventId]/ops — Ops readout (host-token-gated).
 *
 * Returns live writes/s, participant count, SSE subscriber count, shard dots.
 * Powers the OpsReadout component (PLAN §4.4, DESIGN §4.5).
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { okResponse, errorResponse } from "@/lib/validation/schemas";
import { verifyToken, extractHostToken } from "@/lib/auth/hostToken";
import { getEventById, getOpsStats } from "@/lib/dynamo/repository";
import { log } from "@/lib/observability/log";

type Params = { params: Promise<{ eventId: string }> };

export async function GET(
  req: Request,
  { params }: Params
): Promise<NextResponse> {
  const { eventId } = await params;

  // Host token from header or query param
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

    // Graceful partial failure: return what we have, null for missing fields
    try {
      const stats = await getOpsStats(eventId);
      return NextResponse.json(okResponse(stats));
    } catch (statsErr) {
      log.warn("getOpsStats partial failure", {
        eventId,
        errorType: (statsErr as Error).name,
      });
      // Degrade gracefully
      return NextResponse.json(
        okResponse({
          participantCount: null,
          sseSubscriberCount: null,
          recentWriteRatePerSec: null,
          shardWritesRecent: null,
        })
      );
    }
  } catch (err) {
    log.error("ops endpoint failed", { eventId, errorType: (err as Error).name });
    return NextResponse.json(
      errorResponse("INTERNAL", "Failed to read ops stats"),
      { status: 500 }
    );
  }
}
