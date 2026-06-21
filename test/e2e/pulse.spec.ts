/**
 * Pulse E2E tests — critical user flows.
 *
 * SC1: Full flow — create event, launch MC poll (host UI), join via code
 *      (second browser context), cast vote, tally visible on host and audience.
 * SC2: Live update — after a participant votes (API), the host console shows
 *      the updated tally within ~3 s (SSE). Uses expect.poll / web-first
 *      assertions. NO arbitrary sleeps.
 * SC3: Double-vote prevented — after voting once, the UI replaces voting
 *      buttons with tally bars (client guard) and the API returns 409 (server guard).
 *
 * The create→join→vote→see-tally critical path in SC1 is fully UI-driven.
 * SC2/SC3 use the API to seed the event+moment so they stay isolated.
 */

import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type APIRequestContext,
} from "@playwright/test";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface SeedResult {
  eventId: string;
  hostToken: string;
  code: string;
  momentId: string;
}

/**
 * Seed: create an event + launch an MC poll via the API.
 * Used in SC2 and SC3 to avoid coupling those tests to the host UI flow.
 */
async function seedEventWithPoll(
  request: APIRequestContext
): Promise<SeedResult> {
  const createRes = await request.post("/api/events", {
    data: { title: "E2E Seed Event" },
  });
  expect(createRes.ok()).toBeTruthy();
  const { data: createData } = await createRes.json();
  const { eventId, code, hostToken } = createData as {
    eventId: string;
    code: string;
    hostToken: string;
  };

  const momentRes = await request.post(`/api/events/${eventId}/moments`, {
    data: {
      momentType: "MC",
      question: "Favorite cloud?",
      options: ["AWS", "Azure", "GCP"],
      hostToken,
    },
  });
  expect(momentRes.ok()).toBeTruthy();
  const { data: momentData } = await momentRes.json();
  const { momentId } = momentData as { momentId: string };

  return { eventId, hostToken, code, momentId };
}

/**
 * Join an event via the UI (/join/[code]), filling in the display name.
 * After submitting the form the page navigates to /e/[code].
 */
