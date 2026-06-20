/**
 * GET /api/leaderboard?eventId=...&n=10 — Top-N leaderboard via GSI2.
 *
 * No Scan — uses ScanIndexForward=false, Limit=N on GSI2.
 * F-02.4.3, SC6, AP-18.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { LeaderboardQuerySchema, okResponse, errorResponse } from "@/lib/validation/schemas";
import { getLeaderboardTopN } from "@/lib/dynamo/repository";
import { log } from "@/lib/observability/log";

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const queryParams = {
    eventId: url.searchParams.get("eventId") ?? "",
    n: url.searchParams.get("n") ?? "10",
  };

  const parsed = LeaderboardQuerySchema.safeParse(queryParams);
  if (!parsed.success) {
    return NextResponse.json(
      errorResponse("VALIDATION", parsed.error.issues[0]?.message ?? "Validation failed"),
      { status: 400 }
    );
  }

  const { eventId, n } = parsed.data;

  try {
    const entries = await getLeaderboardTopN(eventId, n);
    return NextResponse.json(okResponse({ entries }));
  } catch (err) {
    log.error("leaderboard query failed", {
      eventId,
      errorType: (err as Error).name,
    });
    return NextResponse.json(
      errorResponse("INTERNAL", "Failed to fetch leaderboard"),
      { status: 500 }
    );
  }
}
