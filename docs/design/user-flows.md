# Pulse — User Flows and Information Architecture

> Supporting detail for DESIGN.md §2 and §3.

---

## Route → Component Map

```
/
├── EventCreateForm
└── JoinCodeInput

/host/[eventId]/[hostToken]
├── ConsoleHeader (event title, join code, shareable link)
├── ParticipantCount
├── OpsReadout
├── ConnectionStatus
├── MomentLauncher (when no active moment)
│   └── MomentConfigDrawer (slide-up on card click)
│       ├── PollConfigForm
│       ├── WordCloudConfigForm
│       ├── EmojiConfig (no form, immediate launch)
│       └── TriviaConfigForm
├── ActiveMomentPanel (when moment is active — replaces MomentLauncher)
│   ├── LivePollCard (host variant)
│   ├── WordCloud (host variant)
│   ├── EmojiReactionLayer (host variant)
│   └── LiveLeaderboard (host variant)
└── MomentHistoryLog (right rail — last 5 closed moments)

/host/[eventId]/[hostToken]/summary
├── AnalyticsSummary
│   ├── StatCard × 4
│   └── MomentBreakdown (accordion)
│       ├── Poll result (bars)
│       ├── WordCloud top-5 list
│       ├── EmojiCounts
│       └── FinalLeaderboard
└── AIAssistPanel (gated by OPENAI_API_KEY)

/join
└── JoinScreen

/join/[code]
└── JoinScreen (code pre-filled, event title shown if resolvable)

/e/[code]
├── AudienceHeader (event title + ConnectionStatus)
├── AudienceLobby (idle state — no active moment)
│   └── ThreeDotPulse
├── ActiveMomentView (SSE-driven, replaces lobby)
│   ├── LivePollCard (audience variant)
│   ├── WordCloudInput + WordCloudMini (audience variant)
│   ├── EmojiReactionButtons (audience variant)
│   └── TriviaCard (audience variant: countdown + options)
└── ClosedEventOverlay (when event.status === 'ended')
```

---

## SSE Event → UI State Transitions

| SSE event type | Host console effect | Audience view effect |
|---|---|---|
| `participant.joined` | ParticipantCount increments | — |
| `moment.activated` | ActiveMomentPanel replaces MomentLauncher | AudienceLobby replaced by ActiveMomentView |
| `poll.update` | Poll bars animate to new widths | Post-vote: result bars update |
| `wordcloud.update` | Word cloud re-renders with new frequencies | Mini cloud updates |
| `emoji.update` | Emoji burst counts update; floaters spawned | — |
| `leaderboard.update` | Leaderboard rows reorder with spring | "Your rank" updates |
| `moment.closed` | ActiveMomentPanel shows closed state; MomentLauncher reappears | ActiveMomentView shows final result briefly, then returns to AudienceLobby |
| `event.ended` | Console shows "Event ended" with link to summary | ClosedEventOverlay covers full screen |

---

## Error Recovery Flows

### SSE Drop → Polling Fallback
```
SSE connected
  │
  ├─[EventSource closes unexpectedly]
  │
  ├─[Client attempts reconnect × 3, 1s / 3s / 9s backoff]
  │   │
  │   ├─[Reconnect succeeds] → SSE Connected state restored; banner dismissed
  │   │
  │   └─[All 3 attempts fail]
  │         │
  │         └─[Activate HTTP polling at 3s interval]
  │               ConnectionStatus → "Polling" amber state
  │               Warning banner shown
  │               │
  │               └─[When tab regains visibility → attempt SSE reconnect]
```

### Vote Submission Failure
```
Audience taps poll option
  │
  ├─[Optimistic UI: option card shows selected state immediately]
  │
  ├─[POST /api/events/[id]/moments/[momentId]/vote]
  │   │
  │   ├─[200 OK] → confirmed; live bars appear
  │   │
  │   ├─[409 Conflict — already voted] → inline msg "Your vote is already counted."
  │   │   Optimistic state is correct; no rollback needed.
  │   │
  │   └─[5xx / network error]
  │         Rollback: option card returns to unselected state
  │         Inline error: "Couldn't submit your vote. Try again."
  │         Option re-enabled for retry
```

---

## Mobile Thumb-Zone Map (Audience View, 375 px)

```
┌────────────────────────────┐  ← 375px
│  [header: title + status]  │  ← 56px, top — hard to reach; info only
│                            │
│  [moment content]          │
│                            │
│  [poll option 1]           │  ← ideally in natural thumb zone
│  [poll option 2]           │
│  [poll option 3]           │  ← 56px each
│  [poll option 4]           │
│                            │
│  ─────────────────────     │
│                            │  ← bottom third = easiest reach
│  [submit / confirm CTA]    │  ← 56px, pinned near bottom when applicable
└────────────────────────────┘
```

For the emoji reaction view specifically, the 3×2 grid should sit in the bottom 60% of the viewport. The question/prompt appears above. No interaction is ever in the top 20% of the screen (thumb dead zone for one-handed use).
