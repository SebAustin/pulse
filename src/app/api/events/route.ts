/**
 * POST /api/events — Create a new event.
 *
 * Auth: none (public endpoint).
 * Returns: { eventId, code, joinUrl, hostUrl, hostToken }
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { CreateEventSchema, okResponse, errorResponse } from "@/lib/validation/schemas";
import { generateHostToken, hashToken } from "@/lib/auth/hostToken";
import { createEvent } from "@/lib/dynamo/repository";
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

  const parsed = CreateEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      errorResponse("VALIDATION", parsed.error.issues[0]?.message ?? "Validation failed"),
      { status: 400 }
    );
  }

  const { title } = parsed.data;
  const eventId = nanoid(8).toUpperCase();
  // 6-character alphanumeric join code (uppercase)
  const code = nanoid(6).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6).padEnd(6, "A");
  const hostToken = generateHostToken();
  const hostTokenHash = hashToken(hostToken);

  try {
    const event = await createEvent({ eventId, title, code, hostTokenHash });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const joinUrl = `${baseUrl}/join/${event.code}`;
    const hostUrl = `${baseUrl}/host/${event.eventId}/${hostToken}`;

    return NextResponse.json(
      okResponse({
        eventId: event.eventId,
        code: event.code,
        joinUrl,
        hostUrl,
        hostToken,
      }),
      { status: 201 }
    );
  } catch (err) {
    log.error("createEvent failed", { errorType: (err as Error).name });
    return NextResponse.json(
      errorResponse("INTERNAL", "Failed to create event"),
      { status: 500 }
    );
  }
}
