/**
 * GET /api/stream/[eventId] — SSE live snapshot stream.
 *
 * Primary real-time transport (F-03.1).
 * Emits a `snapshot` event every SSE_INTERVAL_MS, heartbeat every ~10s.
 * Each tick refreshes the connection's presence item (PLAN §8).
 *
 * Query param ?once=1: returns a single snapshot for the polling fallback (F-03.2).
 *
 * PLAN §5.1, AP-19, AP-21.
 */

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max per Vercel Route Handler

import { nanoid } from "nanoid";
import { getSnapshot, upsertPresence, updatePeakConcurrent, countLivePresence } from "@/lib/dynamo/repository";
import { getCachedSnapshot, setCachedSnapshot } from "@/lib/sse/snapshot-cache";
import { serialiseSnapshot, serialiseHeartbeat } from "@/lib/sse/serialise";
import { config } from "@/lib/config";
import { log } from "@/lib/observability/log";

type Params = { params: Promise<{ eventId: string }> };

export async function GET(
  req: Request,
  { params }: Params
): Promise<Response> {
  const { eventId } = await params;
  const url = new URL(req.url);
  const once = url.searchParams.get("once") === "1";

  // ------- ?once=1 polling fallback -------
  if (once) {
    try {
      let snapshot = getCachedSnapshot(eventId);
      if (!snapshot) {
        snapshot = await getSnapshot(eventId);
        setCachedSnapshot(eventId, snapshot);
      }
      return new Response(JSON.stringify({ ok: true, data: snapshot }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      log.error("SSE once snapshot failed", {
        eventId,
        errorType: (err as Error).name,
      });
      return new Response(
        JSON.stringify({ ok: false, error: { code: "INTERNAL", message: "Snapshot failed" } }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // ------- SSE streaming path -------
  const connId = `c_${nanoid(8)}`;
  const role = url.searchParams.get("role") === "host" ? "HOST" : "AUDIENCE";

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(text: string): void {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // Connection closed; stop silently
        }
      }

      // Register presence on open
      try {
        await upsertPresence({ eventId, connId, role });
      } catch (err) {
        log.warn("presence upsert on open failed", {
          eventId,
          errorType: (err as Error).name,
        });
      }

      let tickCount = 0;
      const HEARTBEAT_EVERY = Math.ceil(10_000 / config.SSE_INTERVAL_MS);

      const tick = async (): Promise<void> => {
        tickCount++;

        // Heartbeat every ~10 seconds (keeps connection alive)
        if (tickCount % HEARTBEAT_EVERY === 0) {
          send(serialiseHeartbeat());
          // Refresh presence on heartbeat tick (PLAN §8)
          upsertPresence({ eventId, connId, role }).catch(() => {});
        }

        // Compute snapshot (with micro-cache)
        let snapshot = getCachedSnapshot(eventId);
        if (!snapshot) {
          try {
            snapshot = await getSnapshot(eventId);
            setCachedSnapshot(eventId, snapshot);
          } catch (err) {
            log.warn("snapshot computation failed", {
              eventId,
              errorType: (err as Error).name,
            });
            return; // skip this tick
          }
        }

        send(serialiseSnapshot(snapshot));

        // Update peak concurrent on every snapshot (monotonic, best-effort)
        if (tickCount % HEARTBEAT_EVERY === 0) {
          countLivePresence(eventId)
            .then((live) => updatePeakConcurrent(eventId, live))
            .catch(() => {});
        }

        // Stop streaming closed events after notifying the client once
        if (snapshot.eventStatus === "CLOSED") {
          try { controller.close(); } catch { /* already closed */ }
        }
      };

      // Send first snapshot immediately
      await tick();

      // Then emit on interval
      const interval = setInterval(() => {
        tick().catch((err) => {
          log.warn("SSE tick error", { eventId, errorType: (err as Error).name });
        });
      }, config.SSE_INTERVAL_MS);

      // Clean up when the client disconnects
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}
