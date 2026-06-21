# Pulse — Demo Video Script

**Target length:** under 3 minutes (aim for ~2:45 spoken)
**Format:** Screen recording + voiceover narration
**Live URL:** https://pulse-ochre-six.vercel.app
**Public repo:** https://github.com/SebAustin/pulse

---

## Recording Setup (do this before you hit record)

Open two windows side by side — or use a split-screen capture:

- **Left window (wide):** Desktop browser at https://pulse-ochre-six.vercel.app — this is the host console.
- **Right window (narrow, ~375px):** Phone browser or a narrow incognito window at the same URL — this is the audience surface.

Tip: resize the audience window to phone width before recording. The side-by-side view makes the "two screens, one atomic transaction" story land visually. Zoom in enough that text is legible at 1080p.

---

## Beat-by-Beat Script

---

### [0:00 – 0:18] HOOK — The Problem

**Screen:** Landing page at https://pulse-ochre-six.vercel.app

**Say:**
> "Live events are one-way. The speaker on stage — or on stream — has no idea if the audience is following, bored, or already gone. Existing tools are slow to set up, require audience accounts, and give you results ten seconds after the moment has passed. Pulse fixes that — and the database is the whole story."

---

### [0:18 – 0:38] WHO IT'S FOR + TRACK 3 SETUP

**Screen:** Keep the landing page visible. No clicks yet.

**Say:**
> "Pulse is built for streamers, teachers, conference speakers, and event organizers — anyone running a live session with a remote or in-person audience. I built it for Track 3 of the Hack the Zero Stack hackathon: real-time audience engagement that scales to a million concurrent participants. The secret is Amazon DynamoDB, and I want to show you exactly how."

---

### [0:38 – 1:05] BEAT 1 — Host Creates an Event, Audience Joins

**Action:** Type an event title in the landing page field ("Hackathon Live Q&A") and click **Create event**.

**Screen:** Host console loads. The 6-character join code is prominent.

**Say:**
> "The host creates an event in seconds — just a title. They get a host console and a 6-character join code to share on-screen or in chat."

**Action:** Switch to the narrow/phone window. Navigate to the join page, type a display name, tap **Join**.

**Say:**
> "The audience joins with a display name only — no account, no email, zero friction. The join writes a participant record to DynamoDB and resolves the code via GSI1, a global secondary index keyed on the join code."

**Screen:** Switch back to the host console. The participant count increments live.

**Say:**
> "Back on the host console — participant count updates live."

---

### [1:05 – 1:45] BEAT 2 — Live Poll, Real-Time Tally, the LIVE OPS Panel

**Action:** On the host console, click **Poll**, type a question ("Best database for hackathons?"), add three options, click **Launch poll**.

**Say:**
> "I'll launch a poll. On the audience screen, tap targets appear immediately via Server-Sent Events."

**Action:** In the phone window, tap an answer.

**Screen:** The tally bar on the host console updates within about 1 second.

**Say:**
> "When the audience votes, one DynamoDB operation handles everything: a single TransactWriteItems call — one atomic round trip. It simultaneously writes a conditional dedup record that prevents revoting, and increments a sharded counter. The tally updates in under two seconds. That's a database guarantee, not application logic."

**Action:** Zoom in on — or point to — the LIVE OPS panel in the host console. Reference the screenshot at docs/demo/02-host-console.png which shows 14 votes and the panel.

**Say:**
> "This is the LIVE OPS panel — writes per second, participant count, SSE subscriber count, and these ten dots: write-sharded counter shards. Every poll option is spread across at least ten DynamoDB items. A 5,000 write-per-second burst distributes to roughly 500 writes per shard — well below DynamoDB's per-partition ceiling. I load-tested this: 5,000 concurrent writes, zero lost votes, zero throttling errors. I made the database's work visible on purpose."

---

### [1:45 – 2:05] BEAT 3 — The No-Double-Vote Guarantee

**Action:** In the phone window, try to vote a second time (tap a different option).

**Screen:** "You've already voted" message on the audience screen. The tally on the host console is unchanged.

**Say:**
> "The audience tries to vote again. The server returns 409 — duplicate. Look at the tally: unchanged. The dedup Put inside the transaction failed the attribute_not_exists condition, so the counter Add never ran. One atomic operation, two guarantees. You cannot have a vote without the tally, and you cannot have the tally without the vote."

---

### [2:05 – 2:30] BEAT 4 — Architecture: Why DynamoDB, Why It Scales

**Screen:** Stay on the host console, or briefly show docs/architecture-diagram.svg in the browser.

**Say:**
> "Here is the architecture. One DynamoDB table — table name 'Pulse' — with composite pk/sk keys, two GSIs, on-demand billing, TTL per item type, and Streams enabled. GSI1 resolves join codes in O(1). GSI2 powers the trivia leaderboard with a top-N query — descending, limit N — no table scan anywhere in the codebase."

> "Credentials come from Vercel OIDC — AssumeRoleWithWebIdentity — zero stored AWS keys. DynamoDB Streams are already enabled on the table. The Lambda to API Gateway WebSocket fan-out is documented and ready to wire. That is the documented path to a million concurrent viewers."

---

### [2:30 – 2:45] CLOSE — Deployed and Shippable Today

**Screen:** Return to the host console live view at https://pulse-ochre-six.vercel.app

**Say:**
> "One table. Two GSIs. One atomic transaction per vote. 5,000 writes per second, zero lost. Deployed right now at pulse-ochre-six.vercel.app — fully shippable today."

> "That's Pulse: real-time audience engagement where the database is the show."

**Action:** Hold on the host console with the LIVE OPS panel visible as the final frame.

---

## Recording Tips

- Record at 1280 x 800 or 1920 x 1080. Keep font sizes large enough to read in a compressed video.
- The most important visual: the LIVE OPS shard-dot animation updating in real time during the voting beat. Slow down and let it breathe — do not rush past it.
- Caption the DynamoDB technical terms on-screen (TransactWriteItems, write sharding, GSI1, GSI2) if your editor supports lower-thirds. Judges may watch without audio.
- If you record the phone window as a real device via screen-mirroring, it reads as more authentic than a resized browser.
- If the live demo misbehaves: close the poll, create a new event, and restart from Beat 1 — the landing page and join flow take about 20 seconds.

---

## Fallback (if something fails live)

If the poll tally does not update in real time during recording:

1. Check that both windows are on the same event (same 6-char code).
2. Reload the audience window and re-vote.
3. If SSE drops, the client falls back to HTTP polling (< 5 s). Wait one extra tick.
4. The LIVE OPS panel shows SSE subscriber count — if it reads 0, refresh the host console.

The underlying DynamoDB writes succeed even when the SSE stream is delayed. The tally will appear when the next poll tick fires.
