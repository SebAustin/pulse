/**
 * scripts/latency-probe.ts
 *
 * Measures end-to-end latency: vote submission -> tally visible on SSE stream.
 * Runs >= 30 trials and reports p50/p95/max.
 *
 * M3 hard gate: FAILS if measured p95 >= 2000 ms (PLAN §5.4).
 * Run with: npm run latency-probe
 */

process.env.PULSE_DB_MODE = "local";
process.env.PULSE_TABLE_NAME = process.env.PULSE_TABLE_NAME ?? "Pulse";
process.env.AWS_REGION = "us-east-1";
process.env.DYNAMODB_LOCAL_ENDPOINT =
  process.env.DYNAMODB_LOCAL_ENDPOINT ?? "http://localhost:8000";
process.env.SHARD_COUNT = "10";
process.env.JUDGING_WINDOW_DAYS = "30";
process.env.REACTION_TTL_SEC = "600";
process.env.OPS_WRITES_TTL_SEC = "60";
process.env.SSE_INTERVAL_MS = "1000";
process.env.SSE_CACHE_TTL_MS = "500";

const BASE = process.env.PROBE_BASE_URL ?? "http://localhost:3000";
const TRIALS = parseInt(process.env.PROBE_TRIALS ?? "30", 10);
const P95_LIMIT_MS = 2000;

/** Wait for the SSE stream to emit a snapshot with the given option count > 0. */
async function waitForTally(
  eventId: string,
  momentId: string,
  option: string,
  minCount: number,
  timeoutMs: number
): Promise<number> {
  const startTs = Date.now();

  return new Promise((resolve, reject) => {
    const deadline = setTimeout(
      () => reject(new Error(`Tally timeout after ${timeoutMs}ms`)),
      timeoutMs
    );

    const url = `${BASE}/api/stream/${eventId}`;
    let buffer = "";

    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.body) throw new Error("No body");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Parse SSE frames
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            if (!frame.includes("event: snapshot")) continue;
            const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const snap = JSON.parse(dataLine.slice(6)) as {
                activeMoment?: { momentId: string; tally?: Record<string, number> };
              };
              if (
                snap.activeMoment?.momentId === momentId &&
                (snap.activeMoment.tally?.[option] ?? 0) >= minCount
              ) {
                clearTimeout(deadline);
                controller.abort();
                resolve(Date.now() - startTs);
                return;
              }
            } catch { /* ignore parse errors */ }
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") reject(err);
      });
  });
}

async function runTrial(
  eventId: string,
  momentId: string,
  participantId: string,
  option: string,
  expectedCount: number
): Promise<number> {
  // Cast vote
  const res = await fetch(`${BASE}/api/votes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventId, momentId, participantId, option }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vote failed ${res.status}: ${body}`);
  }

  // Wait for tally to reflect the vote
  const latency = await waitForTally(eventId, momentId, option, expectedCount, 5000);
  return latency;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function main(): Promise<void> {
  console.log(`\nPulse Latency Probe`);
  console.log(`  Target: ${BASE}`);
  console.log(`  Trials: ${TRIALS}`);
  console.log(`  P95 gate: < ${P95_LIMIT_MS}ms\n`);

  // Set up a fresh event for probing
  const createRes = await fetch(`${BASE}/api/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Latency Probe Event" }),
  });
  if (!createRes.ok) throw new Error(`Create event failed: ${await createRes.text()}`);
  const { data: eventData } = await createRes.json() as { data: { eventId: string; hostToken: string } };
  const { eventId, hostToken } = eventData;

  // Launch a poll moment
  const momentRes = await fetch(`${BASE}/api/events/${eventId}/moments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      momentType: "MC",
      question: "Latency probe poll",
      options: ["A", "B"],
      hostToken,
    }),
  });
  if (!momentRes.ok) throw new Error(`Launch moment failed: ${await momentRes.text()}`);
  const { data: momentData } = await momentRes.json() as { data: { momentId: string } };
  const { momentId } = momentData;
  const option = "A";

  const latencies: number[] = [];

  for (let i = 0; i < TRIALS; i++) {
    const participantId = `u_probe_${i}`;
    const expectedCount = i + 1;

    try {
      const latency = await runTrial(eventId, momentId, participantId, option, expectedCount);
      latencies.push(latency);
      process.stdout.write(
        `  Trial ${i + 1}/${TRIALS}: ${latency}ms\r`
      );
    } catch (err) {
      console.error(`\n  Trial ${i + 1} failed:`, (err as Error).message);
      // Don't abort — continue with remaining trials
    }

    // Small delay between trials to avoid overwhelming DDB Local
    await new Promise((r) => setTimeout(r, 200));
  }

  latencies.sort((a, b) => a - b);

  console.log("\n\nResults:");
  console.log(`  Trials completed: ${latencies.length}/${TRIALS}`);
  if (latencies.length > 0) {
    console.log(`  p50: ${percentile(latencies, 50)}ms`);
    console.log(`  p95: ${percentile(latencies, 95)}ms`);
    console.log(`  max: ${latencies[latencies.length - 1]}ms`);
    console.log(`  min: ${latencies[0]}ms`);

    const p95 = percentile(latencies, 95);
    if (p95 >= P95_LIMIT_MS) {
      console.error(
        `\n✗ FAIL: p95 latency ${p95}ms >= ${P95_LIMIT_MS}ms gate. See PLAN §5.4 for remediation.`
      );
      process.exit(1);
    } else {
      console.log(`\n✓ PASS: p95 ${p95}ms < ${P95_LIMIT_MS}ms gate.`);
    }
  } else {
    console.error("\n✗ FAIL: No trials completed successfully.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Latency probe failed:", err);
  process.exit(1);
});
