/**
 * POST /api/events — Create a new event.
 *
 * Auth: none (public endpoint).
 * Returns: { eventId, code, joinUrl, hostUrl, hostToken }
 *
 * Join code is generated using a CSPRNG over an unambiguous alphabet
 * (no I/O/0/1 to avoid visual confusion). Uniqueness is enforced by a
 * conditional Put on the CODE# item; on collision, the code is regenerated
 * up to MAX_CODE_RETRIES times before returning 500 (F-01 / FIX-2).
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { nanoid, customAlphabet } from "nanoid";
import { CreateEventSchema, okResponse, errorResponse } from "@/lib/validation/schemas";
import { generateHostToken, hashToken } from "@/lib/auth/hostToken";
import { createEvent } from "@/lib/dynamo/repository";
import { log } from "@/lib/observability/log";

/**
 * Unambiguous alphabet for join codes — excludes visually confusing characters:
 * I (looks like 1), O (looks like 0), 0 (looks like O), 1 (looks like I/l).
 * 32 symbols -> 32^6 ≈ 1 billion distinct 6-character codes.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generateCode = customAlphabet(CODE_ALPHABET, 6);

/** Maximum retry attempts when a code collision is detected at write time. */
const MAX_CODE_RETRIES = 5;

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
  const hostToken = generateHostToken();
  const hostTokenHash = hashToken(hostToken);

  // Retry loop: generate a fresh CSPRNG code on each attempt.
  // The repository's createEvent enforces attribute_not_exists(pk) on the
  // CODE# item, so a collision throws ConditionalCheckFailedException which
  // we catch here to try a new code.
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    const code = generateCode();

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
      const errName = (err as Error).name;
      // ConditionalCheckFailedException means the CODE# item already exists.
      // TransactionCanceledException wraps it inside a transaction.
      if (
        errName === "ConditionalCheckFailedException" ||
        (errName === "TransactionCanceledException" &&
          (err as { CancellationReasons?: Array<{ Code?: string }> })
            .CancellationReasons?.some((r) => r.Code === "ConditionalCheckFailed"))
      ) {
        log.error("createEvent: code collision, retrying", {
          attempt,
          errorType: errName,
        });
        lastError = err;
        continue;
      }
      // Any other error is not retryable
      log.error("createEvent failed", { errorType: errName });
      return NextResponse.json(
        errorResponse("INTERNAL", "Failed to create event"),
        { status: 500 }
      );
    }
  }

  log.error("createEvent: exceeded max code retries", {
    errorType: (lastError as Error)?.name,
  });
  return NextResponse.json(
    errorResponse("INTERNAL", "Failed to generate a unique event code. Please try again."),
    { status: 500 }
  );
}
