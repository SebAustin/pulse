/**
 * Pulse single-table repository.
 *
 * Implements ALL access patterns from PLAN §3.4.
 * This is the only file that issues DynamoDB commands.
 * Route handlers call these functions — they never build commands themselves.
 *
 * Immutability: every function returns new objects; nothing is mutated in place.
 * Error handling: DynamoDB errors propagate; callers catch and shape responses.
 */

import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { getTableName, getDocClient } from "./client";
import {
  eventMetaKey,
  codeKey,
  gsi1Key,
  momentKey,
  voteKey,
  counterShardKey,
  lbKey,
  userKey,
  connKey,
  opsWritesKey,
  gsi2Pk,
  gsi2Sk,
  USER_PREFIX,
  CONN_PREFIX,
  OPS_WRITES_PREFIX,
  wordKey,
  reactionKey,
  wordPrefix,
} from "./keys";
import {
  pickShard,
  readMomentTallies,
  SHARD_COUNT,
} from "./counters";
import type {
  Event,
  EventItem,
  Moment,
  MomentItem,
  MomentType,
  LeaderboardEntry,
  EventSummary,
  OpsStats,
  Snapshot,
  TriviaVoteResult,
  WordCount,
} from "./types";
import { log } from "../observability/log";
import { config } from "../config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function voteTtl(): number {
  return nowSec() + config.JUDGING_WINDOW_DAYS * 86_400;
}

function toEvent(item: EventItem): Event {
  return {
    eventId: item.eventId,
    title: item.title,
    code: item.code,
    status: item.status,
    activeMomentId: item.activeMomentId,
    peakConcurrent: item.peakConcurrent,
    createdAt: item.createdAt,
    hostTokenHash: item.hostTokenHash,
  };
}

function toMoment(item: MomentItem): Moment {
  return {
    momentId: item.momentId,
    momentType: item.momentType,
    status: item.status,
    question: item.question,
    options: item.options,
    prompt: item.prompt,
    correctIndex: item.correctIndex,
    timeLimitSec: item.timeLimitSec,
    activatedAt: item.activatedAt,
    createdAt: item.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Event CRUD
// ---------------------------------------------------------------------------

/**
 * Create event: writes EVENT METADATA + CODE lookup item + GSI1 attrs.
 * AP-1, AP-2.
 */
export async function createEvent(params: {
  eventId: string;
  title: string;
  code: string;
  hostTokenHash: string;
}): Promise<Event> {
  const { eventId, title, code, hostTokenHash } = params;
  const now = nowSec();
  const metaKey = eventMetaKey(eventId);
  const ck = codeKey(code);
  const g1 = gsi1Key(code);

  const eventItem: EventItem = {
    pk: metaKey.pk,
    sk: "METADATA",
    type: "EVENT",
    eventId,
    title,
    code,
    status: "ACTIVE",
    hostTokenHash,
    activeMomentId: null,
    peakConcurrent: 0,
    createdAt: now,
  };

  const codeItem = {
    pk: ck.pk,
    sk: ck.sk,
    type: "CODE",
    eventId,
    gsi1pk: g1.gsi1pk,
    gsi1sk: g1.gsi1sk,
  };

  const client = getDocClient();
  await client.send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: getTableName(), Item: eventItem } },
        { Put: { TableName: getTableName(), Item: codeItem } },
      ],
    })
  );

  return toEvent(eventItem);
}

/**
 * Resolve code -> event using the base CODE# item (fast, consistent).
 * AP-3.
 */
export async function getEventByCode(code: string): Promise<Event | null> {
  const client = getDocClient();
  const ck = codeKey(code);

  const { Item: codeItem } = await client.send(
    new GetCommand({ TableName: getTableName(), Key: { pk: ck.pk, sk: ck.sk } })
  );

  if (!codeItem) return null;
  return getEventById((codeItem as { eventId: string }).eventId);
}

/**
 * Read event by ID.
 * AP-4.
 */
export async function getEventById(eventId: string): Promise<Event | null> {
  const client = getDocClient();
  const key = eventMetaKey(eventId);

  const { Item } = await client.send(
    new GetCommand({ TableName: getTableName(), Key: { pk: key.pk, sk: key.sk } })
  );

  if (!Item) return null;
  return toEvent(Item as EventItem);
}

/**
 * Close event (host action).
 * AP-5.
 */
