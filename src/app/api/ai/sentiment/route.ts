/**
 * POST /api/ai/sentiment — Word-cloud sentiment summary (host-gated, stretch).
 *
 * Returns 503 when OPENAI_API_KEY is absent (F-05.3).
 * F-05.2.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { SentimentSchema, okResponse, errorResponse } from "@/lib/validation/schemas";
import { verifyToken } from "@/lib/auth/hostToken";
import { getEventById, getWordCounts } from "@/lib/dynamo/repository";
import { generateWordCloudSentiment, isAiEnabled } from "@/lib/ai/openai";
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

  const parsed = SentimentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      errorResponse("VALIDATION", parsed.error.issues[0]?.message ?? "Validation failed"),
      { status: 400 }
    );
  }

  const { eventId, momentId, hostToken } = parsed.data;

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

    const words = await getWordCounts(eventId, momentId);
    const wordStrings = words.slice(0, 50).map((w) => w.word);

    const summary = await generateWordCloudSentiment(wordStrings);
    if (!summary) {
      return NextResponse.json(
        errorResponse("AI_UNAVAILABLE", "AI service unavailable or no words to analyse"),
        { status: 503 }
      );
    }

    return NextResponse.json(okResponse({ summary }));
  } catch (err) {
    log.error("sentiment analysis failed", { eventId, momentId, errorType: (err as Error).name });
    return NextResponse.json(
      errorResponse("INTERNAL", "Failed to generate sentiment"),
      { status: 500 }
    );
  }
}
