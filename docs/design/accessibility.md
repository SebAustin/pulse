# Pulse — Accessibility Specification

> WCAG 2.1 AA target. This is a checklist and reference for the builder.
> Requirements are marked [REQUIRED] for AA compliance or [ENHANCED] for above-minimum.

---

## Contrast Ratios — Verification Checklist

Run these pairs through the Accessible Colors tool or axe DevTools before submission.
Target: ≥ 4.5:1 for normal text (< 18px regular or < 14px bold), ≥ 3:1 for large text and UI components.

### Host Console (dark surface)

| Foreground | Background | Ratio (design intent) | Status |
|---|---|---|---|
| `--color-text-primary` (L 96%) | `--color-bg-base` (L 8%) | ≈ 16:1 | [REQUIRED] |
| `--color-text-secondary` (L 70%) | `--color-bg-base` (L 8%) | ≈ 5.5:1 | [REQUIRED] |
| `--color-accent-primary` (L 68%) | `--color-bg-base` (L 8%) | ≈ 4.6:1 | [REQUIRED] — verify exact value |
| `--color-status-live` (L 80%) | `--color-bg-base` (L 8%) | ≈ 7.5:1 | [REQUIRED] |
| `--color-status-error` (L 62%) | `--color-bg-base` (L 8%) | ≈ 4.7:1 | [REQUIRED] |
| White text | `--color-accent-primary` button | ≈ 4.6:1 | [REQUIRED] — borderline, verify |
| `--color-text-primary` | `--color-surface-raised` (L 13%) | ≈ 12:1 | [REQUIRED] |
| `--color-text-secondary` | `--color-surface-raised` (L 13%) | ≈ 4.5:1 | [REQUIRED] — verify |
| `--color-accent-secondary` (amber, L 80%) | `--color-bg-base` | ≈ 7.2:1 | [REQUIRED] |

### Audience Surface (light)

| Foreground | Background | Ratio (design intent) | Status |
|---|---|---|---|
| `--color-text-audience-primary` (L 12%) | `--color-bg-audience` (L 98%) | ≈ 14:1 | [REQUIRED] |
| `--color-text-audience-secondary` (L 42%) | `--color-bg-audience` (L 98%) | ≈ 5.2:1 | [REQUIRED] |
| `--color-accent-audience` (L 60%) | `--color-bg-audience` (L 98%) | ≈ 4.8:1 | [REQUIRED] |
| White text | `--color-accent-audience` button | ≈ 5.0:1 | [REQUIRED] |
| `--color-text-audience-primary` | `--color-surface-audience` (L 95%) | ≈ 11:1 | [REQUIRED] |

**NOTE:** OKLCH contrast ratios must be verified with a tool that understands OKLCH — do not rely on hex-converted approximations. Use the `--color-contrast()` CSS function in dev or a browser-based OKLCH contrast tool.

---

## Keyboard Navigation — Page-Level Requirements

### All Pages

- [REQUIRED] First focusable element is a skip-link: `<a href="#main-content">Skip to main content</a>`.
- [REQUIRED] Tab order follows visual reading order (left to right, top to bottom). No `tabindex` values other than `0` and `-1`.
- [REQUIRED] All interactive elements are reachable by keyboard Tab.
- [REQUIRED] No keyboard traps except inside open modal/drawer (which must have Escape to close).

### Host Console

- [REQUIRED] The MomentConfigDrawer traps focus while open (Tab cycles through form fields and buttons only). Escape closes it and returns focus to the card that opened it.
- [REQUIRED] When an active moment is closed, focus moves to the "New Moment" heading or first moment card.
- [REQUIRED] The "End event" button should be the last focusable element in the page (or near it). Confirm prompt before execution.

### Audience View

- [REQUIRED] After submitting a vote, focus moves to the confirmation message or the result area.
- [REQUIRED] When the active moment changes (SSE), focus does not move automatically (to avoid disorientation). The live region announces the change, but the user controls focus.
- [REQUIRED] Emoji buttons (80×80 px circles) must be reachable and activatable by keyboard (Enter / Space). Each button has `aria-label="[emoji name]"` e.g. `aria-label="Fire"`.

---

## ARIA Roles and Labels — Full Reference

### Structural

```html
<header>
  <nav aria-label="Host controls">...</nav>
</header>
<main id="main-content">
  <section aria-labelledby="moment-heading">
    <h2 id="moment-heading">Active Moment</h2>
    ...
  </section>
</main>
```

### Live Regions

```html
<!-- Participant count — updates via SSE -->
<span role="status" aria-live="polite" aria-atomic="true">
  <span class="sr-only">Active participants: </span>
  <span id="participant-count">83</span>
</span>

<!-- Error messages — appears on network failure or API error -->
<div role="alert" aria-live="assertive" aria-atomic="true" id="error-region">
  <!-- Injected when error occurs; cleared on dismiss -->
</div>

<!-- Poll update announcement — do not announce every tick; debounce to once per 3s -->
<span role="status" aria-live="polite" aria-atomic="true" class="sr-only" id="poll-announce">
  <!-- Updated by JS: "Poll results: Next.js 51%, Remix 29%, SvelteKit 14%, Astro 6%" -->
</span>

<!-- Connection status -->
<span role="status" aria-live="polite" aria-atomic="true">
  <span class="sr-only" id="connection-label">Live</span>
</span>

<!-- Trivia: only announce at checkpoints -->
<div role="alert" aria-live="assertive" class="sr-only" id="trivia-announce">
  <!-- Injected once at 10s: "10 seconds remaining" -->
  <!-- Injected once at 0s: "Time's up!" -->
</div>
```