export async function closeEvent(eventId: string): Promise<Event> {
  const client = getDocClient();
  const key = eventMetaKey(eventId);

  const { Attributes } = await client.send(
    new UpdateCommand({
      TableName: getTableName(),
      Key: { pk: key.pk, sk: key.sk },
      UpdateExpression: "SET #status = :closed, activeMomentId = :null",
      ConditionExpression: "#status = :active",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":closed": "CLOSED",
        ":active": "ACTIVE",
        ":null": null,
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return toEvent(Attributes as EventItem);
}

// ---------------------------------------------------------------------------
// Participant
// ---------------------------------------------------------------------------

/**
 * Register a participant (upsert — safe to re-call on reconnect).
 * AP-6.
 */
export async function registerParticipant(params: {
  eventId: string;
  participantId: string;
  displayName: string;
}): Promise<void> {
  const { eventId, participantId, displayName } = params;
  const client = getDocClient();
  const key = userKey(eventId, participantId);
  const now = nowSec();

  await client.send(
    new PutCommand({
      TableName: getTableName(),
      Item: {
        pk: key.pk,
        sk: key.sk,
        type: "USER",
        participantId,
        displayName,
        joinedAt: now,
      },
      // Use attribute_not_exists so a re-join doesn't overwrite the original joinedAt
      ConditionExpression: "attribute_not_exists(pk)",
    })
  ).catch(() => {
    // Condition failed = already exists; that's fine for upsert semantics
  });
}

/**
 * Count unique participants for an event.
 * AP-7.
 */
export async function countParticipants(eventId: string): Promise<number> {
  const client = getDocClient();
  let count = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const { Count = 0, LastEvaluatedKey } = await client.send(
      new QueryCommand({
        TableName: getTableName(),
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": `EVENT#${eventId}`,
          ":prefix": USER_PREFIX,
        },
        Select: "COUNT",
        ExclusiveStartKey: lastKey,
      })
    );
    count += Count;
    lastKey = LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return count;
}

// ---------------------------------------------------------------------------
// Moments
// ---------------------------------------------------------------------------

/**
 * Launch a moment — sets activatedAt (epoch ms) atomically.
 * AP-8.
 */
export async function launchMoment(params: {
  eventId: string;
  momentId: string;
  momentType: MomentType;
  question?: string;
  options?: string[];
  prompt?: string;
  correctIndex?: number;
  timeLimitSec?: number;
}): Promise<Moment> {
  const { eventId, momentId, momentType } = params;
  const client = getDocClient();
  const key = momentKey(eventId, momentId);
  const eventKey = eventMetaKey(eventId);
  const now = nowSec();
  const activatedAt = Date.now(); // epoch ms — server-authoritative timing

  const momentItem: MomentItem = {
    pk: key.pk,
    sk: key.sk,
    type: "MOMENT",
    eventId,
    momentId,
    momentType,
    status: "ACTIVE",
    question: params.question,
    options: params.options,
    prompt: params.prompt,
    correctIndex: params.correctIndex,
    timeLimitSec: params.timeLimitSec,
    activatedAt,
    createdAt: now,
  };

  // Atomically: Put the moment + update event.activeMomentId
  await client.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: getTableName(),
            Item: momentItem,
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
        {
          Update: {
            TableName: getTableName(),
            Key: { pk: eventKey.pk, sk: eventKey.sk },
            UpdateExpression: "SET activeMomentId = :mid",
            ConditionExpression: "#status = :active",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
              ":mid": momentId,
              ":active": "ACTIVE",
            },
          },
        },
      ],
    })
  );

  return toMoment(momentItem);
}

/**
 * Read the active moment for an event.
 * AP-9.
 */
export async function getActiveMoment(eventId: string): Promise<Moment | null> {
  const event = await getEventById(eventId);
  if (!event?.activeMomentId) return null;
  return getMomentById(eventId, event.activeMomentId);
}

/**
 * Read a moment by ID directly.
 */
export async function getMomentById(
  eventId: string,
  momentId: string
): Promise<Moment | null> {
  const client = getDocClient();
  const key = momentKey(eventId, momentId);

  const { Item } = await client.send(
    new GetCommand({ TableName: getTableName(), Key: { pk: key.pk, sk: key.sk } })
  );

  if (!Item) return null;
  return toMoment(Item as MomentItem);
}

/**
 * Close a moment.
 * AP-10.
 */
