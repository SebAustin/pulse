/**
 * SSE event serialisation helpers.
 *
 * Formats DynamoDB-derived snapshots into the SSE wire format
 * defined in PLAN §5.1 / DESIGN §4.
 */

import type { Snapshot } from "../dynamo/types";

/**
 * Serialise a snapshot to an SSE `event: snapshot` frame.
 *
 * Format:
 *   id: <seq>
 *   event: snapshot
 *   data: <JSON>
 *   (blank line)
 */
export function serialiseSnapshot(snapshot: Snapshot): string {
  const json = JSON.stringify(snapshot);
  return `id: ${snapshot.seq}\nevent: snapshot\ndata: ${json}\n\n`;
}

/**
 * Serialise a heartbeat comment to keep the connection alive
 * and prevent intermediaries from closing idle SSE streams.
 */
export function serialiseHeartbeat(): string {
  return `:hb\n\n`;
}

/**
 * Serialise a generic SSE event frame.
 */
export function serialiseEvent(event: string, data: string, id?: number): string {
  const idLine = id !== undefined ? `id: ${id}\n` : "";
  return `${idLine}event: ${event}\ndata: ${data}\n\n`;
}
