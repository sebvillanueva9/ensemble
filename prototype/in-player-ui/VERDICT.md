# Verdict: Prototype the in-player UI

Question: how Ensemble's surfaces look and read inside the Netflix player and the popup. The ticket asked for placement, fullscreen behaviour, toast timing and stacking, and language. Ticket: [sebvillanueva9/ensemble#24](https://github.com/sebvillanueva9/ensemble/issues/24).

Decided with Sebastian on 2026-10-25:

- **Variant B wins.** Ensemble is an "e" button inside Netflix's own control bar.
  - Its badge colour shows: question (lavender), problem (red), connection trouble (amber), in a Watch Session (green).
  - Notices appear as **one caption line** centred above the controls, in priority order: question, then problem, then toast. A "+N" count shows what's queued.
  - **System waits** dim the picture with a centred message and Play. Clicks still reach Netflix's controls.
  - The button opens a **panel**: Partner and connection, Resync / Leave or Watch together, and an **activity log** of every Notice.
- **Fullscreen and idle.** The button hides with Netflix's controls. The caption line and waits still appear, and drop to the bottom edge while the controls are hidden. While the controls are visible, the caption line sits above them, with a transform-based lift.
- **Language** follows the Netflix page's `<html lang>`: Spanish for `es`, otherwise English. In practice his side is English and hers is Spanish. The UI never names countries.
- **Spanish** is neutral Latin American: *presiona*, *puedan*, no *vosotros*.
- **Timing:**
  - Playback Command toasts: 2s.
  - Session and pairing toasts: 3–5s.
  - Resync: a "Resyncing…" toast that resolves to "Back in sync" (2s).
  - Waits, questions and problems stay until resolved.
  - Timers run in real time, pause while the tab is hidden or the pointer rests on a Notice, and expire even if the toast never got on screen.
- **Behaviour carried into the spec** (from the round 2 and 3 reviews):
  - one updating toast per Partner for Playback Commands;
  - a caption that crossfades when its message changes;
  - exits that dissolve in about a quarter second;
  - names and titles escaped, trimmed and capped at 40 characters, with a grapheme-aware initial;
  - nothing overflowing a 640px player;
  - reduced motion, reduced transparency and contrast preferences respected;
  - polite and assertive live regions for screen readers.

Visual language: [DESIGN-DECISION.md](DESIGN-DECISION.md). Behaviour and motion rules, plus the spec recommendations: [SKILLS-REVIEW.md](SKILLS-REVIEW.md).
