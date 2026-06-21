/**
 * Zod schemas for every API request body and response shape.
 * Exported types are inferred from the schemas for end-to-end type safety.
 *
 * Validates at route boundaries (NFR-03.6).
 */

import { z } from "zod";
import { config } from "../config";

// ---------------------------------------------------------------------------
// Common field validators
// ---------------------------------------------------------------------------

const eventTitle = z
  .string()
  .trim()
  .min(1, "Event title is required")
  .max(120, "Event title must be 120 characters or fewer");

const displayName = z
  .string()
  .trim()
  .min(1, "Display name is required")
  .max(32, "Display names must be 32 characters or fewer");

const joinCode = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(z.string().length(6, "Join code must be exactly 6 characters"));

const eventId = z.string().min(1);
const momentId = z.string().min(1);
const participantId = z.string().min(1);

const pollOption = z
  .string()
  .trim()
  .min(1)
  .max(80, "Option must be 80 characters or fewer");

const pollOptions = z
  .array(pollOption)
  .min(2, "Minimum 2 options required")
  .max(6, "Maximum 6 options allowed");

// ---------------------------------------------------------------------------
// Event schemas
// ---------------------------------------------------------------------------

export const CreateEventSchema = z.object({
  title: eventTitle,
});
export type CreateEventRequest = z.infer<typeof CreateEventSchema>;

export const CreateEventResponseSchema = z.object({
  eventId: z.string(),
  code: z.string(),
  joinUrl: z.string(),
  hostUrl: z.string(),
  hostToken: z.string(),
});
export type CreateEventResponse = z.infer<typeof CreateEventResponseSchema>;

export const CloseEventSchema = z.object({
  action: z.literal("close"),
  // hostToken in the body is optional — the server prefers the httpOnly
  // `pulse_host_<eventId>` cookie set by Edge middleware (F-01 fix).
  // Kept optional for CLI/test callers that still pass it in the body.
  hostToken: z.string().optional(),
});
export type CloseEventRequest = z.infer<typeof CloseEventSchema>;

// ---------------------------------------------------------------------------
// Join schema
// ---------------------------------------------------------------------------

export const JoinSchema = z.object({
  code: joinCode,
  displayName,
});
export type JoinRequest = z.infer<typeof JoinSchema>;

export const JoinResponseSchema = z.object({
  eventId: z.string(),
  participantId: z.string(),
  code: z.string(),
  title: z.string(),
  status: z.enum(["ACTIVE", "CLOSED"]),
});
export type JoinResponse = z.infer<typeof JoinResponseSchema>;

// ---------------------------------------------------------------------------
// Moment schemas (discriminated union)
// ---------------------------------------------------------------------------

const BaseMomentSchema = z.object({
  eventId,
  // hostToken in the body is optional — the server prefers the httpOnly
  // `pulse_host_<eventId>` cookie set by Edge middleware (F-01 fix).
  // Kept optional for CLI/test callers that still pass it in the body.
  hostToken: z.string().optional(),
});

const McMomentSchema = BaseMomentSchema.extend({
  momentType: z.literal("MC"),
  question: z
    .string()
    .trim()
    .min(1)
    .max(200, "Question must be 200 characters or fewer"),
  options: pollOptions,
});

const WordCloudMomentSchema = BaseMomentSchema.extend({
  momentType: z.literal("WORDCLOUD"),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(120, "Prompt must be 120 characters or fewer"),
});

const ReactionMomentSchema = BaseMomentSchema.extend({
  momentType: z.literal("REACTION"),
});

const TriviaMomentSchema = BaseMomentSchema.extend({
  momentType: z.literal("TRIVIA"),
  question: z
    .string()
    .trim()
    .min(1)
    .max(200, "Question must be 200 characters or fewer"),
  options: pollOptions,
  correctIndex: z
    .number()
    .int()
    .min(0, "correctIndex must be >= 0"),
  timeLimitSec: z
    .number()
    .int()
    .min(10, "Time limit must be at least 10 seconds")
    .max(60, "Time limit must be at most 60 seconds"),
});