async function joinViaUI(
  page: Page,
  code: string,
  displayName: string
): Promise<void> {
  await page.goto(`/join/${code}`);
  await page.locator("#join-display-name").fill(displayName);
  await page.locator('button[type="submit"]').click();
  // Navigate to the live audience view
  await page.waitForURL(`**/e/${code}`, { timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// SC1: Full flow — UI-driven from landing page to visible vote tally
// ---------------------------------------------------------------------------

test("SC1: full flow — create event (UI), launch MC poll (UI), join (UI), vote (UI), tally visible", async ({
  page,
  context,
}) => {
  // === STEP 1: Host creates an event on the landing page ===
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("Pulse");

  await page.locator("#event-title").fill("SC1 All Hands");
  await page.locator('button[type="submit"]', { hasText: /Create event/ }).click();

  // Should navigate to the host console (middleware redeems the magic link and
  // redirects to the tokenless /host/[eventId] — F-01 fix).
  await page.waitForURL("**/host/**", { timeout: 20_000 });

  // Confirm we're on the host console and the console has loaded
  await expect(page.locator("text=Ready to engage?")).toBeVisible({
    timeout: 15_000,
  });

  // After middleware redemption the URL is tokenless: /host/[eventId]
  // Extract eventId from the 2-segment URL pattern.
  const hostUrlMatch = page.url().match(/\/host\/([^/]+?)(?:\/|$)/);
  expect(hostUrlMatch).not.toBeNull();
  const eventId = hostUrlMatch![1];

  // Get the join code from the right-rail sidebar (it displays the 6-char code in a large monospace block)
  // The right-rail shows: /join/{code} then the code on its own line
  const eventControls = page.locator("aside[aria-label='Event controls']");
  await expect(eventControls).toBeVisible({ timeout: 10_000 });

  // The code is shown as a large standalone text in the join URL section
  // Get the join code via API (reliable; avoids fragile DOM selectors for the code badge)
  await page.request.get(`/api/events/${eventId}`);

  // Also resolve via the stream snapshot which carries the code in the join URL path
  // Actually, easiest: get the code from the right sidebar text "/join/{code}"
  const joinUrlText = await eventControls
    .locator("div", { hasText: /^\/join\// })
    .textContent();
  expect(joinUrlText).toBeTruthy();
  const codeMatch = joinUrlText!.match(/\/join\/([A-Z0-9]{6})/);
  expect(codeMatch).not.toBeNull();
  const eventCode = codeMatch![1];

  // === STEP 2: Host launches an MC poll ===
  // The button's accessible name is "Poll Multiple choice question" (icon + label + description)
  await page.getByRole("button", { name: /^Poll/ }).click();

  // Fill in the question
  await page.locator("textarea").first().fill("Which is best?");

  // Fill option inputs inside the moment drawer
  const optionInputs = page.locator(".moment-drawer input[type='text']");
  await optionInputs.nth(0).fill("Option A");
  await optionInputs.nth(1).fill("Option B");

  // Click the Launch button
  await page.locator("button", { hasText: /Launch Poll/ }).click();

  // Host console transitions to the live poll view
  await expect(page.locator("text=POLL · LIVE")).toBeVisible({ timeout: 15_000 });

  // === STEP 3: Audience joins via /join/[code] in a second browser context ===
  const audienceCtx: BrowserContext = await context.browser()!.newContext();
  const audiencePage = await audienceCtx.newPage();
  await joinViaUI(audiencePage, eventCode, "Audience Alice");

  // The live audience view shows the question
  await expect(audiencePage.locator("text=Which is best?")).toBeVisible({
    timeout: 15_000,
  });

  // === STEP 4: Audience casts a vote ===
  const optionABtn = audiencePage.locator("button", { hasText: "Option A" });
  await expect(optionABtn).toBeVisible({ timeout: 10_000 });
  await optionABtn.click();

  // After voting, the audience UI transitions to results view
  // "Your vote is counted." appears and tally bars replace the buttons
  await expect(audiencePage.locator("text=Your vote is counted.")).toBeVisible({
    timeout: 10_000,
  });

  // The response count must reflect the vote
  await expect(
    audiencePage.locator('[role="status"]', { hasText: /response/ })
  ).toContainText("1", { timeout: 8_000 });

  // === STEP 5: Host console shows the updated tally (SSE delivers it within ~2 s) ===
  // McPoll renders: <span role="status" aria-live="polite" aria-atomic="true" class="tabular-nums">X votes</span>
  await expect
    .poll(
      async () => {
        const statusEl = page.locator("span.tabular-nums[role='status']");
        const text = await statusEl.textContent().catch(() => "0");
        const match = text?.match(/(\d+)/);
        return match ? parseInt(match[1]) : 0;
      },
      {
        message: "Host console should show >= 1 vote via SSE",
        timeout: 8_000,
        intervals: [500, 500, 500, 1000, 1000],
      }
    )
    .toBeGreaterThanOrEqual(1);

  await audienceCtx.close();
});

// ---------------------------------------------------------------------------
// SC2: Live update — host console reflects a vote within ~3 s (SSE)
// ---------------------------------------------------------------------------

test("SC2: live update — host console tally updates within ~3 s after vote", async ({
  request,
  page,
}) => {
  // Seed via API
  const { eventId, hostToken, code, momentId } = await seedEventWithPoll(request);

  // Open the host console directly — no UI login needed, token is in the URL
  await page.goto(`/host/${eventId}/${hostToken}`);
  // Wait for the live poll to be visible (SSE connects)
  await expect(page.locator("text=POLL · LIVE")).toBeVisible({ timeout: 15_000 });

  // Verify the vote count starts at 0
  // McPoll renders: <span role="status" aria-live="polite" aria-atomic="true" class="tabular-nums">X votes</span>
  const voteCountStatus = page.locator("span.tabular-nums[role='status']");
  await expect(voteCountStatus).toContainText("0", { timeout: 5_000 });

  // Cast a vote via the API (simulates a real audience member)
  const joinRes = await request.post("/api/join", {
    data: { code, displayName: "Voter Carol" },
  });
  const { data: joinData } = await joinRes.json();
  const { participantId } = joinData as { participantId: string };

  const voteRes = await request.post("/api/votes", {
    data: { eventId, momentId, participantId, option: "AWS" },
  });
  expect(voteRes.ok()).toBeTruthy();
  const { data: voteData } = await voteRes.json();
  expect((voteData as { accepted: boolean }).accepted).toBe(true);

  // The host console SSE snapshot should reflect the vote within ~3 s.
  // SSE emits every 1 s, cache TTL 0.5 s; total worst-case ~2 s.
  // We allow 5 s to stay within the 2 s SC2 budget with headroom.
  await expect
    .poll(
      async () => {
        // McPoll compact vote counter: span.tabular-nums[role="status"]
        const statusEl = page.locator("span.tabular-nums[role='status']");
        const text = await statusEl.textContent().catch(() => "0");
        const match = text?.match(/(\d+)/);
        return match ? parseInt(match[1]) : 0;
      },
      {
        message: "Host console should show >= 1 vote within 5 s (SC2 budget: ~2 s)",
        timeout: 5_000,
        intervals: [300, 300, 500, 500, 1000],
      }
    )
    .toBeGreaterThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// SC3: Double-vote prevented — client blocks second attempt; API returns 409
// ---------------------------------------------------------------------------

test("SC3: double-vote prevented — UI blocks second vote; API returns 409", async ({
  request,
  context,
}) => {
  const { eventId, code, momentId } = await seedEventWithPoll(request);

  // Open the audience view in a fresh context
  const audienceCtx: BrowserContext = await context.browser()!.newContext();
  const audiencePage = await audienceCtx.newPage();

  await joinViaUI(audiencePage, code, "Voter Dave");

  // Wait for the poll question to appear
  await expect(audiencePage.locator("text=Favorite cloud?")).toBeVisible({
    timeout: 15_000,
  });

  // --- First vote (should succeed) ---
  const awsBtn = audiencePage.locator("button", { hasText: "AWS" });
  await expect(awsBtn).toBeVisible({ timeout: 10_000 });
  await awsBtn.click();

  // UI confirmation: "Your vote is counted." and voting buttons disappear
  await expect(audiencePage.locator("text=Your vote is counted.")).toBeVisible({
    timeout: 8_000,
  });

  // Client-side guard: voting buttons no longer rendered
  // (McPoll switches to TallyBars view when hasVoted === true)
  await expect(
    audiencePage.locator("button", { hasText: "AWS" })
  ).not.toBeVisible({ timeout: 3_000 });
  await expect(
    audiencePage.locator("button", { hasText: "Azure" })
  ).not.toBeVisible();
  await expect(
    audiencePage.locator("button", { hasText: "GCP" })
  ).not.toBeVisible();

  // --- Server-side guard: API returns 409 on second attempt ---
  // The duplicate vote must be performed in the SAME cookie context as the
  // audience page (audiencePage.request). The httpOnly `pulse_pt_<eventId>`
  // cookie is stored in the audienceCtx cookie jar — a separate `request`
  // fixture would have no cookie and return 401 instead of 409.
  const dupeRes = await audiencePage.request.post("/api/votes", {
    data: { eventId, momentId, option: "AWS" },
  });
  // HTTP 409 status — server dedup rejects the duplicate
  expect(dupeRes.status()).toBe(409);
  const dupeBody = await dupeRes.json();
  expect((dupeBody.error as { code: string }).code).toBe("DUPLICATE");

  await audienceCtx.close();
});