export async function closeMoment(
  eventId: string,
  momentId: string
): Promise<Moment> {
  const client = getDocClient();
  const key = momentKey(eventId, momentId);
  const eventKey = eventMetaKey(eventId);

  const { Attributes } = await client.send(
    new UpdateCommand({
      TableName: getTableName(),
      Key: { pk: key.pk, sk: key.sk },
      UpdateExpression: "SET #status = :closed",
      ConditionExpression: "#status = :active",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":closed": "CLOSED", ":active": "ACTIVE" },
      ReturnValues: "ALL_NEW",
    })
  );

  // Clear activeMomentId on the event (best-effort — don't fail if already cleared)
  await client
    .send(
      new UpdateCommand({
        TableName: getTableName(),
        Key: { pk: eventKey.pk, sk: eventKey.sk },
        UpdateExpression: "SET activeMomentId = :null",
        ConditionExpression: "activeMomentId = :mid",
        ExpressionAttributeValues: { ":null": null, ":mid": momentId },
      })
    )
    .catch(() => {
      // Already cleared or different moment active — ignore
    });

  return toMoment(Attributes as MomentItem);
}

/**
 * Count all moments for an event (for the summary).
 */
export async function countMoments(eventId: string): Promise<number> {
  const client = getDocClient();
  let count = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const { Count = 0, LastEvaluatedKey } = await client.send(
      new QueryCommand({
        TableName: getTableName(),
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": `EVENT#${eventId}`,
          ":prefix": "MOMENT#",
        },
        Select: "COUNT",
        ExclusiveStartKey: lastKey,
      })
    );
    count += Count;
    lastKey = LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return count;
}

// ---------------------------------------------------------------------------
// Votes (MC poll)
// ---------------------------------------------------------------------------

/**
 * Record an MC vote atomically.
 *
 * TransactWriteItems:
 *   1. Conditional Put on VOTE# dedup record (attribute_not_exists → 409 on dup)
 *   2. UpdateItem ADD :one on the chosen counter shard
 *   3. UpdateItem ADD :one on OPS#WRITES# bucket (best-effort, outside Tx — see PLAN critic note)
 *
 * Returns true on success, false on duplicate.
 * AP-11.
 */
