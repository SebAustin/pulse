# Pulse — Component Specs (Supplementary)

> This file extends the component specs in DESIGN.md §4 with additional
> implementation detail for builders.

---

## LivePollCard — Bar Animation Implementation

The bars must NOT animate `width` directly (triggers layout). Use `transform: scaleX(N)` instead:

```html
<div class="poll-bar-track" role="none">
  <div
    class="poll-bar-fill"
    style="--target-scale: 0.51"
    aria-hidden="true"
  ></div>
</div>
```

```css
.poll-bar-track {
  width: 100%;
  height: var(--poll-bar-height);
  background: var(--poll-bar-track-bg);
  border-radius: var(--poll-bar-radius);
  overflow: hidden;
}

.poll-bar-fill {
  width: 100%;
  height: 100%;
  background: var(--poll-bar-fill-other);
  transform-origin: left center;
  transform: scaleX(var(--target-scale, 0));
  transition: transform var(--duration-normal) var(--ease-out-expo);
  border-radius: var(--poll-bar-radius);
}

.poll-bar-fill--lead {
  background: var(--poll-bar-fill-lead);
}

@media (prefers-reduced-motion: reduce) {
  .poll-bar-fill { transition: none; }
}
```

Update `--target-scale` via inline style from JS when the value changes. The CSS transition does the rest.

---

## Leaderboard FLIP Animation

FLIP = First, Last, Invert, Play. Required because DOM reorder and CSS transition don't compose naturally.

```ts
// Pseudocode — adapt to your React/rendering pattern
function animateLeaderboardReorder(listEl: HTMLElement) {
  // 1. FIRST: record current positions
  const first = new Map<string, DOMRect>();
  listEl.querySelectorAll('[data-participant-id]').forEach(el => {
    first.set(el.dataset.participantId!, el.getBoundingClientRect());
  });

  // 2. Perform DOM update (React re-render, etc.)
  // --- React setState or similar ---

  // 3. LAST: record new positions (after paint)
  requestAnimationFrame(() => {
    listEl.querySelectorAll('[data-participant-id]').forEach(el => {
      const id = el.dataset.participantId!;
      const firstRect = first.get(id);
      if (!firstRect) return;
      const lastRect = el.getBoundingClientRect();
      const dy = firstRect.top - lastRect.top;
      if (dy === 0) return;

      // 4. INVERT: offset element back to original position
      el.style.transform = `translateY(${dy}px)`;
      el.style.transition = 'none';

      // 5. PLAY: remove the inversion on next frame
      requestAnimationFrame(() => {
        el.style.transform = '';
        el.style.transition =
          `transform var(--duration-spring) var(--ease-spring)`;
        el.classList.add('animating');
        el.addEventListener('transitionend', () => {
          el.style.transition = '';
          el.classList.remove('animating');
        }, { once: true });
      });
    });
  });
}
```

Reduced motion guard: check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and skip the FLIP entirely if true — just let the opacity flash handle it.

---

## OpsReadout — Data Contract

The component calls `GET /api/events/[eventId]/ops` at a 2-second polling interval (not SSE, to keep it decoupled from the main event stream).

Expected response shape:
```ts
interface OpsSnapshot {
  participantCount: number;
  sseConnectionCount: number;
  writesPerSecond: number;    // rolling 5-second average
  p95LatencyMs: number | null; // null if < 10 samples
  activeShards: number;        // always 10 for MVP, but surfaced for display
  shardActivity: boolean[];    // length 10, true if shard had write in last 2s
}
```

The `shardActivity` array drives the 10 shard dots. A dot is "active" (glowing) if `shardActivity[i] === true`.

