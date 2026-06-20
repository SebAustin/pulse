/**
 * Pure key builders for every entity in the Pulse single-table design.
 *
 * This is the single source of truth for pk/sk/GSI key strings.
 * All functions are pure and unit-testable — no DynamoDB SDK imports.
 */

// ---------------------------------------------------------------------------
// Primary key types
// ---------------------------------------------------------------------------

export interface PrimaryKey {
  readonly pk: string;
  readonly sk: string;
}

export interface Gsi1Key {
  readonly gsi1pk: string;
  readonly gsi1sk: string;
}

export interface Gsi2Key {
  readonly gsi2pk: string;
  readonly gsi2sk: string;
}

// ---------------------------------------------------------------------------
// PK prefix constants
// ---------------------------------------------------------------------------

export const PK = {
  EVENT: "EVENT",
  CODE: "CODE",
} as const;

export const SK = {
  METADATA: "METADATA",
  EVENT: "EVENT", // used on CODE# items
  MOMENT: "MOMENT",
  VOTE: "VOTE",
  COUNTER: "COUNTER",
  REACTION: "REACTION",
  WORD: "WORD",
  LB: "LB",
  USER: "USER",
  CONN: "CONN",
  OPS_WRITES: "OPS#WRITES",
} as const;

// ---------------------------------------------------------------------------
// Event keys (AP-1)
// ---------------------------------------------------------------------------

/** Main event metadata item. */
export function eventMetaKey(eventId: string): PrimaryKey {
  return { pk: `EVENT#${eventId}`, sk: "METADATA" };
}

// ---------------------------------------------------------------------------
// Code lookup keys (AP-2)
// ---------------------------------------------------------------------------

/** Base item for direct code lookup (belt-and-braces alongside GSI1). */
export function codeKey(code: string): PrimaryKey {
  return { pk: `CODE#${code.toUpperCase()}`, sk: "EVENT" };
}

/** GSI1 key for code → event resolution (AP-3). */
export function gsi1Key(code: string): Gsi1Key {
  return {
    gsi1pk: `CODE#${code.toUpperCase()}`,
    gsi1sk: "EVENT",
  };
}

// ---------------------------------------------------------------------------
// Moment keys (AP-8)
// ---------------------------------------------------------------------------

/** sk for a moment item within an event partition. */
export function momentSk(momentId: string): string {
  return `MOMENT#${momentId}`;
}

export function momentKey(eventId: string, momentId: string): PrimaryKey {
  return { pk: `EVENT#${eventId}`, sk: momentSk(momentId) };
}

// ---------------------------------------------------------------------------
// Vote / dedup keys (AP-11)
// ---------------------------------------------------------------------------

/** sk for the dedup record that prevents double-voting. */
export function voteSk(momentId: string, participantId: string): string {
  return `VOTE#${momentId}#${participantId}`;
}

export function voteKey(
  eventId: string,
  momentId: string,
  participantId: string
): PrimaryKey {
  return { pk: `EVENT#${eventId}`, sk: voteSk(momentId, participantId) };
}

// ---------------------------------------------------------------------------
// Counter shard keys (AP-11, AP-12, AP-13, AP-14)
// ---------------------------------------------------------------------------

/** sk for a single counter shard. */
export function counterShardSk(
  momentId: string,
  optionKey: string,
  shard: number
): string {
  return `COUNTER#${momentId}#${optionKey}#${shard}`;
}

export function counterShardKey(
  eventId: string,
  momentId: string,
  optionKey: string,
  shard: number
): PrimaryKey {
  return {
    pk: `EVENT#${eventId}`,
    sk: counterShardSk(momentId, optionKey, shard),
  };
}

/** Prefix used to query all counter shards for a moment. */
export function counterPrefix(momentId: string): string {
  return `COUNTER#${momentId}#`;
}

// ---------------------------------------------------------------------------
// Reaction keys (AP-13)
// ---------------------------------------------------------------------------

/** sk for an ephemeral reaction item. */
export function reactionSk(timestampMs: number, reactionId: string): string {
  return `REACTION#${timestampMs}#${reactionId}`;
}

export function reactionKey(
  eventId: string,
  timestampMs: number,
  reactionId: string
): PrimaryKey {
  return {
    pk: `EVENT#${eventId}`,
    sk: reactionSk(timestampMs, reactionId),
  };
}