export async function recordVote(params: {
  eventId: string;
  momentId: string;
  participantId: string;
  option: string;
}): Promise<boolean> {
  const { eventId, momentId, participantId, option } = params;
  const client = getDocClient();

  const vk = voteKey(eventId, momentId, participantId);
  const shard = pickShard(participantId);
  const ck = counterShardKey(eventId, momentId, option, shard);
  const now = nowSec();

  try {
    await client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: getTableName(),
              Item: {
                pk: vk.pk,
                sk: vk.sk,
                type: "VOTE",
                option,
                createdAt: now,
                ttl: voteTtl(),
              },
              ConditionExpression: "attribute_not_exists(sk)",
            },
          },
          {
            Update: {
              TableName: getTableName(),
              Key: { pk: ck.pk, sk: ck.sk },
              UpdateExpression: "ADD #cnt :one",
              ExpressionAttributeNames: { "#cnt": "count" },
              ExpressionAttributeValues: { ":one": 1 },
            },
          },
        ],
        ReturnConsumedCapacity: "TOTAL",
      })
    );

    // OPS writes counter is best-effort and OUTSIDE the vote transaction
    // so a metric failure never loses a real vote (per PLAN critic).
    recordOpsWrite(eventId).catch(() => {});

    return true;
  } catch (err) {
    if (
      err instanceof TransactionCanceledException &&
      err.CancellationReasons?.some(
        (r) => r.Code === "ConditionalCheckFailed"
      )
    ) {
      return false; // duplicate vote
    }
    log.error("recordVote failed", {
      eventId,
      momentId,
      errorType: (err as Error).name,
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Trivia answers
// ---------------------------------------------------------------------------

/**
 * Record a trivia answer with server-authoritative scoring.
 *
 * TransactWriteItems:
 *   1. Conditional Put on VOTE# dedup record
 *   2. UpdateItem ADD score to LB# item with ReturnValues: UPDATED_NEW
 *   3. OPS counter (outside Tx)
 *
 * Then a follow-up conditional UpdateItem recomputes gsi2sk from the new score.
 * Score ADD is always atomic; gsi2sk recompute is eventual but monotonic.
 * AP-17.
 */
export async function recordTriviaAnswer(params: {
  eventId: string;
  momentId: string;
  participantId: string;
  displayName: string;
  option: string;
  awarded: number;
}): Promise<TriviaVoteResult> {
  const { eventId, momentId, participantId, displayName, option, awarded } =
    params;
  const client = getDocClient();

  const vk = voteKey(eventId, momentId, participantId);
  const lk = lbKey(eventId, participantId);
  const shard = pickShard(participantId);
  const ck = counterShardKey(eventId, momentId, option, shard);
  const now = nowSec();

  let newScore = 0;

  try {
    // We can't do ADD and read UPDATED_NEW inside a TransactWriteItems
    // (Transact doesn't support ReturnValues), so we split:
    // 1. Transact: dedup Put + counter ADD
    // 2. Update with ReturnValues: UPDATED_NEW for the LB score ADD
    await client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: getTableName(),
              Item: {
                pk: vk.pk,
                sk: vk.sk,
                type: "VOTE",
                option,
                createdAt: now,
                ttl: voteTtl(),
              },
              ConditionExpression: "attribute_not_exists(sk)",
            },
          },
          {
            Update: {
              TableName: getTableName(),
              Key: { pk: ck.pk, sk: ck.sk },
              UpdateExpression: "ADD #cnt :one",
              ExpressionAttributeNames: { "#cnt": "count" },
              ExpressionAttributeValues: { ":one": 1 },
            },
          },
        ],
        ReturnConsumedCapacity: "TOTAL",
      })
    );
  } catch (err) {
    if (
      err instanceof TransactionCanceledException &&
      err.CancellationReasons?.some(
        (r) => r.Code === "ConditionalCheckFailed"
      )
    ) {
      // Get current score for the duplicate response
      const { Item: lbItem } = await client.send(
        new GetCommand({
          TableName: getTableName(),
          Key: { pk: lk.pk, sk: lk.sk },
        })
      );
      return {
        accepted: false,
        awarded: 0,
        newScore: (lbItem as { score?: number })?.score ?? 0,
      };
    }
    log.error("recordTriviaAnswer transact failed", {
      eventId,
      momentId,
      errorType: (err as Error).name,
    });
    throw err;
  }

  // Step 2: ADD score to LB item and get the new cumulative total.
  const { Attributes: lbAttrs } = await client.send(
    new UpdateCommand({
      TableName: getTableName(),
      Key: { pk: lk.pk, sk: lk.sk },
      UpdateExpression:
        "ADD score :pts SET displayName = :dn, gsi2pk = :gsi2pk, #type = :lbtype",
      ExpressionAttributeNames: { "#type": "type" },
      ExpressionAttributeValues: {
        ":pts": awarded,
        ":dn": displayName,
        ":gsi2pk": gsi2Pk(eventId),
        ":lbtype": "LB",
      },
      ReturnValues: "UPDATED_NEW",
    })
  );

  newScore = (lbAttrs as { score: number }).score;

  // Step 3: Recompute gsi2sk from the new score.
  // CONDITIONAL: only update if the new gsi2sk would be >= current (monotonic).
  // This handles the race where two answers land simultaneously.
  const newGsi2sk = gsi2Sk(newScore, participantId);
  await client
    .send(
      new UpdateCommand({
        TableName: getTableName(),
        Key: { pk: lk.pk, sk: lk.sk },
        UpdateExpression: "SET gsi2sk = :newsk",
        ConditionExpression:
          "attribute_not_exists(gsi2sk) OR gsi2sk <= :newsk",
        ExpressionAttributeValues: { ":newsk": newGsi2sk },
      })
    )
    .catch(() => {
      // Condition failed means another write set a higher gsi2sk already.
      // That's fine — the stored score is still correct; only the sort key
      // lags temporarily, which is the documented acceptable bias.
    });

  // OPS counter (best-effort, outside Tx)
  recordOpsWrite(eventId).catch(() => {});

  return { accepted: true, awarded, newScore };
}

// ---------------------------------------------------------------------------
// Reactions
// ---------------------------------------------------------------------------

/**
 * Record an emoji reaction.
 * Writes an ephemeral REACTION# item (TTL) + increments a durable counter shard.
 * AP-13.
 */