export const LaunchMomentSchema = z.discriminatedUnion("momentType", [
  McMomentSchema,
  WordCloudMomentSchema,
  ReactionMomentSchema,
  TriviaMomentSchema,
]);
export type LaunchMomentRequest = z.infer<typeof LaunchMomentSchema>;

export const CloseMomentSchema = z.object({
  action: z.literal("close"),
  // hostToken in the body is optional — the server prefers the httpOnly
  // `pulse_host_<eventId>` cookie set by Edge middleware (F-01 fix).
  // Kept optional for CLI/test callers that still pass it in the body.
  hostToken: z.string().optional(),
});
export type CloseMomentRequest = z.infer<typeof CloseMomentSchema>;

// ---------------------------------------------------------------------------
// Interaction schemas
// ---------------------------------------------------------------------------

export const VoteSchema = z.object({
  eventId,
  momentId,
  // participantId in the body is accepted for backwards compatibility but is
  // IGNORED for identity purposes — the server derives identity from the
  // signed `pulse_pt_<eventId>` cookie (F-02 / SC-identity).
  participantId: participantId.optional(),
  option: z.string().min(1).max(80),
  // F-03: displayName is optional for MC votes but required for trivia
  // leaderboard entries.  Validate here so the raw body value is never
  // trusted — length-bounded and charset-safe via the shared validator.
  // Routes that do not use displayName simply ignore the parsed field.
  displayName: displayName.optional(),
});
export type VoteRequest = z.infer<typeof VoteSchema>;

export const ReactionSchema = z.object({
  eventId,
  momentId,
  // participantId in the body is ignored for identity; cookie is authoritative
  // (F-02 / SC-identity).
  participantId: participantId.optional(),
  emoji: z.string().refine(
    (e) => (config.EMOJI_PALETTE as readonly string[]).includes(e),
    { message: "emoji must be one of the allowed palette" }
  ),
});
export type ReactionRequest = z.infer<typeof ReactionSchema>;

export const WordSchema = z.object({
  eventId,
  momentId,
  // participantId in the body is ignored for identity; cookie is authoritative
  // (F-02 / SC-identity).
  participantId: participantId.optional(),
  word: z
    .string()
    .trim()
    .min(1)
    .max(40, "Word must be 40 characters or fewer"),
});
export type WordRequest = z.infer<typeof WordSchema>;

// ---------------------------------------------------------------------------
// Leaderboard query schema
// ---------------------------------------------------------------------------

export const LeaderboardQuerySchema = z.object({
  eventId,
  n: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 10))
    .pipe(z.number().int().min(1).max(100)),
});
export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>;

// ---------------------------------------------------------------------------
// Summary / ops query schemas (host-token-gated)
// ---------------------------------------------------------------------------

export const SummaryQuerySchema = z.object({
  hostToken: z.string().min(1),
});
export type SummaryQuery = z.infer<typeof SummaryQuerySchema>;

// ---------------------------------------------------------------------------
// AI schemas (stretch)
// ---------------------------------------------------------------------------

export const PollSuggestionsSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(1)
    .max(200, "Topic must be 200 characters or fewer"),
  hostToken: z.string(),
  eventId,
});
export type PollSuggestionsRequest = z.infer<typeof PollSuggestionsSchema>;

export const SentimentSchema = z.object({
  eventId,
  momentId,
  hostToken: z.string(),
});
export type SentimentRequest = z.infer<typeof SentimentSchema>;

// ---------------------------------------------------------------------------
// API response envelope
// ---------------------------------------------------------------------------

/**
 * Consistent response wrapper per PLAN §4 and common patterns.
 */
export interface ApiResponse<T = undefined> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

export function okResponse<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

export function errorResponse(
  code: string,
  message: string
): ApiResponse<never> {
  return { ok: false, error: { code, message } };
}
