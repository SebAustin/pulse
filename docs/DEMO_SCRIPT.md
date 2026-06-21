# Pulse — Demo Video Script

**Target length:** < 3 minutes  
**Format:** Screen recording + voiceover  
**Key requirement:** Show DynamoDB — name it, explain the single-table + sharding design, show the OpsReadout

---

## Setup Before Recording

1. Have two browser windows open: one for the host console, one in a private/incognito window for the audience.
2. DDB Local is running (`npm run ddb:up`) or the Vercel production deployment is ready.
3. On a separate device (phone or second monitor), open a third browser for a more compelling "second screen" demo.
4. The seed event is either pre-created or you will create one live.

---

## Beat-by-Beat Script

---

### [0:00 – 0:25] — The Problem

**Screen:** Landing page at `localhost:3000` (or production URL)

**Voiceover:**

> "Live events are one-way. The speaker on stage — or on stream — has no idea if the audience is engaged, confused, or already on Twitter. Existing tools make the audience create an account, or give you results ten seconds after the moment has passed. Pulse fixes that."

> "I built Pulse for Track 3 of the Hack the Zero Stack hackathon: real-time audience engagement that scales to a million concurrent participants. The secret is the database — Amazon DynamoDB — and I want to show you exactly how."

---

### [0:25 – 0:55] — Host Creates an Event / Audience Joins

**Action:** On the host browser, type an event title and click "Create event."

**Voiceover:**

> "The host creates an event — just a title, nothing else. They get a 6-character join code and a host console URL."

**Show:** The host console loads. Point to the join code displayed prominently.

**Action:** Switch to the incognito/phone browser, navigate to `/join/<code>`, enter a display name, and join.

**Voiceover:**

> "The audience joins in seconds — display name only. No account, no friction. The join writes a participant record to DynamoDB and resolves the code via GSI1 — a global secondary index keyed on the join code."

**Show:** Back on the host console, the participant count increments live.

---

### [1:00 – 1:40] — Live Poll: The Database is the Show

**Action:** On the host console, click "Poll," fill in a question with 3–4 options, and click "Launch poll."

**Voiceover:**

> "Now I'll launch a poll. On the audience screen, three tap targets appear instantly via Server-Sent Events."

**Action:** On the audience/phone browser, tap an answer option.

**Voiceover:**

> "When the audience votes, one DynamoDB operation handles everything: a single `TransactWriteItems` call writes a conditional dedup record — so they can never vote twice — AND increments a sharded counter. This is one atomic guarantee. The vote and the tally can never diverge."

**Show:** The tally bar on the host console updates (< 2 s after the vote).

**Action:** Point to (or zoom in on) the **OpsReadout** panel in the left rail.

**Voiceover:**

> "This is the OpsReadout — a judge-facing live ops panel. It shows writes per second, participant count, SSE subscriber count, and these 10 dots: the write-sharded counter shards. Every poll option is split across at least 10 DynamoDB items. A 5,000 write-per-second burst is distributed to ~500 writes per shard — well below DynamoDB's per-partition ceiling. I load-tested this: 5,000 concurrent writes, zero lost votes, zero throttling errors."

---

### [1:40 – 2:05] — No-Double-Vote Guarantee

**Action:** On the audience browser, try to vote a second time on the same poll (click a different option).

**Voiceover:**

> "The audience tries to vote again. The server returns 409 — duplicate. Look at the tally: it didn't change. The count stays exactly right because the dedup Put inside the transaction failed, so the counter Add never ran. This is a database guarantee, not application logic."

**Show:** The "You've already voted" message on the audience screen. The tally unchanged on the host console.

---

### [2:05 – 2:35] — Architecture in 30 Seconds

**Screen:** Show the ARCHITECTURE.md diagram (open in a browser or share screen)

**Voiceover:**

> "Here's the architecture. Browsers talk to Next.js Route Handlers on Vercel — those handlers validate all input with Zod and authorize host actions. They never expose DynamoDB to the client. Production credentials come from Vercel OIDC — `AssumeRoleWithWebIdentity` — zero stored AWS keys anywhere."

> "The single DynamoDB table has two GSIs: GSI1 resolves join codes to events, GSI2 powers the leaderboard with a top-N query — descending, limit N, no table scan. DynamoDB Streams are already enabled on the table. The Lambda to API Gateway WebSocket fan-out is documented and ready to wire — that's the million-scale path."

---

### [2:35 – 3:00] — Scale Story and Close

**Screen:** Return to the host console

**Voiceover:**

> "Pulse is Track 3. The design choices — single-table, write-sharded counters, atomic transactions, OIDC credentials — come from the scale requirement, not the other way around. The OpsReadout makes that visible to anyone watching."

> "One table. Two GSIs. One atomic transaction per vote. 5,000 writes per second, zero lost. That's Pulse."

**Action:** Click "End event" on the host console. The analytics summary page loads.

**Voiceover:**

> "The host gets a summary: participants, total interactions, peak concurrent, top words. All sourced from durable DynamoDB items — nothing TTL-expired — stable for the judging window."

**End screen:** Show the Pulse landing page with the product name.

---

## Recording Tips

- Use 1280 × 800 or 1920 × 1080. Keep font sizes large enough to read.
- Record the OpsReadout shard-dot animation during the voting segment — it's the visual centerpiece.
- If live DDB latency is < 1 s, let it speak for itself without rushing past it.
- The audience-joins-on-phone shot is high-impact — use a phone or a narrow browser window to simulate it.
- Caption the DynamoDB technical terms (TransactWriteItems, write sharding, GSI) on screen if possible — judges may not watch with audio.