// ---------------------------------------------------------------------------
// Word submission keys (AP-15)
// ---------------------------------------------------------------------------

/** sk for a word-cloud submission (one per participant per moment). */
export function wordSk(momentId: string, participantId: string): string {
  return `WORD#${momentId}#${participantId}`;
}

export function wordKey(
  eventId: string,
  momentId: string,
  participantId: string
): PrimaryKey {
  return {
    pk: `EVENT#${eventId}`,
    sk: wordSk(momentId, participantId),
  };
}

/** Prefix used to query all word submissions for a moment. */
export function wordPrefix(momentId: string): string {
  return `WORD#${momentId}#`;
}

// ---------------------------------------------------------------------------
// Leaderboard keys (AP-17, AP-18)
// ---------------------------------------------------------------------------

/** sk for a participant's leaderboard/score item. */
export function lbSk(participantId: string): string {
  return `LB#${participantId}`;
}

export function lbKey(eventId: string, participantId: string): PrimaryKey {
  return { pk: `EVENT#${eventId}`, sk: lbSk(participantId) };
}

/**
 * GSI2 partition key for leaderboard queries (AP-18, SC6).
 * All LB items for an event share this pk so a single GSI2 Query
 * with ScanIndexForward=false returns the top-N by score.
 */
export function gsi2Pk(eventId: string): string {
  return `LBEVENT#${eventId}`;
}

/**
 * GSI2 sort key — zero-padded score + userId for stable tie-breaking.
 * Score is padded to 10 digits (max 9_999_999_999 points — far above any
 * realistic game total). Ascending lexicographic order == ascending numeric
 * order; we query ScanIndexForward=false to get highest first.
 */
export function gsi2Sk(score: number, participantId: string): string {
  return `${String(score).padStart(10, "0")}#${participantId}`;
}

export function gsi2Keys(
  eventId: string,
  score: number,
  participantId: string
): Gsi2Key {
  return {
    gsi2pk: gsi2Pk(eventId),
    gsi2sk: gsi2Sk(score, participantId),
  };
}

// ---------------------------------------------------------------------------
// Participant (USER) keys (AP-6, AP-7)
// ---------------------------------------------------------------------------

/** sk for a participant item. */
export function userSk(participantId: string): string {
  return `USER#${participantId}`;
}

export function userKey(eventId: string, participantId: string): PrimaryKey {
  return { pk: `EVENT#${eventId}`, sk: userSk(participantId) };
}

/** Prefix to query all participants for an event. */
export const USER_PREFIX = "USER#";

// ---------------------------------------------------------------------------
// Presence / connection keys (AP-21, AP-22)
// ---------------------------------------------------------------------------

/** sk for a presence item. */
export function connSk(connId: string): string {
  return `CONN#${connId}`;
}

export function connKey(eventId: string, connId: string): PrimaryKey {
  return { pk: `EVENT#${eventId}`, sk: connSk(connId) };
}

/** Prefix to query all presence items for an event. */
export const CONN_PREFIX = "CONN#";

// ---------------------------------------------------------------------------
// Ops write-rate bucket keys (AP-23)
// ---------------------------------------------------------------------------

/** sk for a 1-second write-rate counter bucket. */
export function opsWritesSk(epochSecond: number): string {
  return `OPS#WRITES#${epochSecond}`;
}

export function opsWritesKey(eventId: string, epochSecond: number): PrimaryKey {
  return { pk: `EVENT#${eventId}`, sk: opsWritesSk(epochSecond) };
}

/** Prefix to query all ops write buckets for an event. */
export const OPS_WRITES_PREFIX = "OPS#WRITES#";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract entity type from a sort key (for type-switching in queries). */
export function skType(sk: string): string {
  return sk.split("#")[0];
}

/** Parse a momentId from a MOMENT# sk. */
export function parseMomentSk(sk: string): string {
  return sk.replace(/^MOMENT#/, "");
}

/** Parse a participantId from a USER# sk. */
export function parseUserSk(sk: string): string {
  return sk.replace(/^USER#/, "");
}

/** Parse a connId from a CONN# sk. */
export function parseConnSk(sk: string): string {
  return sk.replace(/^CONN#/, "");
}
