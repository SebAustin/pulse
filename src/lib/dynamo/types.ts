/**
 * TypeScript types for all DynamoDB items and domain models in Pulse.
 *
 * Items are immutable value objects; repository functions return new copies.
 */

// ---------------------------------------------------------------------------
// Moment types
// ---------------------------------------------------------------------------

export type MomentType = "MC" | "WORDCLOUD" | "REACTION" | "TRIVIA";

// ---------------------------------------------------------------------------
// DynamoDB item shapes
// ---------------------------------------------------------------------------

/** EVENT METADATA item (AP-1). Durable — no TTL. */
export interface EventItem {
  readonly pk: string; // EVENT#<eventId>
  readonly sk: "METADATA";
  readonly type: "EVENT";
  readonly eventId: string;
  readonly title: string;
  readonly code: string; // 6-char uppercase
  readonly status: "ACTIVE" | "CLOSED";
  readonly hostTokenHash: string; // SHA-256 hex of the raw host token
  readonly activeMomentId: string | null;
  readonly peakConcurrent: number;
  readonly createdAt: number; // epoch seconds
  // GSI1 attrs live on the CODE item, not this item.
}

/** CODE lookup item (AP-2). Durable — no TTL. */
export interface CodeItem {
  readonly pk: string; // CODE#<code>
  readonly sk: "EVENT";
  readonly type: "CODE";
  readonly eventId: string;
  readonly gsi1pk: string; // CODE#<code>
  readonly gsi1sk: "EVENT";
}

/** MOMENT item (AP-8). Durable — no TTL. */
export interface MomentItem {
  readonly pk: string; // EVENT#<eventId>
  readonly sk: string; // MOMENT#<momentId>
  readonly type: "MOMENT";
  readonly eventId: string;
  readonly momentId: string;
  readonly momentType: MomentType;
  readonly status: "ACTIVE" | "CLOSED";
  readonly question?: string;
  readonly options?: readonly string[]; // MC / TRIVIA
  readonly prompt?: string; // WORDCLOUD
  readonly correctIndex?: number; // TRIVIA
  readonly timeLimitSec?: number; // TRIVIA (10–60)
  readonly activatedAt?: number; // epoch ms (set at launch)
  readonly createdAt: number; // epoch seconds
}

/** VOTE dedup record (AP-11). TTL = event + JUDGING_WINDOW. */
export interface VoteItem {
  readonly pk: string;
  readonly sk: string; // VOTE#<momentId>#<participantId>
  readonly type: "VOTE";
  readonly option: string;
  readonly createdAt: number;
  readonly ttl: number; // epoch seconds
}

/** COUNTER shard item (AP-11, AP-12, AP-13, AP-14). Durable — no TTL. */
export interface CounterItem {
  readonly pk: string;
  readonly sk: string; // COUNTER#<momentId>#<optionKey>#<shard>
  readonly type: "COUNTER";
  readonly count: number;
}

/** REACTION ephemeral item (AP-13). TTL = ts + REACTION_TTL_SEC. */
export interface ReactionItem {
  readonly pk: string;
  readonly sk: string; // REACTION#<ts>#<id>
  readonly type: "REACTION";
  readonly emoji: string;
  readonly participantId: string;
  readonly ttl: number;
}

/** WORD submission item (AP-15). Durable — no TTL. */
export interface WordItem {
  readonly pk: string;
  readonly sk: string; // WORD#<momentId>#<participantId>
  readonly type: "WORD";
  readonly word: string;
  readonly createdAt: number;
}

/** Leaderboard / participant score item (AP-17, AP-18). Durable — no TTL. */
export interface LeaderboardItem {
  readonly pk: string;
  readonly sk: string; // LB#<participantId>
  readonly type: "LB";
  readonly participantId: string;
  readonly displayName: string;
  readonly score: number;
  readonly gsi2pk: string; // LBEVENT#<eventId>
  readonly gsi2sk: string; // zero-padded score + '#' + participantId
}

