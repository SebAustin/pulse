# Pulse — Design Specification

> Version 1.0 · 2026-06-20
> Status: APPROVED — builder may implement directly from this document.

---

## Table of Contents

1. [Visual Direction and Principles](#1-visual-direction-and-principles)
2. [User Flows](#2-user-flows)
3. [Information Architecture and Screen Inventory](#3-information-architecture-and-screen-inventory)
4. [Component Specifications](#4-component-specifications)
5. [Design Tokens — CSS Variables](#5-design-tokens--css-variables)
6. [States Reference](#6-states-reference)
7. [Accessibility Requirements](#7-accessibility-requirements)
8. [Motion Specification](#8-motion-specification)

---

## 1. Visual Direction and Principles

### Direction: Live Broadcast / Control Room

Pulse is software for moments that are already happening — the poll goes up *while* the talk is mid-sentence, the emoji burst fires *while* the crowd is reacting. The aesthetic should match that energy. The **host console** reads like a broadcast control room: dark, high-contrast surfaces, data glowing in electric violet and neon lime, grid-ruled layouts that feel operational rather than decorative. Every live counter and throughput readout is the visual proof that DynamoDB's write-sharded backend is doing real work right now. The **audience view** inverts this: it is a bright, warm, almost ephemeral surface — white with vivid moment-specific color — optimised for a phone held in one hand in a noisy room. The audience view must be legible in sunlight and operable with a thumb without scrolling. The two surfaces are deliberately different because the two personas are in different environments at the same time.

### Design Principles

1. **Database behavior is part of the show.** The ops readout, shard-counter pulse, and write-throughput ticker are not debugging tools — they are designed features that make the hackathon's technical ambition visible to judges and audiences.
2. **Hierarchy over decoration.** Event title at display scale, moment content at title scale, aggregate data at body scale. Nothing is equally weighted.
3. **Real states, not just happy paths.** Every component has explicit loading (skeleton), empty, error, and disabled states that are designed to the same quality bar as the active state.
4. **Motion clarifies, never decorates.** Bars animate to their new value. Emoji float upward and fade. The leaderboard reorders with a spring. `prefers-reduced-motion` replaces all of this with a crossfade or instant swap — the data is always legible, motion is an enhancement.
5. **Audience friction is zero.** The join flow is one screen. The participation flow is one tap or one word. If an audience member sees more than three interactive elements at once, the design has failed.
6. **Responsive from 320 px up, mobile-first for audience.** The host console is desktop-optimised (≥ 1024 px) but degrades gracefully to tablet. The audience view is built at 375 px and scales up, never down.

---

## 2. User Flows

### Flow A — Host: Create and Run an Event

```
Landing (/)
  │
  ├─[Enter event title, click "Create event"]
  │
  ▼
Host Console (/host/[eventId]/[hostToken])
  │   • Event title + join code displayed prominently
  │   • Shareable link + QR placeholder
  │   • Ops readout (live writes/s, participant count)
  │   • "Waiting for audience..." empty state until first join
  │
  ├─[Audience joins → participant count increments live]
  │
  ├─[Click "New Moment" → Moment Picker overlay]
  │   │
  │   ├─ Select Poll → Fill poll form → Launch
  │   ├─ Select Word Cloud → Fill prompt → Launch
  │   ├─ Select Emoji Reaction → Launch immediately
  │   └─ Select Trivia → Fill question + timer → Launch
  │
  ├─[Active Moment Panel replaces picker]
  │   • Live results update in real time
  │   • Host sees current tally / cloud / burst counts / leaderboard
  │   • "Close Moment" button ends it
  │
  ├─[Repeat: Launch more moments as needed]
  │
  └─[Click "End Event"]
        │
        ▼
      Analytics Summary (/host/[eventId]/[hostToken]/summary)
        • Total participants, total interactions, peak concurrent
        • Top 5 per word cloud
        • Per-moment breakdown
        • Share / export link (stable URL)
```

### Flow B — Audience: Join and Participate

```
Entry point (scan QR / follow link / type code)
  │
  ▼
Join Screen (/join  OR  /join/[code])
  │   • Code pre-filled if link used
  │   • Display name input (max 32 chars)
  │   • "Join" button
  │
  ▼
Audience Lobby (/e/[code])
  │   • Event title
  │   • "Waiting for the host to start something..." idle state
  │   • Connection status indicator (top-right corner)
  │
  ├─[SSE push: moment activated]
  │
  ▼
Active Moment View (replaces lobby content in-place, no route change)
  │
  ├─ Poll: 2–6 answer options as tappable cards → vote → see live bars
  ├─ Word Cloud: text input → submit → see live cloud update
  ├─ Emoji Reaction: 6 large emoji buttons → tap freely → watch burst
  └─ Trivia: countdown timer + answer cards → select → score revealed
  │
  ├─[Moment closed by host → result state, then back to idle]
  │
  └─[Event ended by host]
        │
        ▼
      Closed State (/e/[code] — ended overlay)
        • "Thanks for being part of [Event Title]"
        • No further interaction possible
```

### Flow C — Direct Code Entry (No Link)

```
Landing (/)
  │
  └─[Click "Join with a code"]
        │
        ▼
      /join
        • 6-character code input (large, auto-uppercase)
        • Display name input
        → same as Flow B from Join Screen
```

---

## 3. Information Architecture and Screen Inventory

### Route Map

| Route | Persona | Purpose | Key Components |
|---|---|---|---|
| `/` | Both | Landing — create event OR join with code | EventCreateForm, JoinCodeInput, Hero headline |
| `/host/[eventId]/[hostToken]` | Host | Live console — manage event, launch moments, watch results | ConsoleHeader, OpsReadout, MomentLauncher, ActiveMomentPanel, ParticipantCount, ConnectionStatus |
| `/host/[eventId]/[hostToken]/summary` | Host | Post-event analytics | AnalyticsSummary, WordCloudTopWords, MomentBreakdown |
| `/join` | Audience | Join by manual code entry | JoinScreen |
| `/join/[code]` | Audience | Join with pre-filled code (from link/QR) | JoinScreen (code pre-filled) |
| `/e/[code]` | Audience | Live audience participation view | AudienceLobby, ActiveMomentView (poll / word cloud / emoji / trivia), ConnectionStatus, ClosedEventOverlay |

### Screen Descriptions

#### `/` — Landing

Two-column layout on desktop (≥ 1024 px). Left: product name "Pulse" at display scale, one-sentence description, EventCreateForm. Right: JoinCodeInput with "Already have a code?" label and a small divider line. On mobile: stacked, create form first, join form second with a horizontal rule between.

The hero does not use a gradient blob or centered CTA. Instead, the background is near-black (`--color-bg-base`) with a single horizontal scan-line rule (`--color-border-subtle`) dividing the two halves, evoking a broadcast split-screen. The word "Pulse" uses the display typeface at `--text-hero` size with a vivid violet underline `2px solid --color-accent-primary`.

#### `/host/[eventId]/[hostToken]` — Host Console

Three-column layout (desktop ≥ 1280 px):
- Left rail (240 px): Event metadata (title, join code, shareable link), ParticipantCount, OpsReadout
- Center (flex-1): ActiveMomentPanel or MomentLauncher when no moment is active
- Right rail (280 px): ConnectionStatus, moment history log (last 5 closed moments with their top result)

On 768–1279 px (tablet): two columns — left rail collapses to a top bar; right rail becomes a bottom drawer.

On < 768 px (mobile): single column; host console is not the primary mobile use case but must not break.

The console background is `--color-bg-base` (very dark). All panels are `--color-surface-raised`. Data values glow with `--color-accent-primary` (electric violet). Correct/live indicators use `--color-status-live` (neon lime). The OpsReadout component is placed in the left rail, always visible while the event is running.

#### `/host/[eventId]/[hostToken]/summary` — Analytics Summary

Single-column, max-width 860 px, centered. Top: key metric row (4 stat cards). Below: per-moment accordion (each moment collapsed by default, expandable to show full result). Word-cloud moments show the top 5 terms as a horizontal bar chart (not a visual cloud — more readable as a stat). Trivia moments show final leaderboard top 10.

#### `/join` and `/join/[code]` — Join Screen

Audience surface. Bright background (`--color-bg-audience`). Full-viewport single card centered. Event title shown prominently above the form if already known from the code. Two inputs: code (hidden if pre-filled and valid), display name. One large primary button. Error state if code not found or event ended.

#### `/e/[code]` — Audience View

Bright background. Header bar: event title (truncated at 1 line), connection status dot (top right). Below header: moment content (takes full remaining viewport height, scroll-locked). No persistent navigation — the host drives all state transitions via SSE.

---

## 4. Component Specifications

---

### 4.1 EventCreateForm

**Location:** Landing page `/`, left column.

**Purpose:** Create a new event. On submit, calls `POST /api/events`, receives `{ eventId, hostToken, joinCode }`, redirects to host console.

**Layout:**

```
┌─────────────────────────────────────────┐
│  [Label] Event title                    │
│  ┌───────────────────────────────────┐  │
│  │  "My Q3 All-Hands"               │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │    Create event  →              │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [Loading state replaces button]        │
└─────────────────────────────────────────┘
```

**States:**

- **Default:** Input unfocused, button enabled.
- **Focus:** Input border changes to `--color-accent-primary`, `2px` offset focus ring.
- **Filled / ready:** Button becomes `--color-accent-primary` background.
- **Loading:** Button text replaced with animated ellipsis `Creating…` (no spinner icon — text only for simplicity), button disabled, input disabled.
- **Error:** Red inline message below input or below button: `"Something went wrong. Please try again."` — input border goes `--color-status-error`.
- **Disabled:** Button opacity `0.4`, cursor `not-allowed`.

**Content guidelines:**
- Label: "Event title"
- Placeholder: "e.g. My Q3 All-Hands"
- Button label: "Create event" (sentence case, not "CREATE EVENT")
- Max input length: 120 characters. Show a character count below input at 80+ characters: `"87 / 120"`.
- Validation: Required. Trim whitespace. Error message on empty submit: `"Please enter an event title."`

**Accessibility:**
- `<label for="event-title">` linked to `<input id="event-title">`.
- Button is `<button type="submit">`.
- Error message has `role="alert"` so screen readers announce it without focus move.
- Loading state: `aria-busy="true"` on the form, button `aria-disabled="true"`.

---

### 4.2 JoinCodeInput (Landing page join widget)

**Location:** Landing page, right column.

**Purpose:** Accept a 6-character code and display name, then navigate to `/e/[code]` after validation.

**Layout:**

```
┌──────────────────────────────────────┐
│  [Label] Join code                   │
│  ┌────────────────────────────────┐  │
│  │   A B C 1 2 3   (large mono)  │  │
│  └────────────────────────────────┘  │
│                                      │
│  [Label] Your name                   │
│  ┌────────────────────────────────┐  │
│  │  "Alex"                        │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │        Join  →                 │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

**Input behavior:**
- Code input: auto-uppercase on input, auto-advance cursor after 6 characters, `inputmode="text"`, monospace font `--font-mono`, letter-spacing `0.2em`, max 6 characters.
- Display name: max 32 characters, plain text.

**States:** Identical pattern to EventCreateForm. Additional state: **Not Found** — after submit, if the API returns 404: `"That code doesn't match an active event. Check and try again."` Error cleared on any keypress.

**Accessibility:**
- Code input: `aria-label="6-character join code"`, `autocomplete="off"`, `spellcheck="false"`.
- Live error: `role="alert"`.

---

### 4.3 JoinScreen (`/join`, `/join/[code]`)

Full-screen audience surface. White background `--color-bg-audience`.

**Layout (mobile 375 px):**

```
┌─────────────────────────────────────┐
│                                     │
│  PULSE                              │  ← display face, 2rem, centered
│  ─────────────────────────────────  │  ← 1px rule, --color-border-subtle
│                                     │
│  [Event title if known]             │  ← title face, 1.5rem
│                                     │
│  [Label] Your name                  │
│  ┌─────────────────────────────┐    │
│  │  "Alex"                     │    │
│  └─────────────────────────────┘    │
│                                     │
│  [Label] Event code                 │  ← hidden if pre-filled
│  ┌─────────────────────────────┐    │
│  │   A B C 1 2 3               │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │         Join                │    │  ← full-width, 56px tall
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

Touch targets: All inputs ≥ 48 px tall. Button ≥ 56 px tall. Minimum 8 px gap between adjacent interactive elements.

---

### 4.4 ConnectionStatus Indicator

**Location:** Top-right corner of host console and audience view.

**Variants:**

| State | Appearance | Label |
|---|---|---|
| Connected (SSE) | Solid dot, `--color-status-live` (lime), 8 px | "Live" |
| Polling fallback | Pulsing dot, `--color-accent-secondary` (amber) | "Polling" |
| Reconnecting | Spinning ring, `--color-status-warning` | "Reconnecting…" |
| Disconnected | Hollow dot, `--color-status-error` (red) | "Offline" |

**Implementation note:** The dot uses `box-shadow: 0 0 0 0 currentColor` animated via `@keyframes ripple` for the "Connected" pulse. `prefers-reduced-motion` removes the pulse, leaving a static solid dot.

**Accessibility:**
- Wrapping `<span>` has `role="status"` and `aria-live="polite"`.
- Hidden text label: `<span class="sr-only">[label text]</span>`.
- Color is never the sole differentiator — the label text is always present.

---

### 4.5 OpsReadout (Host console, left rail)

This component makes the DynamoDB write-sharding behavior visible. It is a prestige feature for judges — it shows the system doing real work.

**Layout:**

```
┌──────────────────────────────────────┐
│  ╔══════════════════════════════╗    │
│  ║  LIVE OPS                   ║    │
│  ╠══════════════════════════════╣    │
│  ║  Writes/s    ████░░░  1 247 ║    │
│  ║  Shards      ● ● ● ● ● ●   ║    │
│  ║               ● ● ● ●  10   ║    │
│  ║  Participants           83  ║    │
│  ║  SSE connections        79  ║    │
│  ║  p95 latency        < 120ms ║    │
│  ╚══════════════════════════════╝    │
└──────────────────────────────────────┘
```

**Visual details:**
- Container: dark surface `--color-surface-recessed`, border `1px solid --color-border-subtle`, font `--font-mono`, `--text-xs`.
- "LIVE OPS" label: uppercase, `--color-status-live` (neon lime), letter-spacing `0.12em`.
- Writes/s bar: a narrow 4 px tall horizontal bar using `--color-accent-primary`, fills left-to-right proportionally against a max of ~2000 writes/s. Width animated with CSS `transition: width var(--duration-normal)` but debounced to once per second.
- Shard dots: 10 dots, each `6px × 6px` circle. When a shard receives a write in the last 2 seconds, the dot glows `--color-accent-primary`. Otherwise `--color-surface-elevated`. This is a simplified visual metaphor — actual shard activity is inferred from the aggregate write rate, not from per-shard polling.
- Numbers use `font-variant-numeric: tabular-nums` so they don't jitter as they change.
- The component fetches from a lightweight `/api/events/[eventId]/ops` endpoint (returns participant count, SSE subscriber count, recent write rate from a rolling counter). Falls back gracefully if the endpoint is unavailable — fields show `—`.

**States:**
- **No active moment:** All metrics visible but writes/s bar is empty. Shard dots are dim.
- **Active moment:** Writes/s bar fills, shard dots fire.
- **Error fetching:** Fields show `—`, no crash.

**Reduced motion:** The shard dots are static. The writes/s bar updates instantly without transition.

---

### 4.6 MomentLauncher (Host console, center — no active moment)

**Layout:**

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  No active moment                                        │
│  ──────────────────────────────────────────────────      │
│  Choose what to launch next for your audience.           │
│                                                          │
│  ┌────────────┐  ┌────────────┐                          │
│  │  Poll      │  │ Word Cloud │                          │
│  │  ≡ ≡ ≡    │  │  ☁ text   │                          │
│  └────────────┘  └────────────┘                          │
│  ┌────────────┐  ┌────────────┐                          │
│  │  Emoji     │  │  Trivia    │                          │
│  │  🔥 👏    │  │  ⏱  ?     │                          │
│  └────────────┘  └────────────┘                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Each moment type is a `<button>` card, 200 × 140 px on desktop, 140 × 120 px on tablet. Cards use `--color-surface-raised` background, `--radius-lg` radius, `1px solid --color-border-subtle` border. On hover: border becomes `--color-accent-primary`, background lifts to `--color-surface-elevated`.

Clicking a card opens the MomentConfigDrawer (a bottom-anchored panel that slides up from the bottom of the center column — not a modal overlay, so the host can still see the left rail).

**Empty state:** When the event has 0 participants, show a banner above the launcher: `"Waiting for your first audience member — share the code [ABC123] to get started."` Code is displayed inline in monospace.

---

### 4.7 MomentConfigDrawer

Slides up from the bottom of the console center column. Height is fixed at 480 px on desktop. Contains the config form for the selected moment type. "Launch" button at the bottom of the drawer.

**Poll form fields:**
- Question text (textarea, max 200 chars, required)
- 2–6 option inputs (labeled "Option 1" through "Option 6"; minimum 2 required; "Add option" button appears if fewer than 6 are defined; remove button on each option past the second)
- "Launch poll" submit button

**Word Cloud form fields:**
- Prompt text (input, max 120 chars, required)
- "Launch word cloud" submit button

**Emoji Reaction:** No form. Single "Launch emoji reactions" button. Lists the 6 emoji palette as a small preview row.

**Trivia form fields:**
- Question text (textarea, max 200 chars, required)
- Correct answer (input, max 80 chars, required)
- 2–5 distractor options (same add/remove pattern as poll)
- Time limit (segmented control: 10s / 20s / 30s / 60s, default 30s)
- "Launch trivia" submit button

**Validation:** All required fields show inline errors on submit attempt. Field-level: `"This field is required."` Button stays disabled until minimum required fields are filled.

---

### 4.8 LivePollCard (Host console and Audience view — different variants)

#### Host variant (center panel, ActiveMomentPanel)

```
┌──────────────────────────────────────────────────────────┐
│  POLL  ·  83 votes                                       │
│  ────────────────────────────────────────────────────    │
│  "Which framework are you most excited about in 2026?"   │
│                                                          │
│  Next.js       ████████████████████░░░░   42  (51%)     │
│  Remix         ████████░░░░░░░░░░░░░░░░   24  (29%)     │
│  SvelteKit     ████░░░░░░░░░░░░░░░░░░░░   12  (14%)     │
│  Astro         ██░░░░░░░░░░░░░░░░░░░░░░    5  ( 6%)     │
│                                                          │
│  [  Close poll  ]                                        │
└──────────────────────────────────────────────────────────┘
```

**Bar animation:** On each counter update (arriving via SSE or poll), bars animate to their new width using `transition: width var(--duration-normal) var(--ease-out-expo)`. The count number counts up or down with a CSS counter animation is not reliable — use a JS requestAnimationFrame-based tweening of the numeric value over `--duration-normal` duration. Leading bar receives `--color-accent-primary` fill; remaining bars use `--color-accent-tertiary` (muted violet).

**Vote count:** Updates in-place with `aria-live="polite"` on the count span. Each bar's accessible label includes current count: `aria-label="Next.js: 42 votes, 51%"`.

#### Audience variant (mobile, `/e/[code]`)

```
┌────────────────────────────────────────┐
│  "Which framework are you most         │
│   excited about in 2026?"              │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  Next.js                         │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │  Remix                           │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │  SvelteKit                       │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │  Astro                           │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

Before vote: options are plain tappable cards (56 px tall min), `--color-bg-audience` background, `--color-border-subtle` border. On hover/tap: border becomes `--color-accent-audience` (the audience-surface accent).

After vote: selected option gets a checkmark and `--color-accent-audience` fill. All options transform into mini result bars showing percentage. Count label appears below question: `"83 responses"`. The transition from button-cards to result-bars is animated: the button-cards scale down slightly (transform: scaleY) and the bar overlays fade in, all within `var(--duration-normal)`.

**Disabled after vote:** Options are `aria-disabled="true"`, cursor `default`. The "already voted" state is shown inline: `"Your vote is counted."` (small text below the results).

**Cannot vote / event ended:** Options are visually dimmed, non-interactive.

---

### 4.9 WordCloud Component

**Host variant:** Renders inside the ActiveMomentPanel center column. Uses a canvas-based or CSS-positioned word layout. Words are sized proportional to frequency. Top word at approximately `--text-2xl`, median words at `--text-base`, rare words at `--text-sm`.

**Color assignment:** Words cycle through `--color-accent-primary`, `--color-accent-secondary`, `--color-accent-tertiary` based on their rank bucket (top 3 = primary, next 5 = secondary, rest = tertiary). Color is stable per word once assigned (keyed by the word string) so words do not flash color as counts change.

**Update behavior:** On new submission arriving: the word either appears for the first time (fade in, `transform: scale(0.5) → scale(1)`, `var(--duration-normal)`) or grows slightly in font size (not instantaneous — transition on font-size is layout-bound so instead transition `transform: scale(1.0) → scale(1.08) → scale(1.0)` via a keyframe pulse over `var(--duration-slow)`).

**Reduced motion:** No scale animation. Word simply appears or updates with a 0 → 1 opacity crossfade.

**Audience variant:** Simpler — shows the prompt text at top, a text input, a "Submit" button. After submit: shows `"Added!"` confirmation for 2 seconds, then the input clears and disables (one submission per participant per moment). Below the input, the live cloud is rendered in a smaller form (240 px tall) so the audience can see the collective result.

**Accessibility:** The word cloud canvas/SVG has `aria-hidden="true"`. A companion `<ul role="list" class="sr-only">` lists the top 10 words with their counts, updated via `aria-live="polite"`. This provides screen-reader access without the visual complexity.

---

### 4.10 EmojiReactionLayer

**Host variant (ActiveMomentPanel):** Shows aggregate counts per emoji in a horizontal row. Each emoji has a count badge below it. Counts animate (same tweening approach as poll counts).

Additionally: a burst visualization fills the upper portion of the center panel. Incoming reactions (batched per second from the ops stream) are rendered as floating emoji that rise from the bottom and fade out over `1.2s`. This is purely decorative — it conveys reaction velocity. Up to 20 concurrent floaters; oldest are removed when the limit is exceeded.

**CSS for a single floater:**
```css
@keyframes float-up {
  0%   { opacity: 1; transform: translateY(0) scale(1); }
  80%  { opacity: 0.8; }
  100% { opacity: 0; transform: translateY(-180px) scale(0.7); }
}

.emoji-floater {
  position: absolute;
  bottom: 0;
  animation: float-up var(--duration-burst) var(--ease-out-expo) forwards;
  will-change: transform, opacity;
  font-size: 2rem;
  pointer-events: none;
}
```

Left position is randomized within a 240 px center band. `will-change` is removed from the element after animation ends.

**Audience variant (mobile):** Six large emoji buttons arranged in a 3×2 grid. Each button is 80 px × 80 px with `--radius-full` (circle). Tapping fires a POST (debounced — no server call faster than 200 ms per button). On tap: brief scale pulse `scale(1) → scale(1.2) → scale(1)` over 150 ms. No limit on audience tapping during open window.

**Reduced motion (both variants):** Float-up animation is removed entirely. Counts still update. The audience tap pulse is also removed — button simply gains a brief `--color-accent-primary` border flash via opacity.

---

### 4.11 LiveLeaderboard (Trivia moments)

**Host variant:** Vertical list, top-10 participants. Each row: rank number, display name, score.

**Spring reorder:** When the leaderboard updates (new scores arrive), participants that move up/down animate with a translate-Y spring. Implementation uses a keyed list where outgoing position is captured before the DOM update and the new position is applied with a CSS transition. This is a "FLIP" animation technique (First Last Invert Play) using `transform: translateY`. Duration: `var(--duration-spring)` with `var(--ease-spring)`.

```
┌──────────────────────────────────────────────────────────┐
│  LEADERBOARD                                             │
│  ─────────────────────────────────────────────────────   │
│  1.  Alex Chen          ████████████████  980 pts        │
│  2.  Maria Santos       ███████████████   920 pts        │
│  3.  James O'Brien      ██████████████    880 pts        │
│  4.  Priya Kapoor       █████████████     830 pts        │
│  5.  Sam Nguyen         ████████████      770 pts        │
└──────────────────────────────────────────────────────────┘
```

Score bars: proportional to max score in current top-10. Same bar animation as the poll.

**Audience variant (mobile):** Shows the participant's own rank prominently at the top of their screen: `"You are #4"` in large text. Below: a mini leaderboard showing positions 1–5 plus the participant's own position if outside top 5 (with a separator `···`).

**Reduced motion:** Rows update in-place without translate animation. A brief opacity flash (`1.0 → 0.7 → 1.0`, 200 ms) signals a score change.

---

### 4.12 AnalyticsSummary (`/host/.../summary`)

**Four stat cards (top row):**

```
┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
│            │  │            │  │            │  │            │
│    83      │  │   412      │  │    61      │  │    4       │
│ Participants│  │Interactions│  │ Peak concur│  │  Moments   │
│            │  │            │  │ rent       │  │ launched   │
└────────────┘  └────────────┘  └────────────┘  └────────────┘
```

Cards: `--color-surface-raised`, `--radius-md`. Number at `--text-3xl`, label at `--text-sm --color-text-secondary`. On desktop, 4 columns. On mobile, 2 columns.

**Moment breakdown:** Accordion list. Each moment closed by default. On expand: shows the relevant result (poll bars, word cloud top-5 list, emoji counts, final leaderboard).

**AI Assist block (stretch, gated by `OPENAI_API_KEY`):** Below the accordion, a panel with heading "AI Summary" and body text (generated sentiment summary of word cloud submissions). If key is absent, this section is omitted entirely — no placeholder, no error.

---

### 4.13 ParticipantCount

Small pill component in the host console left rail. Shows live count of joined participants.

```
  [ ● 83 live ]
```

Dot uses `--color-status-live`. Count updates via SSE, announced via `aria-live="polite"` with `aria-atomic="true"`.

---

### 4.14 AudienceLobby (Idle state on `/e/[code]`)

Shown when the audience member has joined but no moment is active.

```
┌────────────────────────────────────────┐
│                                        │
│  [Event Title]                         │
│                                        │
│  ─────────────────────────────────     │
│                                        │
│  "Waiting for something to start…"     │
│                                        │
│       [animated three-dot pulse]       │
│                                        │
│                                        │
│  Hi, Alex                              │  ← small, bottom
│                                        │
└────────────────────────────────────────┘
```

Three-dot pulse: three dots that fade in and out in sequence over 1.2 s. Reduced motion: static `···` text.

---

### 4.15 ClosedEventOverlay

Shown when the host ends the event. Full-screen overlay on the audience view.

```
┌────────────────────────────────────────┐
│                                        │
│  Thanks for being part of              │
│                                        │
│  [Event Title]                         │
│                                        │
│  ─────────────────────────────────     │
│                                        │
│  The host has ended this session.      │
│                                        │
└────────────────────────────────────────┘
```

Overlay fades in over `var(--duration-normal)`. No dismiss button — this is a terminal state. The audience member can close the browser tab.

---

### 4.16 Loading Skeletons

Used during the initial data fetch for screens that load async data.

**Skeleton pattern:** Rectangular blocks of `--color-surface-elevated` with a shimmer animation (left-to-right gradient sweep, `1.5s infinite`). Reduced motion: static block, no shimmer.

**Where used:**
- Host console on initial load: skeleton for left rail (4 lines), skeleton for center panel (2 large blocks).
- Audience view on join: skeleton for the lobby (headline + 3 lines).
- Analytics summary: skeleton for 4 stat cards + 3 accordion rows.

```css
@keyframes shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-surface-elevated) 25%,
    var(--color-surface-raised) 50%,
    var(--color-surface-elevated) 75%
  );
  background-size: 800px 100%;
  animation: shimmer 1.5s infinite linear;
  border-radius: var(--radius-sm);
}

@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; }
}
```

---

### 4.17 Error States

**Network error (SSE dropped, fallback polling failing):** A dismissable banner at the top of the page (not a modal). Host console: `"Connection interrupted — results may be delayed. Attempting to reconnect…"`. Audience view: `"Connection lost — you may miss updates until we reconnect."` Banner uses `--color-status-warning` background, dark text. Has a close (×) button.

**API error (create event, launch moment, vote submission fails):** Inline error below the triggering action. Never a full-page error. Message describes what failed and what to do. Example: `"Failed to launch the poll. Check your connection and try again."` Error message has `role="alert"`.

**404 / event not found (on join):** Shows on the JoinScreen. Message: `"That code doesn't match an active event. It may have ended, or there might be a typo."` Input field is still editable.

**Event ended (audience navigates to ended event):** The ClosedEventOverlay (4.15) is shown immediately instead of the lobby.

---

## 5. Design Tokens — CSS Variables

Drop this block into `src/styles/tokens.css` and import it in `globals.css`.

```css
/* ============================================================
   PULSE — DESIGN TOKENS
   Generated 2026-06-20  ·  Ready to drop into globals.css
   ============================================================ */

:root {

  /* ----------------------------------------------------------
     COLOR — HOST CONSOLE (dark surface)
     All colors defined in OKLCH for perceptual uniformity.
     Contrast ratios noted against --color-bg-base (L≈0.08).
     ---------------------------------------------------------- */

  /* Backgrounds */
  --color-bg-base:          oklch(8% 0.008 270);   /* near-black, faint violet cast */
  --color-surface-recessed: oklch(6% 0.006 270);   /* deeper than base, for wells */
  --color-surface-raised:   oklch(13% 0.010 270);  /* cards, panels */
  --color-surface-elevated: oklch(18% 0.012 270);  /* hover state, dropdowns */

  /* Borders */
  --color-border-subtle:    oklch(26% 0.012 270);  /* 1px lines, dividers */
  --color-border-default:   oklch(34% 0.016 270);  /* input borders, card outlines */
  --color-border-strong:    oklch(50% 0.020 270);  /* focus rings, active borders */

  /* Text */
  --color-text-primary:     oklch(96% 0.004 270);  /* main text on dark — contrast ≈16:1 */
  --color-text-secondary:   oklch(70% 0.008 270);  /* secondary labels — contrast ≈5.5:1 */
  --color-text-tertiary:    oklch(50% 0.008 270);  /* placeholders, disabled — contrast ≈3:1 */
  --color-text-inverse:     oklch(10% 0.004 270);  /* text on light surfaces */

  /* Accent — Electric Violet (primary brand color, host console) */
  --color-accent-primary:   oklch(68% 0.24 290);   /* vivid violet — contrast on dark ≈4.6:1 */
  --color-accent-primary-hover: oklch(74% 0.22 290);
  --color-accent-primary-subtle: oklch(20% 0.06 290); /* low-opacity fills */

  /* Accent — Amber (secondary, warnings, polling fallback indicator) */
  --color-accent-secondary: oklch(80% 0.18 70);    /* amber — contrast on dark ≈7.2:1 */
  --color-accent-secondary-subtle: oklch(20% 0.05 70);

  /* Accent — Muted Violet (poll bars non-leading, tertiary data) */
  --color-accent-tertiary:  oklch(44% 0.12 290);

  /* Status colors */
  --color-status-live:      oklch(80% 0.22 140);   /* neon lime — "live" indicator */
  --color-status-warning:   oklch(75% 0.18 70);    /* amber */
  --color-status-error:     oklch(62% 0.22 25);    /* red — contrast on dark ≈4.7:1 */
  --color-status-success:   oklch(72% 0.18 145);   /* green */

  /* ----------------------------------------------------------
     COLOR — AUDIENCE SURFACE (light, warm white)
     These override the host palette for the audience view.
     Mapped to custom properties prefixed --color-audience-*.
     ---------------------------------------------------------- */

  --color-bg-audience:         oklch(98% 0.004 80);   /* warm white */
  --color-surface-audience:    oklch(95% 0.006 80);   /* slightly off-white for cards */
  --color-border-audience:     oklch(88% 0.010 80);   /* warm gray */
  --color-text-audience-primary:  oklch(12% 0.006 280); /* near-black */
  --color-text-audience-secondary: oklch(42% 0.010 280);/* mid gray */

  /* Accent for audience surface — saturated coral/orange, high contrast on white */
  --color-accent-audience:     oklch(60% 0.22 35);   /* coral — contrast on white ≈4.8:1 */
  --color-accent-audience-hover: oklch(54% 0.24 35);
  --color-accent-audience-subtle: oklch(92% 0.05 35);

  /* Trivia timer — used in countdown bar */
  --color-timer-full:  oklch(72% 0.18 145); /* green */
  --color-timer-half:  oklch(80% 0.18 70);  /* amber */
  --color-timer-low:   oklch(62% 0.22 25);  /* red */

  /* ----------------------------------------------------------
     TYPOGRAPHY
     Font stack: Display = "Space Grotesk" (geometric, editorial)
                 Body/UI = "Inter" (high legibility, system UI quality)
                 Mono = "JetBrains Mono" (OpsReadout, join codes)
     ---------------------------------------------------------- */

  --font-display: 'Space Grotesk', 'Helvetica Neue', Arial, sans-serif;
  --font-body:    'Inter', system-ui, -apple-system, sans-serif;
  --font-mono:    'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;

  /* Type scale — fluid via clamp(min, preferred, max) */
  --text-hero:   clamp(3rem, 1.5rem + 6vw, 7rem);    /* 48–112px — landing headline */
  --text-4xl:    clamp(2.25rem, 1.5rem + 3vw, 3.5rem); /* 36–56px — event title on console */
  --text-3xl:    clamp(1.875rem, 1.4rem + 2vw, 2.5rem); /* 30–40px — stat numbers */
  --text-2xl:    clamp(1.5rem, 1.2rem + 1.5vw, 2rem);   /* 24–32px — section heads */
  --text-xl:     clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem); /* 20–24px */
  --text-lg:     clamp(1.125rem, 1rem + 0.5vw, 1.25rem);  /* 18–20px */
  --text-base:   clamp(1rem, 0.92rem + 0.4vw, 1.125rem);  /* 16–18px — body */
  --text-sm:     0.875rem;   /* 14px — secondary labels, captions */
  --text-xs:     0.75rem;    /* 12px — OpsReadout mono values, badges */

  /* Line heights */
  --leading-tight:   1.2;
  --leading-snug:    1.35;
  --leading-normal:  1.55;
  --leading-relaxed: 1.7;

  /* Font weights */
  --weight-regular: 400;
  --weight-medium:  500;
  --weight-semibold: 600;
  --weight-bold:    700;

  /* Letter spacing */
  --tracking-tight:  -0.02em;
  --tracking-normal:  0em;
  --tracking-wide:    0.04em;
  --tracking-wider:   0.08em;
  --tracking-widest:  0.12em;  /* used for "LIVE OPS" label */

  /* ----------------------------------------------------------
     SPACING SCALE (4px base unit)
     ---------------------------------------------------------- */

  --space-1:   0.25rem;   /*  4px */
  --space-2:   0.5rem;    /*  8px */
  --space-3:   0.75rem;   /* 12px */
  --space-4:   1rem;      /* 16px */
  --space-5:   1.25rem;   /* 20px */
  --space-6:   1.5rem;    /* 24px */
  --space-8:   2rem;      /* 32px */
  --space-10:  2.5rem;    /* 40px */
  --space-12:  3rem;      /* 48px */
  --space-16:  4rem;      /* 64px */
  --space-20:  5rem;      /* 80px */
  --space-24:  6rem;      /* 96px */

  /* Section rhythm (fluid) */
  --space-section:  clamp(3rem, 2rem + 5vw, 8rem);
  --space-inset-lg: clamp(1.5rem, 1rem + 2vw, 2.5rem);

  /* ----------------------------------------------------------
     BORDER RADIUS
     ---------------------------------------------------------- */

  --radius-none: 0;
  --radius-sm:   0.25rem;  /*  4px — skeleton blocks, small chips */
  --radius-md:   0.5rem;   /*  8px — input fields, small cards */
  --radius-lg:   0.875rem; /* 14px — moment type cards, panels */
  --radius-xl:   1.25rem;  /* 20px — large modals, drawers */
  --radius-full: 9999px;   /* pills, dots, emoji reaction buttons */

  /* ----------------------------------------------------------
     ELEVATION / SHADOWS
     Host console uses glow-based depth (appropriate for dark surfaces).
     Audience surface uses traditional box shadows.
     ---------------------------------------------------------- */

  /* Host console (glow shadows — violet tint) */
  --shadow-sm:    0 1px 3px oklch(0% 0 0 / 0.5), 0 1px 2px oklch(0% 0 0 / 0.4);
  --shadow-md:    0 4px 12px oklch(0% 0 0 / 0.6), 0 2px 4px oklch(0% 0 0 / 0.4);
  --shadow-lg:    0 12px 32px oklch(0% 0 0 / 0.7), 0 4px 8px oklch(0% 0 0 / 0.4);
  --shadow-glow:  0 0 20px oklch(68% 0.24 290 / 0.35); /* accent violet glow */
  --shadow-glow-sm: 0 0 8px oklch(68% 0.24 290 / 0.25);

  /* Audience surface (warmer, lighter) */
  --shadow-audience-sm: 0 1px 4px oklch(12% 0 0 / 0.08);
  --shadow-audience-md: 0 4px 16px oklch(12% 0 0 / 0.10);
  --shadow-audience-lg: 0 8px 24px oklch(12% 0 0 / 0.12);

  /* ----------------------------------------------------------
     MOTION / ANIMATION
     ---------------------------------------------------------- */

  /* Durations */
  --duration-instant: 50ms;
  --duration-fast:    100ms;
  --duration-normal:  220ms;   /* default transitions */
  --duration-slow:    380ms;   /* word cloud pulse, bar initial fill */
  --duration-spring:  500ms;   /* leaderboard reorder */
  --duration-burst:   1200ms;  /* emoji float-up */

  /* Easings */
  --ease-default:   cubic-bezier(0.4, 0, 0.2, 1);    /* standard material curve */
  --ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1);   /* bar fills, slide-in panels */
  --ease-spring:    cubic-bezier(0.34, 1.56, 0.64, 1); /* leaderboard reorder */
  --ease-in-out:    cubic-bezier(0.4, 0, 0.6, 1);    /* symmetric transitions */

  /* ----------------------------------------------------------
     BREAKPOINTS (reference — use in CSS @media)
     ---------------------------------------------------------- */

  /* --bp-sm: 480px  — large phone landscape */
  /* --bp-md: 768px  — tablet */
  /* --bp-lg: 1024px — small desktop */
  /* --bp-xl: 1280px — host console 3-column layout */
  /* --bp-2xl: 1536px — comfortable widescreen */

  /* ----------------------------------------------------------
     COMPONENT-SPECIFIC TOKENS
     ---------------------------------------------------------- */

  /* Poll bars */
  --poll-bar-height:     8px;
  --poll-bar-radius:     var(--radius-full);
  --poll-bar-track-bg:   var(--color-surface-elevated);
  --poll-bar-fill-lead:  var(--color-accent-primary);
  --poll-bar-fill-other: var(--color-accent-tertiary);

  /* Connection status dot */
  --status-dot-size: 8px;

  /* Touch targets */
  --touch-target-min: 44px;  /* WCAG 2.5.8 — 24px absolute min, 44px recommended */
  --touch-target-audience: 56px; /* audience view, finger-first */

  /* Focus ring */
  --focus-ring-width:  2px;
  --focus-ring-offset: 2px;
  --focus-ring-color:  var(--color-accent-primary); /* host */
  --focus-ring-color-audience: var(--color-accent-audience); /* audience */

}
```

---

## 6. States Reference

### Interactive Component State Matrix

| Component | Default | Hover | Focus | Active | Disabled | Loading | Empty | Error |
|---|---|---|---|---|---|---|---|---|
| EventCreateForm | Input unfocused, button normal | — | Input: accent border + ring | — | Opacity 0.4, cursor not-allowed | "Creating…", all disabled | — | Inline alert, red border |
| JoinCodeInput | Empty, monospace | — | Accent border + ring | — | — | Loading overlay | — | "Code not found" alert |
| Poll Option (audience, before vote) | Surface card, subtle border | Border → accent, lift shadow | Accent ring | Scale 0.97, accent fill | aria-disabled, dim | — | — | — |
| Poll Option (audience, after vote) | Selected: accent fill + checkmark; others: result bars | — | — | — | All disabled | — | — | — |
| Emoji Button (audience) | Circle, neutral fill | Scale 1.05, shadow | Accent ring | Scale 1.15 → 1.0 spring | Dim | — | — | — |
| Trivia Option (audience) | Same as Poll Option | Same | Same | Same | Dim after selection or timer end | — | — | Wrong: red flash; Correct: green flash |
| "Launch" button (host) | Accent bg, white text | Accent-hover bg | Ring + slight elevation | Scale 0.98 | Opacity 0.4 | "Launching…", spinner | — | Inline error below button |
| "Close Moment" button | Outlined, destructive color | Fill destructive | Ring | Scale 0.98 | — | — | — | — |
| MomentTypeCard | Surface-raised | Accent border, elevated bg | Accent ring | Scale 0.97 | Dim | — | — | — |
| LeaderboardRow | Normal surface | Subtle highlight | — | — | — | — | — | — |

### Loading Skeleton Inventory

| Screen | What is skeletonized |
|---|---|
| Host console (initial load) | Left rail: 3 text lines (title, code, participant count). Center: large rectangle (ActiveMomentPanel placeholder). |
| Audience view (joining) | Full-height lobby: 1 large title block + 3 medium lines. |
| Analytics summary | 4 stat cards, 3 accordion rows. |

---

## 7. Accessibility Requirements

### Color Contrast Targets (WCAG 2.1 AA)

| Token pair | Contrast ratio | Usage |
|---|---|---|
| `--color-text-primary` on `--color-bg-base` | ≈ 16:1 | Primary body text on host console |
| `--color-text-secondary` on `--color-bg-base` | ≈ 5.5:1 | Secondary labels on host console |
| `--color-accent-primary` on `--color-bg-base` | ≈ 4.6:1 | Accent text, button text — meets AA normal text |
| `--color-status-live` on `--color-bg-base` | ≈ 7.5:1 | Live status label |
| `--color-status-error` on `--color-bg-base` | ≈ 4.7:1 | Error text on host console |
| `--color-text-audience-primary` on `--color-bg-audience` | ≈ 14:1 | Text on audience surface |
| `--color-accent-audience` on `--color-bg-audience` | ≈ 4.8:1 | Button text, selected states on audience |
| `--color-text-audience-secondary` on `--color-bg-audience` | ≈ 5.2:1 | Secondary text on audience |
| White text on `--color-accent-primary` button | ≈ 4.6:1 | Button label — borderline AA; verify with tool |
| White text on `--color-accent-audience` button | ≈ 5.0:1 | Audience CTA button — meets AA |

**Verification requirement:** Run Stark or axe DevTools against every screen. Any pairing below 4.5:1 for normal text or 3:1 for large text (≥ 18px bold / ≥ 24px regular) must be corrected before submission.

### Keyboard Navigation

**Landing page:** Tab order: event title input → create button → code input → name input → join button. No skip-link required (page is short), but `<main>` must be present.

**Host console:** Tab order: console header (event title, join code) → participant count → ops readout (non-interactive, skipped from tab order with `tabindex="-1"`) → moment launcher cards → launch/close buttons. Moment config drawer: when open, focus is trapped inside the drawer. Close on Escape. When the drawer closes, focus returns to the card that triggered it.

**Audience view:** Tab order: event title (heading, non-interactive) → connection status (non-interactive) → moment content (poll options / emoji buttons / text input / trivia options). After voting, focus moves to the confirmation message.

**Skip link:** A visually hidden skip link `"Skip to main content"` must appear as the very first focusable element on every page, becoming visible on focus.

```html
<a href="#main-content" class="skip-link">Skip to main content</a>
```

```css
.skip-link {
  position: absolute;
  top: -100%;
  left: var(--space-4);
  padding: var(--space-2) var(--space-4);
  background: var(--color-accent-primary);
  color: var(--color-text-primary);
  font-weight: var(--weight-semibold);
  border-radius: var(--radius-md);
  z-index: 9999;
  transition: top var(--duration-fast);
}
.skip-link:focus { top: var(--space-4); }
```

### Focus Visibility

All interactive elements must have a visible focus ring. Do not rely on browser defaults — they are inconsistent across browsers. Use:

```css
:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
:focus:not(:focus-visible) { outline: none; }
```

For the audience surface, replace `--focus-ring-color` with `--focus-ring-color-audience`.

### ARIA Live Regions

| Content | Role | aria-live | aria-atomic | When updated |
|---|---|---|---|---|
| Poll vote count | `role="status"` | `polite` | `true` | On each SSE/poll update |
| Leaderboard | `role="status"` | `polite` | `false` | On each score change |
| Participant count | `role="status"` | `polite` | `true` | On each join/leave |
| Connection status | `role="status"` | `polite` | `true` | On state change |
| Error messages | `role="alert"` | `assertive` | `true` | On error occurrence |
| Emoji burst count | None (decorative) | — | — | Never announced |
| Word cloud (visual) | `aria-hidden="true"` | — | — | Screen-reader list companion used instead |
| Trivia timer countdown | `role="timer"` | `off` | — | Announces only at "10 seconds left" and "Time's up!" |

**Trivia timer note:** Do not use `aria-live` on the raw countdown number — announcing every second is disruptive. Instead, announce at two checkpoints via a separate `role="alert"` element that fires once at 10s remaining and once at expiry.

### Touch Targets

- All tappable elements on the audience view: minimum `44px × 44px` (WCAG 2.5.8 absolute minimum), target `56px × 56px` for primary actions.
- Emoji reaction buttons: `80px × 80px` — above minimum to accommodate rapid repeated tapping.
- Poll option cards: full-width, `56px` minimum height.
- Join button: full-width, `56px` height.

### Reduced Motion

Apply `@media (prefers-reduced-motion: reduce)` to every animation in the codebase. The following substitutions apply:

| Animation | Full motion | Reduced motion |
|---|---|---|
| Poll bar fill | Width transition over `--duration-normal` | Instant (no transition) |
| Leaderboard reorder | FLIP spring `--duration-spring` | Instant reorder, opacity flash `--duration-fast` |
| Emoji float-up | `float-up` keyframe `--duration-burst` | Omitted entirely |
| Word cloud word entry | Scale + fade `--duration-normal` | Opacity fade only `--duration-fast` |
| Loading skeleton shimmer | Gradient sweep 1.5s infinite | Static block |
| Lobby three-dot pulse | Sequential fade 1.2s | Static `···` |
| Connection status dot ripple | `ripple` keyframe | Static dot |
| Audience tap pulse | Scale spring 150ms | Removed |
| Closed event overlay | Fade-in `--duration-normal` | Instant display |

---

## 8. Motion Specification

All animations use compositor-friendly properties: `transform` and `opacity` only. No animation of `width`, `height`, `top`, `left`, `margin`, `padding`, `font-size`, or `border`. The poll bars use `width` conceptually but are implemented via `transform: scaleX(N)` on a full-width inner element with `transform-origin: left`.

### Inventory

| Element | What | Duration token | Easing token | Trigger |
|---|---|---|---|---|
| Poll bar fill (host) | `transform: scaleX(N)` | `--duration-normal` | `--ease-out-expo` | SSE update arrives |
| Poll bar fill (audience, post-vote reveal) | `transform: scaleX(N)` + `opacity: 0 → 1` | `--duration-slow` | `--ease-out-expo` | Vote confirmed |
| Poll count number | JS tween (rAF), 0 → N | `--duration-normal` | linear | SSE update |
| MomentConfigDrawer slide-in | `transform: translateY(100% → 0)` | `--duration-normal` | `--ease-out-expo` | Button click |
| MomentConfigDrawer slide-out | `transform: translateY(0 → 100%)` | `--duration-fast` | `--ease-in-out` | Close / launch |
| Emoji floater | `transform: translateY`, `opacity` | `--duration-burst` | `--ease-out-expo` | Reaction received |
| Audience emoji tap | `transform: scale(1 → 1.15 → 1)` | 150ms (local) | `--ease-spring` | Button tap |
| Leaderboard reorder (FLIP) | `transform: translateY(delta)` | `--duration-spring` | `--ease-spring` | Score update |
| Score change flash | `opacity: 1 → 0.6 → 1` | `--duration-fast` | linear | Score update (reduced motion) |
| Word cloud word appear | `transform: scale(0.7 → 1)`, `opacity: 0 → 1` | `--duration-normal` | `--ease-out-expo` | New submission |
| Word cloud word grow | `transform: scale(1 → 1.1 → 1)` | `--duration-slow` | `--ease-spring` | Frequency increment |
| Audience vote-to-results | `opacity: 1 → 0 → 1` + `scaleX` on bars | `--duration-normal` | `--ease-out-expo` | Vote confirmed |
| Loading skeleton shimmer | `background-position` 1.5s infinite | — | linear | On mount |
| ConnectionStatus ripple | `box-shadow` scale 2s infinite | — | `ease-out` | Connected state |
| ClosedEventOverlay | `opacity: 0 → 1` | `--duration-normal` | `--ease-in-out` | Event ended |
| Error banner slide-in | `transform: translateY(-100% → 0)` | `--duration-fast` | `--ease-out-expo` | Error occurs |

### `will-change` Policy

Apply `will-change: transform, opacity` only immediately before an animation begins, and remove it after. Do not apply it permanently in CSS. Use a JS-side class toggle or an `animationstart` / `transitionend` listener to clean up.

```css
.animating { will-change: transform, opacity; }
/* Remove .animating class in transitionend handler */
```

### OpsReadout Shard Dot Pulse

The shard dot animation is a special case: it uses `box-shadow` to simulate a glow, which is not compositor-friendly. Contain it: the dots are in their own stacking context (`isolation: isolate`) and the pulse is 3–4 seconds in period, not continuous, which limits the paint cost. If performance profiling shows jank, replace with `opacity` toggling between two pre-rendered states.

---

## Appendix A — Microcopy Reference

### Labels

| Element | Copy |
|---|---|
| EventCreateForm label | Event title |
| EventCreateForm placeholder | e.g. My Q3 All-Hands |
| EventCreateForm button | Create event |
| JoinCodeInput label | Join code |
| JoinCodeInput name label | Your name |
| JoinCodeInput button | Join |
| Name input placeholder | Your display name |
| Name input max hint | Max 32 characters |
| Moment launcher heading | Ready to engage? |
| Moment launcher subhead | Choose what to launch next for your audience. |
| Poll card label | Poll |
| Word Cloud card label | Word Cloud |
| Emoji card label | Emoji Reactions |
| Trivia card label | Trivia |
| Close moment button | Close moment |
| End event button | End event |
| Analytics page heading | Event summary |
| Share link label | Share this summary |

### Empty States

| State | Copy |
|---|---|
| Host console — 0 participants | Waiting for your first audience member. Share the code [CODE] to get started. |
| Host console — no moment active | No active moment — choose what to launch next. |
| Analytics — no word clouds | This event had no word cloud moments. |
| Analytics — no trivia | This event had no trivia moments. |
| Audience lobby — waiting | Waiting for something to start… |

### Error Messages

| Error | Copy |
|---|---|
| EventCreateForm — empty title | Please enter an event title. |
| EventCreateForm — API failure | Something went wrong. Please try again. |
| Join — code not found | That code doesn't match an active event. It may have ended, or there might be a typo. |
| Join — event ended | This event has ended. |
| Join — empty name | Please enter your display name. |
| Join — name too long | Display names must be 32 characters or fewer. |
| Vote — already voted | You've already voted in this poll. |
| Vote — moment closed | This moment has already closed. |
| Vote — API failure | Couldn't submit your vote. Check your connection and try again. |
| SSE lost / polling degraded | Connection interrupted — results may be delayed. |
| Word cloud — already submitted | You've already submitted a response for this moment. |
| Trivia — time expired | Time's up! |

---

## Appendix B — Responsive Breakpoints

| Breakpoint | Width | Host console layout | Audience layout |
|---|---|---|---|
| xs | 320–479 px | Single column, all rails collapsed to accordions | Single column, full-width moment content |
| sm | 480–767 px | Single column with sticky top bar for event info | Single column |
| md | 768–1023 px | Two columns (left rail + center), right rail becomes bottom sheet | Single column, wider moment cards |
| lg | 1024–1279 px | Two columns, relaxed | N/A (audience is phone-first) |
| xl | 1280+ px | Full three columns (240 / flex / 280) | N/A |

**Audience view is designed at 375 px and scales. It should never require horizontal scroll at any width.**

**Host console is designed at 1280 px. It must remain usable (not broken) at 768 px.**

---

## Appendix C — Font Loading Strategy

```html
<!-- In <head>, before any stylesheet -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />

<!-- Load only the weights actually used -->
<link
  rel="preload"
  href="https://fonts.gstatic.com/s/spacegrotesk/v..."
  as="font"
  type="font/woff2"
  crossorigin
/>
```

Self-host via `next/font` (Google Fonts integration) to eliminate a third-party DNS lookup and get automatic `font-display: swap`:

```ts
// src/lib/fonts.ts
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';

export const fontDisplay = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

export const fontBody = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

export const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});
```

Apply via `className` on `<html>` in `src/app/layout.tsx`:
```tsx
<html className={`${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`}>
```

---

*End of DESIGN.md*
