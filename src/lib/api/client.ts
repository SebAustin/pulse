/**
 * Browser-side API client for Pulse.
 *
 * Typed fetch wrappers for every endpoint defined in PLAN §4.
 * IMPORTANT: This file must never import server-only modules (no AWS SDK, no crypto).
 * It is safe to import in Client Components.
 */

import type {
  Snapshot,
  OpsStats,
  EventSummary,
  LeaderboardEntry,
} from "@/lib/dynamo/types";

// ---------------------------------------------------------------------------
// Response envelope (matches ApiResponse<T> from schemas.ts)
// ---------------------------------------------------------------------------

export interface ApiResponse<T = undefined> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
}

// ---------------------------------------------------------------------------
// Typed response shapes (mirroring route handler returns)
// ---------------------------------------------------------------------------

export interface CreateEventData {
  eventId: string;
  code: string;
  joinUrl: string;
  hostUrl: string;
  hostToken: string;
}

export interface JoinData {
  eventId: string;
  participantId: string;
  code: string;
  title: string;
  status: "ACTIVE" | "CLOSED";
}

export interface LaunchMomentData {
  momentId: string;
  momentType: string;
  status: string;
  activatedAt?: number;
}

export interface VoteData {
  accepted: boolean;
  awarded?: number;
}

export interface ReactionData {
  accepted: boolean;
}

export interface WordData {
  accepted: boolean;
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
}

export interface EventData {
  eventId: string;
  title: string;
  status: "ACTIVE" | "CLOSED";
  activeMomentId: string | null;
  peakConcurrent: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Base fetch helper
// ---------------------------------------------------------------------------

async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  // credentials: 'same-origin' (the default) is explicit here to ensure
  // httpOnly participant cookies are sent with same-origin API requests.
  // Never use 'omit' — that would break cookie-based identity (F-02 / SC-identity).
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  const json = (await res.json()) as ApiResponse<T>;
  return json;
}

// ---------------------------------------------------------------------------
// Event endpoints
// ---------------------------------------------------------------------------

/**
 * POST /api/events — Create a new event.
 */