export async function recordReaction(params: {
  eventId: string;
  momentId: string;
  participantId: string;
  emoji: string;
  reactionId: string;
}): Promise<void> {
  const { eventId, momentId, participantId, emoji, reactionId } = params;
  const client = getDocClient();
  const ts = Date.now();
  const rk = reactionKey(eventId, ts, reactionId);
  const shard = pickShard(participantId);
  const ck = counterShardKey(eventId, momentId, emoji, shard);
  const ttl = nowSec() + config.REACTION_TTL_SEC;

  await client.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: getTableName(),
            Item: {
              pk: rk.pk,
              sk: rk.sk,
              type: "REACTION",
              emoji,
              participantId,
              ttl,
            },
          },
        },
        {
          Update: {
            TableName: getTableName(),
            Key: { pk: ck.pk, sk: ck.sk },
            UpdateExpression: "ADD #cnt :one",
            ExpressionAttributeNames: { "#cnt": "count" },
            ExpressionAttributeValues: { ":one": 1 },
          },
        },
      ],
      ReturnConsumedCapacity: "TOTAL",
    })
  );

  recordOpsWrite(eventId).catch(() => {});
}

// ---------------------------------------------------------------------------
// Word cloud
// ---------------------------------------------------------------------------

/**
 * Submit a word (one per participant per moment — conditional put).
 * Returns true on success, false if duplicate.
 * AP-15.
 */
export async function recordWord(params: {
  eventId: string;
  momentId: string;
  participantId: string;
  word: string;
}): Promise<boolean> {
  const { eventId, momentId, participantId, word } = params;
  const client = getDocClient();
  const wk = wordKey(eventId, momentId, participantId);
  const now = nowSec();

  try {
    await client.send(
      new PutCommand({
        TableName: getTableName(),
        Item: {
          pk: wk.pk,
          sk: wk.sk,
          type: "WORD",
          word: word.toLowerCase().trim(),
          createdAt: now,
        },
        ConditionExpression: "attribute_not_exists(sk)",
      })
    );
    recordOpsWrite(eventId).catch(() => {});
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === "ConditionalCheckFailedException") {
      return false; // duplicate
    }
    log.error("recordWord failed", {
      eventId,
      momentId,
      errorType: (err as Error).name,
    });
    throw err;
  }
}

/**
 * Aggregate word cloud for a moment — returns sorted word-count pairs.
 * AP-16.
 */
export async function getWordCounts(
  eventId: string,
  momentId: string
): Promise<WordCount[]> {
  const client = getDocClient();
  const prefix = wordPrefix(momentId);
  const items: Array<{ word: string }> = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const { Items = [], LastEvaluatedKey } = await client.send(
      new QueryCommand({
        TableName: getTableName(),
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": `EVENT#${eventId}`,
          ":prefix": prefix,
        },
        ProjectionExpression: "#w",
        ExpressionAttributeNames: { "#w": "word" },
        ExclusiveStartKey: lastKey,
      })
    );
    items.push(...(Items as Array<{ word: string }>));
    lastKey = LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  const freq: Record<string, number> = {};
  for (const { word } of items) {
    const normalised = (word ?? "").toLowerCase().trim();
    if (normalised) freq[normalised] = (freq[normalised] ?? 0) + 1;
  }

  return Object.entries(freq)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

/**
 * Return the top-N leaderboard entries via GSI2.
 * No Scan — uses ScanIndexForward=false, Limit=N on the GSI.
 * AP-18, SC6.
 */
export async function getLeaderboardTopN(
  eventId: string,
  n: number = 10
): Promise<LeaderboardEntry[]> {
  const client = getDocClient();

  const { Items = [] } = await client.send(
    new QueryCommand({
      TableName: getTableName(),
      IndexName: "GSI2",
      KeyConditionExpression: "gsi2pk = :pk",
      ExpressionAttributeValues: { ":pk": gsi2Pk(eventId) },
      ScanIndexForward: false,
      Limit: n,
      ProjectionExpression: "participantId, displayName, score",
    })
  );

  return (Items as Array<{ participantId: string; displayName: string; score: number }>).map(
    (item, i) => ({
      rank: i + 1,
      participantId: item.participantId,
      displayName: item.displayName,
      score: item.score,
    })
  );
}

// ---------------------------------------------------------------------------
// Presence / connection
// ---------------------------------------------------------------------------

/**
 * Upsert a presence item. Called on SSE open and each heartbeat tick.
 * AP-21.
 */