/** USER (participant) item (AP-6). Durable — no TTL. */
export interface UserItem {
  readonly pk: string;
  readonly sk: string; // USER#<participantId>
  readonly type: "USER";
  readonly participantId: string;
  readonly displayName: string;
  readonly joinedAt: number; // epoch seconds
}

/** CONN (presence) item (AP-21). Ephemeral — TTL = lastSeen + PRESENCE_TTL_SEC. */
export interface ConnItem {
  readonly pk: string;
  readonly sk: string; // CONN#<connId>
  readonly type: "CONN";
  readonly connId: string;
  readonly role: "AUDIENCE" | "HOST";
  readonly lastSeen: number; // epoch ms
  readonly ttl: number; // epoch seconds
}

/** OPS write-rate bucket item (AP-23). Ephemeral — TTL = bucket + OPS_WRITES_TTL_SEC. */
export interface OpsWritesItem {
  readonly pk: string;
  readonly sk: string; // OPS#WRITES#<epochSecond>
  readonly type: "OPSWRITES";
  readonly count: number;
  readonly ttl: number;
}

// ---------------------------------------------------------------------------
// Domain models (returned by repository, consumed by route handlers / SSE)
// ---------------------------------------------------------------------------

/** Public event state returned by GET /api/events/[eventId]. */
export interface Event {
  readonly eventId: string;
  readonly title: string;
  readonly code: string;
  readonly status: "ACTIVE" | "CLOSED";
  readonly activeMomentId: string | null;
  readonly peakConcurrent: number;
  readonly createdAt: number;
  /** Included for host-token verification in route handlers. Never sent to clients. */
  readonly hostTokenHash: string;
}

/** Public moment state (returned alongside events in snapshots). */
export interface Moment {
  readonly momentId: string;
  readonly momentType: MomentType;
  readonly status: "ACTIVE" | "CLOSED";
  readonly question?: string;
  readonly options?: readonly string[];
  readonly prompt?: string;
  readonly correctIndex?: number;
  readonly timeLimitSec?: number;
  readonly activatedAt?: number;
  readonly createdAt: number;
}

/** Per-option tally (collapsed from shards). */
export type Tally = Record<string, number>;

/** A single leaderboard row. */
export interface LeaderboardEntry {
  readonly rank: number;
  readonly participantId: string;
  readonly displayName: string;
  readonly score: number;
}

/** Word + frequency pair for word clouds. */
export interface WordCount {
  readonly word: string;
  readonly count: number;
}

/**
 * Snapshot emitted by the SSE stream and returned by the polling fallback.
 * Shape matches PLAN §5.1 / DESIGN §4.
 */
export interface Snapshot {
  readonly v: 1;
  readonly eventStatus: "ACTIVE" | "CLOSED";
  readonly activeMoment:
    | (Moment & {
        tally?: Tally; // MC / REACTION / TRIVIA option counts
        words?: WordCount[]; // WORDCLOUD top words
        leaderboard?: LeaderboardEntry[]; // TRIVIA
      })
    | null;
  readonly leaderboard: LeaderboardEntry[]; // top-N always present for trivia events
  readonly serverTs: number; // epoch ms
  readonly seq: number;
}

/** Payload returned by GET /api/events/[eventId]/ops (PLAN §4.4). */
export interface OpsStats {
  readonly participantCount: number;
  readonly sseSubscriberCount: number;
  readonly recentWriteRatePerSec: number;
  readonly shardWritesRecent: number[];
}

/** Payload returned by GET /api/summary/[eventId] (PLAN §4.2). */
export interface EventSummary {
  readonly title: string;
  readonly status: "ACTIVE" | "CLOSED";
  readonly uniqueParticipants: number;
  readonly totalInteractions: number;
  readonly peakConcurrent: number;
  readonly momentsLaunched: number;
  readonly wordClouds: Array<{
    readonly momentId: string;
    readonly prompt: string;
    readonly top5: WordCount[];
  }>;
}

/** Result of a trivia-vote write. */
export interface TriviaVoteResult {
  readonly accepted: boolean;
  readonly awarded: number;
  readonly newScore: number;
}