export async function createEvent(
  title: string
): Promise<ApiResponse<CreateEventData>> {
  return apiFetch<CreateEventData>("/api/events", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

/**
 * GET /api/events/[eventId] — Read event state.
 */
export async function getEvent(
  eventId: string
): Promise<ApiResponse<EventData>> {
  return apiFetch<EventData>(`/api/events/${eventId}`);
}

/**
 * POST /api/events/[eventId] — Close an event (host-gated).
 */
export async function closeEvent(
  eventId: string,
  hostToken: string
): Promise<ApiResponse<{ status: string }>> {
  return apiFetch<{ status: string }>(`/api/events/${eventId}`, {
    method: "POST",
    body: JSON.stringify({ action: "close", hostToken }),
  });
}

// ---------------------------------------------------------------------------
// Join endpoint
// ---------------------------------------------------------------------------

/**
 * POST /api/join — Join an event by code and display name.
 */
export async function joinEvent(
  code: string,
  displayName: string
): Promise<ApiResponse<JoinData>> {
  return apiFetch<JoinData>("/api/join", {
    method: "POST",
    body: JSON.stringify({ code, displayName }),
  });
}

// ---------------------------------------------------------------------------
// Moment endpoints
// ---------------------------------------------------------------------------

export type LaunchMomentPayload =
  | { momentType: "MC"; question: string; options: string[] }
  | { momentType: "WORDCLOUD"; prompt: string }
  | { momentType: "REACTION" }
  | {
      momentType: "TRIVIA";
      question: string;
      options: string[];
      correctIndex: number;
      timeLimitSec: number;
    };

/**
 * POST /api/events/[eventId]/moments — Launch a moment (host-gated).
 */
export async function launchMoment(
  eventId: string,
  hostToken: string,
  payload: LaunchMomentPayload
): Promise<ApiResponse<LaunchMomentData>> {
  return apiFetch<LaunchMomentData>(`/api/events/${eventId}/moments`, {
    method: "POST",
    body: JSON.stringify({ ...payload, hostToken }),
  });
}

/**
 * POST /api/events/[eventId]/moments/[momentId] — Close a moment (host-gated).
 */
export async function closeMoment(
  eventId: string,
  momentId: string,
  hostToken: string
): Promise<ApiResponse<{ momentId: string; status: string }>> {
  return apiFetch(`/api/events/${eventId}/moments/${momentId}`, {
    method: "POST",
    body: JSON.stringify({ action: "close", hostToken }),
  });
}

// ---------------------------------------------------------------------------
// Interaction endpoints
// ---------------------------------------------------------------------------

/**
 * POST /api/votes — Cast an MC or trivia vote.
 *
 * The server derives participantId from the httpOnly `pulse_pt_<eventId>`
 * cookie (set at /api/join). participantId in args is optional and sent for
 * UI display continuity only — it is NOT trusted by the server for identity
 * (F-02 / SC-identity). Same-origin fetch sends the cookie automatically.
 */
export async function castVote(args: {
  eventId: string;
  momentId: string;
  participantId?: string;
  option: string;
}): Promise<ApiResponse<VoteData>> {
  return apiFetch<VoteData>("/api/votes", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

/**
 * POST /api/reactions — Submit an emoji reaction.
 *
 * participantId is optional; server identity comes from the participant cookie.
 */
export async function submitReaction(args: {
  eventId: string;
  momentId: string;
  participantId?: string;
  emoji: string;
}): Promise<ApiResponse<ReactionData>> {
  return apiFetch<ReactionData>("/api/reactions", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

/**
 * POST /api/words — Submit a word cloud response.
 *
 * participantId is optional; server identity comes from the participant cookie.
 */
export async function submitWord(args: {
  eventId: string;
  momentId: string;
  participantId?: string;
  word: string;
}): Promise<ApiResponse<WordData>> {
  return apiFetch<WordData>("/api/words", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

/**
 * GET /api/leaderboard?eventId=&n= — Top-N leaderboard.
 */
export async function getLeaderboard(
  eventId: string,
  n = 10
): Promise<ApiResponse<LeaderboardData>> {
  return apiFetch<LeaderboardData>(
    `/api/leaderboard?eventId=${encodeURIComponent(eventId)}&n=${n}`
  );
}

// ---------------------------------------------------------------------------
// Ops readout (host-gated)
// ---------------------------------------------------------------------------

/**
 * GET /api/events/[eventId]/ops — Live ops stats (host-gated).
 *
 * Sends the host token via the `x-pulse-host-token` request header rather
 * than a query parameter.  Query params appear in access logs, browser
 * history, Referer headers, and analytics — all paths for unintended token
 * disclosure.  A request header is not replayed by the browser in Referer
 * and is stripped by CDNs before forwarding unless explicitly allow-listed.
 */
export async function getOpsStats(
  eventId: string,
  hostToken: string
): Promise<ApiResponse<OpsStats>> {
  return apiFetch<OpsStats>(`/api/events/${eventId}/ops`, {
    headers: { "x-pulse-host-token": hostToken },
  });
}

// ---------------------------------------------------------------------------
// Summary (host-gated)
// ---------------------------------------------------------------------------

/**
 * GET /api/summary/[eventId] — Event analytics summary (host-gated).
 *
 * Sends the host token via the `x-pulse-host-token` request header rather
 * than a query parameter for the same reasons as getOpsStats above.
 */
export async function getEventSummary(
  eventId: string,
  hostToken: string
): Promise<ApiResponse<EventSummary>> {
  return apiFetch<EventSummary>(`/api/summary/${eventId}`, {
    headers: { "x-pulse-host-token": hostToken },
  });
}

// ---------------------------------------------------------------------------
// Snapshot polling fallback
// ---------------------------------------------------------------------------

/**
 * GET /api/stream/[eventId]?once=1 — Single-shot snapshot for polling fallback.
 */
export async function getSnapshot(
  eventId: string
): Promise<ApiResponse<Snapshot>> {
  return apiFetch<Snapshot>(`/api/stream/${eventId}?once=1`);
}