export async function upsertPresence(params: {
  eventId: string;
  connId: string;
  role: "AUDIENCE" | "HOST";
}): Promise<void> {
  const { eventId, connId, role } = params;
  const client = getDocClient();
  const key = connKey(eventId, connId);
  const now = Date.now();
  const ttl = nowSec() + config.PRESENCE_TTL_SEC;

  await client.send(
    new PutCommand({
      TableName: getTableName(),
      Item: {
        pk: key.pk,
        sk: key.sk,
        type: "CONN",
        connId,
        role,
        lastSeen: now,
        ttl,
      },
    })
  );
}

/**
 * Count live presence items (ttl > now).
 * AP-22.
 */
export async function countLivePresence(eventId: string): Promise<number> {
  const client = getDocClient();
  const nowS = nowSec();
  let count = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const { Items = [], LastEvaluatedKey } = await client.send(
      new QueryCommand({
        TableName: getTableName(),
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": `EVENT#${eventId}`,
          ":prefix": CONN_PREFIX,
        },
        ProjectionExpression: "#ttl",
        ExpressionAttributeNames: { "#ttl": "ttl" },
        ExclusiveStartKey: lastKey,
      })
    );
    for (const item of Items as Array<{ ttl: number }>) {
      if ((item.ttl ?? 0) > nowS) count++;
    }
    lastKey = LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return count;
}

/**
 * Update peakConcurrent monotonically (SET only if live > current).
 */
export async function updatePeakConcurrent(
  eventId: string,
  live: number
): Promise<void> {
  const client = getDocClient();
  const key = eventMetaKey(eventId);

  await client
    .send(
      new UpdateCommand({
        TableName: getTableName(),
        Key: { pk: key.pk, sk: key.sk },
        UpdateExpression: "SET peakConcurrent = :live",
        ConditionExpression: "peakConcurrent < :live",
        ExpressionAttributeValues: { ":live": live },
      })
    )
    .catch(() => {
      // Condition failed = current peak is already >= live, which is fine
    });
}

// ---------------------------------------------------------------------------
// OPS write-rate counter
// ---------------------------------------------------------------------------

/**
 * Increment the rolling ops write counter.
 * This is BEST-EFFORT and must NEVER be inside a vote/reaction TransactWrite.
 * AP-23.
 */
export async function recordOpsWrite(eventId: string): Promise<void> {
  const client = getDocClient();
  const epochSecond = nowSec();
  const key = opsWritesKey(eventId, epochSecond);
  const ttl = epochSecond + config.OPS_WRITES_TTL_SEC;

  await client.send(
    new UpdateCommand({
      TableName: getTableName(),
      Key: { pk: key.pk, sk: key.sk },
      UpdateExpression: "ADD #cnt :one SET #ttl = :ttl, #type = :t",
      ExpressionAttributeNames: {
        "#cnt": "count",
        "#ttl": "ttl",
        "#type": "type",
      },
      ExpressionAttributeValues: {
        ":one": 1,
        ":ttl": ttl,
        ":t": "OPSWRITES",
      },
    })
  );
}

/**
 * Read ops stats for the ops readout endpoint.
 * AP-23 for write-rate + AP-22 for presence + AP-7 for participant count.
 */
export async function getOpsStats(eventId: string): Promise<OpsStats> {
  const [participantCount, sseSubscriberCount] = await Promise.all([
    countParticipants(eventId),
    countLivePresence(eventId),
  ]);

  // Read all OPS#WRITES# buckets from the last OPS_WINDOW_SEC seconds
  const client = getDocClient();
  const nowS = nowSec();
  const windowStart = nowS - config.OPS_WINDOW_SEC;

  const { Items: opsItems = [] } = await client.send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `EVENT#${eventId}`,
        ":prefix": OPS_WRITES_PREFIX,
      },
      ProjectionExpression: "sk, #cnt",
      ExpressionAttributeNames: { "#cnt": "count" },
    })
  );

  let totalWrites = 0;
  for (const item of opsItems as Array<{ sk: string; count: number }>) {
    const epochStr = item.sk.replace(OPS_WRITES_PREFIX, "");
    const epoch = parseInt(epochStr, 10);
    if (!isNaN(epoch) && epoch >= windowStart && epoch <= nowS) {
      totalWrites += item.count ?? 0;
    }
  }

  const recentWriteRatePerSec = totalWrites / config.OPS_WINDOW_SEC;

  // Infer shard activity from aggregate rate (per DESIGN §4.5 note)
  const shardWritesRecent = Array.from({ length: SHARD_COUNT }, (_, i) => {
    // Distribute evenly as an approximation
    const base = Math.floor(recentWriteRatePerSec / SHARD_COUNT);
    const remainder = recentWriteRatePerSec % SHARD_COUNT;
    return i < Math.round(remainder) ? base + 1 : base;
  });

  return {
    participantCount,
    sseSubscriberCount,
    recentWriteRatePerSec,
    shardWritesRecent,
  };
}

