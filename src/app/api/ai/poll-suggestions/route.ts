/**
 * POST /api/ai/poll-suggestions — Suggest poll questions (host-gated, stretch).
 *
 * Returns 503 when OPENAI_API_KEY is absent (F-05.3).
 * F-05.1.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PollSuggestionsSchema, okResponse, errorResponse } from "@/lib/validation/schemas";
import { verifyToken } from "@/lib/auth/hostToken";
import { getEventById } from "@/lib/dynamo/repository";
import { suggestPollQuestions, isAiEnabled } from "@/lib/ai/openai";
import { log } from "@/lib/observability/log";

export async function POST(req: Request): Promise<NextResponse> {
  if (!isAiEnabled()) {
    return NextResponse.json(
      errorResponse("AI_UNAVAILABLE", "AI features are not configured"),
      { status: 503 }
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

  const parsed = PollSuggestionsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      errorResponse("VALIDATION", parsed.error.issues[0]?.message ?? "Validation failed"),
      { status: 400 }
    );
  }

  const { eventId, hostToken, topic } = parsed.data;

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

    const suggestions = await suggestPollQuestions(topic);
    if (!suggestions) {
      return NextResponse.json(
        errorResponse("AI_UNAVAILABLE", "AI service unavailable"),
        { status: 503 }
      );
    }

    return NextResponse.json(okResponse({ suggestions }));
  } catch (err) {
    log.error("poll-suggestions failed", { eventId, errorType: (err as Error).name });
    return NextResponse.json(
      errorResponse("INTERNAL", "Failed to generate suggestions"),
      { status: 500 }
    );
  }
}