### Poll Options (Audience — before vote)

```html
<fieldset>
  <legend>Which framework are you most excited about in 2026?</legend>
  <ul role="list">
    <li>
      <button
        class="poll-option"
        aria-pressed="false"
        data-option-id="opt-1"
      >
        Next.js
      </button>
    </li>
    <!-- ... -->
  </ul>
</fieldset>
```

After vote — replace buttons with result display:

```html
<ul role="list" aria-label="Poll results">
  <li>
    <div
      class="result-row"
      aria-label="Next.js: 42 votes, 51 percent"
    >
      <span class="result-label">Next.js</span>
      <div class="poll-bar-track" role="none" aria-hidden="true">
        <div class="poll-bar-fill poll-bar-fill--lead" style="--target-scale: 0.51"></div>
      </div>
      <span class="result-count" aria-hidden="true">51%</span>
    </div>
  </li>
</ul>
<p aria-live="polite" aria-atomic="true">
  <span id="total-votes">83</span> responses
</p>
```

### Emoji Buttons (Audience)

```html
<section aria-label="Send a reaction">
  <ul role="list" class="emoji-grid">
    <li>
      <button class="emoji-btn" aria-label="Fire" aria-describedby="fire-count">
        🔥
        <span class="emoji-count" id="fire-count">1 247</span>
      </button>
    </li>
    <!-- ... -->
  </ul>
</section>
```

### Leaderboard

```html
<section aria-label="Leaderboard">
  <ol role="list">
    <li data-participant-id="p-001" aria-label="1st place: Alex Chen, 980 points">
      <span class="rank" aria-hidden="true">1</span>
      <span class="name">Alex Chen</span>
      <span class="score" aria-hidden="true">980</span>
    </li>
    <!-- ... -->
  </ol>
  <!-- Screen reader announcement when leaderboard updates -->
  <span role="status" aria-live="polite" aria-atomic="true" class="sr-only" id="lb-announce">
    <!-- Updated by JS: "Leaderboard updated. Alex Chen leads with 980 points." -->
  </span>
</section>
```

### Word Cloud

```html
<section aria-label="Word cloud">
  <!-- Visual cloud is aria-hidden -->
  <div class="word-cloud-visual" aria-hidden="true">
    <!-- Canvas or positioned divs -->
  </div>
  <!-- Screen reader list -->
  <ul
    role="list"
    aria-label="Most submitted words"
    aria-live="polite"
    class="sr-only"
  >
    <li>real-time: 23 submissions</li>
    <li>fast: 19 submissions</li>
    <!-- top 10 -->
  </ul>
</section>
```

---

## Touch Target Sizes — Checklist

| Component | Minimum size | Target size | WCAG criterion |
|---|---|---|---|
| Poll option card (audience) | 44 × 44 px | Full width × 56px | WCAG 2.5.8 |
| Emoji reaction button | 44 × 44 px | 80 × 80 px (circle) | WCAG 2.5.8 |
| Join button | 44 × 44 px | Full width × 56px | WCAG 2.5.8 |
| "Create event" button | 44 × 44 px | Full width × 48px | WCAG 2.5.8 |
| Trivia answer card | 44 × 44 px | Full width × 56px | WCAG 2.5.8 |
| "Close moment" button | 44 × 44 px | ≥ 160 × 44px | WCAG 2.5.8 |
| MomentType card (host) | 44 × 44 px | 200 × 140px | WCAG 2.5.8 |
| Close (×) buttons | 44 × 44 px | 44 × 44px minimum | WCAG 2.5.8 |

[REQUIRED] Gap between adjacent touch targets: minimum 8 px.

---

## Screen Reader Testing Script

Before submission, run through this script with VoiceOver (macOS/iOS) or NVDA (Windows):

1. **Landing page:** Navigate to page. Verify heading structure (h1: "Pulse"). Tab to event create form. Enter title. Submit. Verify "Creating…" is announced. Verify redirect announces new page.
2. **Host console:** Verify event title announced as h1. Tab to participant count — verify number announced. Trigger a moment. Verify the active moment panel has a heading. Tab to "Close moment" — verify button label is clear.
3. **Audience join:** Navigate to `/join`. Verify "Join code" label. Enter code. Enter name. Submit. Verify redirect.
4. **Audience lobby:** Verify event title announced. Verify "Waiting for something to start" text is present.
5. **Active poll (audience):** Verify fieldset legend is the poll question. Tab through options. Select one. Verify "Your vote is counted" is announced. Verify results are accessible via `aria-label` on result rows.
6. **Emoji reactions:** Verify section label "Send a reaction". Verify individual button labels ("Fire", "Heart", etc.). Activate one. Verify count updates are not too frequent (debounce to 3s).
7. **Leaderboard:** Verify ordered list. Verify each item's aria-label includes rank, name, and score.
8. **Connection lost:** Kill the network. Verify status changes to "Offline" and is announced via `role="status"`.
