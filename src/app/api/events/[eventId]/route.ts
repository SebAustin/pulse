/**
 * GET  /api/events/[eventId] — Read event state.
 * POST /api/events/[eventId] — Close event (host-gated).
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { CloseEventSchema, okResponse, errorResponse } from "@/lib/validation/schemas";
import { verifyToken, extractHostToken } from "@/lib/auth/hostToken";
import { getEventById, closeEvent } from "@/lib/dynamo/repository";
import { log } from "@/lib/observability/log";
import { evictCachedSnapshot } from "@/lib/sse/snapshot-cache";
import type { Event } from "@/lib/dynamo/types";

type Params = { params: Promise<{ eventId: string }> };

/**
 * Strip host-only fields before returning the event to any public caller.
 *
 * F-04: hostTokenHash is only needed server-side for token verification.
 * Returning it in the public API response is an unnecessary secret-material
 * exposure — the hash itself is not reversible (128-bit pre-image), but
 * there is no defence-in-depth reason to broadcast it.
 */
function toPublicEvent(event: Event): Omit<Event, "hostTokenHash"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hostTokenHash, ...publicFields } = event;
  return publicFields;
}

export async function GET(
  _req: Request,
  { params }: Params
): Promise<NextResponse> {
  const { eventId } = await params;

  try {
    const event = await getEventById(eventId);
    if (!event) {
      return NextResponse.json(errorResponse("NOT_FOUND", "Event not found"), {
        status: 404,
      });
    }
    // F-04: strip hostTokenHash from the public response.
    return NextResponse.json(okResponse(toPublicEvent(event)));
  } catch (err) {
    log.error("getEventById failed", { eventId, errorType: (err as Error).name });
    return NextResponse.json(errorResponse("INTERNAL", "Failed to read event"), {
      status: 500,
    });
  }
}

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

  const parsed = CloseEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      errorResponse("VALIDATION", parsed.error.issues[0]?.message ?? "Validation failed"),
      { status: 400 }
    );
  }

  // Authorize host
  const hostToken = parsed.data.hostToken ?? extractHostToken(req);
  if (!hostToken) {
    return NextResponse.json(errorResponse("HOST_TOKEN_INVALID", "Host token required"), {
      status: 401,
    });
  }

  try {
    const event = await getEventById(eventId);
    if (!event) {
      return NextResponse.json(errorResponse("NOT_FOUND", "Event not found"), {
        status: 404,
      });
    }

    if (!verifyToken(hostToken, event.hostTokenHash ?? "")) {
      return NextResponse.json(
        errorResponse("HOST_TOKEN_INVALID", "Invalid host token"),
        { status: 401 }
      );
    }

    if (event.status === "CLOSED") {
      return NextResponse.json(okResponse({ status: "CLOSED" }));
    }

    const closed = await closeEvent(eventId);
    evictCachedSnapshot(eventId);

    return NextResponse.json(okResponse({ status: closed.status }));
  } catch (err) {
    log.error("closeEvent failed", { eventId, errorType: (err as Error).name });
    return NextResponse.json(errorResponse("INTERNAL", "Failed to close event"), {
      status: 500,
    });
  }
}