If the endpoint returns an error or times out, all fields show `—` and no error state is surfaced (the readout is informational only and must not disrupt the host's workflow).

---

## TriviaCard — Countdown Timer

The countdown bar is a horizontal progress bar, full-width, that depletes from right to left. Color transitions through tokens as time decreases:

| Time remaining | Bar color |
|---|---|
| > 50% | `--color-timer-full` (green) |
| 20–50% | `--color-timer-half` (amber) |
| < 20% | `--color-timer-low` (red) |

Implementation: The bar uses `transform: scaleX(timeRemaining / timeLimit)` with `transform-origin: left`. Color changes are class-driven (`timer--full`, `timer--half`, `timer--low`) with an instant color switch (no transition on color to avoid the bar passing through yellow mid-blink).

When time expires: bar snaps to zero width, a `role="alert"` element with text `"Time's up!"` is inserted into the DOM.

Reduced motion: the bar still depletes (it conveys critical information). No color transition is used — color class changes instantly regardless of motion preference.

---

## WordCloud — Layout Engine

For MVP, a simplified layout is acceptable: words are absolutely positioned within a fixed-height container (300 px on host console, 200 px on audience view). Position is deterministic based on a seeded random from the word string (so the same word always appears in the same location, preventing the cloud from shifting on every update).

```ts
function wordPosition(word: string, containerW: number, containerH: number) {
  // Simple deterministic hash of the word string
  const hash = word.split('').reduce((acc, c) => acc * 31 + c.charCodeAt(0), 0);
  const x = (Math.abs(hash) % (containerW - 80)) + 40;
  const y = (Math.abs(hash * 7919) % (containerH - 40)) + 20;
  return { x, y };
}
```

A production-quality word cloud would use a spiral placement algorithm (D3-cloud or similar), but the above is acceptable for the hackathon demo and avoids a heavy dependency.

---

## EmojiReactionButtons — Rate Limiting

Audience members can tap emoji freely during an open reaction window. To prevent network saturation:

- Taps are queued client-side in a per-emoji counter.
- Every 500 ms, the accumulated count is flushed in a single POST body: `{ emoji: "🔥", count: 3 }`.
- If the flush fails, the count is retained and added to the next flush attempt.
- No visual feedback is withheld from the user during the queuing period — the tap animation fires immediately.

This is a client-side batching pattern, not debouncing. The user always sees their reactions counted.

---

## Connection Status — State Machine

```
States: CONNECTING → CONNECTED_SSE → POLLING_FALLBACK → RECONNECTING → DISCONNECTED

Transitions:
  CONNECTING → CONNECTED_SSE      (EventSource 'open')
  CONNECTED_SSE → RECONNECTING    (EventSource 'error')
  RECONNECTING → CONNECTED_SSE    (reconnect attempt succeeds)
  RECONNECTING → POLLING_FALLBACK (3 consecutive reconnect failures)
  POLLING_FALLBACK → CONNECTED_SSE (successful SSE reconnect from polling)
  POLLING_FALLBACK → DISCONNECTED  (polling also fails for 30s)
  DISCONNECTED → RECONNECTING     (tab regains visibility via visibilitychange)
```

The ConnectionStatus component observes this state machine and renders the appropriate dot + label combination as specified in DESIGN.md §4.4.

---

## Audience View — Moment Transition

When the SSE `moment.activated` event arrives and the audience is in the lobby, the transition from lobby to active moment view must feel smooth, not jarring:

1. Lobby content fades out (`opacity: 1 → 0`, `var(--duration-fast)`).
2. Active moment content fades in (`opacity: 0 → 1`, `var(--duration-normal)`), with a slight upward entrance: `transform: translateY(8px → 0)`.
3. If `prefers-reduced-motion` is set, skip the translate; use opacity crossfade only.

When the moment closes (SSE `moment.closed`):
1. Active moment shows a brief "Moment ended" state overlay for 2 seconds.
2. Then transitions back to the lobby using the reverse of the above.

---

## Analytics StatCard

```tsx
// Illustrative structure
<article class="stat-card" aria-labelledby="stat-participants-label">
  <span class="stat-number" id="stat-participants-value">83</span>
  <span class="stat-label" id="stat-participants-label">Participants</span>
</article>
```

```css
.stat-card {
  background: var(--color-surface-raised);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.stat-number {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
  line-height: var(--leading-tight);
}

.stat-label {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}
```

---

## Audience Surface CSS Scope

The audience view applies overrides via a class on `<main>`:

```css
.audience-surface {
  --color-bg-base:         var(--color-bg-audience);
  --color-surface-raised:  var(--color-surface-audience);
  --color-border-default:  var(--color-border-audience);
  --color-text-primary:    var(--color-text-audience-primary);
  --color-text-secondary:  var(--color-text-audience-secondary);
  --color-accent-primary:  var(--color-accent-audience);
  --color-accent-primary-hover: var(--color-accent-audience-hover);
  --color-accent-primary-subtle: var(--color-accent-audience-subtle);
  --focus-ring-color:      var(--focus-ring-color-audience);
  background: var(--color-bg-audience);
}
```

This keeps all component CSS using the same variable names regardless of which surface they are rendered on. No `if (isAudienceSurface)` conditionals in component CSS.
