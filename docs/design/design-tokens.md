# Pulse — Design Tokens Reference

> Source of truth is the `:root {}` block in `DESIGN.md §5` and `src/styles/tokens.css`.
> This file provides a human-readable explanation of every token and its rationale.

---

## Color System

Pulse uses two distinct color surfaces that map to its two distinct personas.

### Surface Duality

| Surface | Used on | Base background |
|---|---|---|
| Console (dark) | Host console, landing page | `oklch(8% 0.008 270)` — near-black with faint violet cast |
| Audience (light) | Join screen, audience participation view | `oklch(98% 0.004 80)` — warm white |

The deliberate split means the host in a dark broadcast environment and the audience member on a bright phone screen are both in optimized contexts.

### Why OKLCH

OKLCH (Lightness, Chroma, Hue) produces perceptually uniform color adjustments. When you change L by 10 points, the perceived brightness change is consistent regardless of hue. This matters for:

- Generating hover/active variants that look equally "lighter" across different hues.
- Ensuring contrast ratios behave predictably without empirical testing of every pair.
- The browser natively computes OKLCH; no PostCSS plugin needed for modern targets.

### Console Palette Rationale

| Role | Value | Rationale |
|---|---|---|
| Base background | `oklch(8% 0.008 270)` | Near-black with violet chroma prevents the flat "pure black" look. Gives depth without a competing color. |
| Electric violet accent | `oklch(68% 0.24 290)` | Maximum chroma at this hue before losing contrast against dark bg. This is the brand color. |
| Neon lime status | `oklch(80% 0.22 140)` | High-contrast live indicator. Lime is legible on dark backgrounds at lower chroma than green. |
| Amber secondary | `oklch(80% 0.18 70)` | Warm signal for warnings / polling fallback. Distinct from the violet primary without clashing. |

### Audience Palette Rationale

| Role | Value | Rationale |
|---|---|---|
| Warm white base | `oklch(98% 0.004 80)` | Slight warmth prevents clinical brightness. Easier on eyes in varied lighting. |
| Coral accent | `oklch(60% 0.22 35)` | High-chroma, approachable energy for a participation context. Contrast ≈ 4.8:1 on white — meets AA. |

---

## Typography Pairing

### Space Grotesk (display)
- Geometric sans-serif with character — squarish `O`, distinctive `G`, high x-height.
- Used for: event titles, the "PULSE" logotype, section headings, stat numbers.
- Weights used: 500 (medium) for titles, 700 (bold) for the hero and stat numbers.
- Never use at body text sizes — its idiosyncratic letterforms need room to breathe.

### Inter (body/UI)
- Designed for high legibility at small sizes on screens.
- Used for: labels, descriptions, form inputs, button text, error messages.
- Weights used: 400 (regular), 500 (medium), 600 (semibold).

### JetBrains Mono (monospace)
- Used exclusively for: join codes, OpsReadout values, participant IDs in logs.
- `font-variant-numeric: tabular-nums` must be set wherever numbers change at runtime to prevent layout jitter.

### Type Scale Decision Points

| Token | Value | Where used |
|---|---|---|
| `--text-hero` | `clamp(3rem, 1.5rem + 6vw, 7rem)` | Landing "PULSE" wordmark |
| `--text-4xl` | `clamp(2.25rem, 1.5rem + 3vw, 3.5rem)` | Event title in host console header |
| `--text-3xl` | `clamp(1.875rem, 1.4rem + 2vw, 2.5rem)` | Analytics stat numbers |
| `--text-2xl` | `clamp(1.5rem, 1.2rem + 1.5vw, 2rem)` | Poll question text (host console) |
| `--text-xl` | `clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem)` | Poll question text (audience) |
| `--text-base` | `clamp(1rem, 0.92rem + 0.4vw, 1.125rem)` | Body copy, option labels |
| `--text-sm` | `0.875rem` | Secondary labels, captions |
| `--text-xs` | `0.75rem` | OpsReadout mono values, badge text |

---

## Spacing

The spacing scale is a 4 px base unit. All layout spacing uses these tokens; no arbitrary values.

The section-level spacing uses a fluid clamp: `clamp(3rem, 2rem + 5vw, 8rem)` so vertical rhythm feels comfortable on both mobile and desktop without media query breakpoints on spacing.

---

## Radii

Three categories of radius exist in the design:

1. **Structural UI** (`--radius-md` 8px): Inputs, small cards, moment option cards in the audience view.
2. **Panel UI** (`--radius-lg` 14px): Moment type selector cards, the MomentConfigDrawer container.
3. **Circular UI** (`--radius-full`): Connection status dots, audience emoji reaction buttons, participant avatars if any.

Skeleton blocks use `--radius-sm` (4px) — just enough to distinguish them from hard-edged content without implying a card shape.

---

## Motion Token Rationale

| Token | Value | Rationale |
|---|---|---|
| `--duration-instant` | 50ms | Below perception threshold — for UI that "just appears" |
| `--duration-fast` | 100ms | Error banners, focus ring, tab switches |
| `--duration-normal` | 220ms | Default for all interactive state transitions |
| `--duration-slow` | 380ms | Word cloud grows, initial bar fill (deserves a beat) |
| `--duration-spring` | 500ms | Leaderboard reorder — longer because the spring itself has overshoot |
| `--duration-burst` | 1200ms | Emoji float-up — needs time to travel visually |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | The 1.56 overshoot gives leaderboard rows a physical "landing" feel |
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | Fast start → gentle arrival. Correct for content entering the screen. |

---

## Implementation Notes

1. Import `tokens.css` before all other CSS: `@import './tokens.css';` at the top of `globals.css`.
2. The audience surface does not get a separate `:root` — it gets a scope class: `.audience-surface { ... }` with overrides for `--color-bg-base` etc. This prevents the host console and audience view from needing separate HTML documents while sharing one token namespace.
3. `font-variant-numeric: tabular-nums` should be applied globally to all elements within `.ops-readout` and `.leaderboard` to prevent layout jitter during live updates.
4. Never hardcode `oklch(...)` values outside `tokens.css`. All color references in component CSS must go through variables.