// ---------------------------------------------------------------------------
// Snapshot (AP-19)
// ---------------------------------------------------------------------------

let snapshotSeq = 0;

/**
 * Compute the full snapshot for SSE emission.
 * Composes AP-9 + AP-12/14 + AP-16 + AP-18.
 */
export async function getSnapshot(
  eventId: string
): Promise<Snapshot> {
  const seq = ++snapshotSeq;
  const serverTs = Date.now();

  const event = await getEventById(eventId);
  if (!event) {
    return {
      v: 1,
      eventStatus: "CLOSED",
      activeMoment: null,
      leaderboard: [],
      serverTs,
      seq,
    };
  }

  let activeMomentData: Snapshot["activeMoment"] = null;
  let leaderboard: LeaderboardEntry[] = [];

  if (event.activeMomentId) {
    const moment = await getMomentById(eventId, event.activeMomentId);
    if (moment) {
      // Read tallies in parallel with leaderboard
      const [tally, lb] = await Promise.all([
        readMomentTallies(eventId, moment.momentId),
        moment.momentType === "TRIVIA"
          ? getLeaderboardTopN(eventId, 10)
          : Promise.resolve([]),
      ]);

      let words: WordCount[] | undefined;
      if (moment.momentType === "WORDCLOUD") {
        words = await getWordCounts(eventId, moment.momentId);
        words = words.slice(0, 50); // top 50 for live display
      }

      activeMomentData = {
        ...moment,
        tally: Object.keys(tally).length > 0 ? tally : undefined,
        words,
        leaderboard: lb.length > 0 ? lb : undefined,
      };
      leaderboard = lb;
    }
  } else if (event.status === "ACTIVE") {
    // No active moment but check if there are trivia results to show
    leaderboard = await getLeaderboardTopN(eventId, 10);
  }

  return {
    v: 1,
    eventStatus: event.status,
    activeMoment: activeMomentData,
    leaderboard,
    serverTs,
    seq,
  };
}

// ---------------------------------------------------------------------------
// Analytics summary
// ---------------------------------------------------------------------------

/**
 * Build the durable event summary.
 * All counts sourced from durable items — never from TTL'd REACTION# items.
 * AP-20.
 */
export async function getEventSummary(eventId: string): Promise<EventSummary | null> {
  const event = await getEventById(eventId);
  if (!event) return null;

  const client = getDocClient();

  // Get all moment items
  const { Items: momentItems = [] } = await client.send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `EVENT#${eventId}`,
        ":prefix": "MOMENT#",
      },
    })
  );

  const moments = momentItems as MomentItem[];

  // Unique participants
  const uniqueParticipants = await countParticipants(eventId);

  // Total interactions: all counter shards summed (poll votes + reactions + trivia)
  const { Items: counterItems = [] } = await client.send(
    new QueryCommand({
      TableName: getTableName(),
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `EVENT#${eventId}`,
        ":prefix": "COUNTER#",
      },
      ProjectionExpression: "sk, #cnt",
      ExpressionAttributeNames: { "#cnt": "count" },
    })
  );

  let totalInteractions = 0;
  for (const item of counterItems as Array<{ sk: string; count: number }>) {
    totalInteractions += item.count ?? 0;
  }

  // Word cloud top-5 per WORDCLOUD moment
  const wordClouds: EventSummary["wordClouds"] = [];
  for (const m of moments) {
    if (m.momentType === "WORDCLOUD") {
      const words = await getWordCounts(eventId, m.momentId);
      wordClouds.push({
        momentId: m.momentId,
        prompt: m.prompt ?? "",
        top5: words.slice(0, 5),
      });
    }
  }

  return {
    title: event.title,
    status: event.status,
    uniqueParticipants,
    totalInteractions,
    peakConcurrent: event.peakConcurrent,
    momentsLaunched: moments.length,
    wordClouds,
  };
}
