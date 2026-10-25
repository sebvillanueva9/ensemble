# Skills review — Ensemble in-player UI (prototype, round 3)

Source: [emilkowalski/skills](https://github.com/emilkowalski/skills) @ `2d22863` (2026-10-11), by the author of the Sonner toast library. Paths below are relative to its `skills/` folder. Round 2's visual language ([DESIGN-DECISION.md](DESIGN-DECISION.md)) is unchanged; this round fixes **behaviour, motion and robustness**.

## How it was used

Four reviewers ran in parallel. Each read a group of skills and audited `index.html` against them; none edited it.

| Reviewer | Skills read |
|---|---|
| Design engineering | `emil-design-eng`, `apple-design` |
| Strict animation and performance | `review-animations` (+ STANDARDS), `animation-performance`, `performance-cheatsheet.md`, `animation-vocabulary` |
| Worst-case data | `break-ui` (+ CATALOG). This reviewer rendered a copy at 640px with hostile data. |
| Toasts and library choice | `ask-sonner` (+ API), `pick-ui-library`, `find-animation-opportunities` |

I merged their findings, re-checked the disputed ones, and applied them. Then I verified the result in a real browser tab with scripted checks and screenshots.

Not used:
- `write-swift`, `animate-expo` and `mobile-native`: wrong platform.
- `prototype`: we already have a prototype switcher.
- `improve-animations`: a codebase-wide planning tool, overkill for one file.

## What changed

### Behaviour bugs (found by two or more reviewers)

| Change | Rule it comes from | Variants |
|---|---|---|
| **The DOM is now patched by key, not rebuilt.** Every Notice used to replay every visible toast's entrance animation, so in bursts they "bounced" every 700ms. Now only new nodes animate in. | `emil-design-eng` "Use CSS transitions over keyframes…" (keyframes restart from zero); `review-animations` Std 6 / Interruptibility | A B C |
| **Things animate out.** Toasts, cards, the banner and menus used to vanish. They now exit in 140ms (faster than the 180ms enter) along the edge they came from: down for A, right into the rail for C, up for A's banner. The remaining toasts slide into place (FLIP). | `emil-design-eng` "What is the purpose?"; `apple-design` §7 "Enter and exit along the same path"; `review-animations` STANDARDS "Easing" | A B C |
| **A's centre card no longer jumps on entry.** Its `scaleIn` overwrote its centring transform, so for 180ms it sat off-centre and then snapped into place. Centring now uses the separate `translate` property. | `emil-design-eng` "Debugging Animations"; `review-animations` Std 5 | A |
| **C's dimmed modal no longer blocks Netflix.** Scrub, back and exit-fullscreen were unclickable during a wait; now only the message box catches clicks. | `apple-design` §16 "Never trap the user" | C |
| **One updating toast per Partner for Playback Commands.** "Ana paused at 41:12" → "Ana played from 41:12" now rewrites the same toast and restarts its timer instead of stacking four. Invite outcomes and Resync each get a slot too. | `ask-sonner` API.md `id` ("calling `toast()` again with the same id updates…") | A B C |
| **Resync is a "loading" toast** ("Resyncing…" → "Back in sync with Ana") instead of a fake system wait. | `ask-sonner` `toast.promise`, including the "a promise that never settles waits forever" warning: the engine needs a timeout | A B C |
| **Toast timers only run while the toast is on screen and the tab is visible.** In B, toasts queued behind a question used to expire without ever being shown. | `emil-design-eng` "Sonner Principles" #4 | A B C (B most) |
| **Blocking problems route on an explicit `blocking` flag** (stuck, extension updated, unavailable, can't control) instead of "has a subtitle". "Ensemble was updated" (Reload) now lives where "Your player is stuck" (Reload) lives. | `apple-design` §16 Familiarity | A C |

### Robustness (break-ui)

| Change | Catalog entry | Variants |
|---|---|---|
| **All names and titles are escaped.** A Partner name like `<img onerror=…>` used to **run script** (5× per render), and a `"` in a name broke out of attributes. Names arrive over the network in the real extension, so this is a spec requirement, not just a prototype fix. | "Labels, titles, and copy from data" | all + popup |
| **Avatar initial is grapheme-aware.** 🦊 Fox → 🦊 (was a broken half-emoji), "dana" → D, an empty or whitespace name → "?" with the fallback "Your Partner". Names are trimmed, capped at 40 characters, and isolated for right-to-left text (`<bdi>`). | "People and names" | all + popup |
| **Nothing overflows a 640px player.** Every surface has a `max-width` from the player's own width (container query units), text can wrap, buttons never shrink, and long names truncate with an ellipsis (full name on hover). Spanish error lines used to push "Cerrar" off-screen. | "Environment", "Labels"; "Trailing action pushed off-screen" | A B |
| **Stacks are capped:** 3 items, or 2 on a player under 720px wide. The rest collapse into "+N more". Persistent problems keep their place ahead of short-lived toasts (this bug turned up during my own testing). | "Collections"; `ask-sonner` `visibleToasts` default 3 | A C |
| **No more collisions.** A's status pill steps aside while the Invite banner is up. B's caption line hides while its panel is open. | "Every status at once" | A B |
| **Popup fixes.** The Partner gets their own line, presence truncates, the diagnostics buttons stack, and the name field has `maxlength` and `dir=auto`. | "Container at 320px" | popup |
| **Korean titles no longer break mid-word** (`word-break: keep-all`). | "CJK breaks anywhere" | all |
| **The activity log's empty state** reads "Nothing yet tonight" instead of an orphan "—". | "Orphaned —" | B |

### Motion and performance

| Change | Rule it comes from |
|---|---|
| Lifting the bottom surfaces above Netflix's controls now uses `transform` (250ms ease-in-out) instead of animating `bottom`. | `animation-performance` "Swapping down a tier"; `emil-design-eng` "Only animate transform and opacity" |
| Blur: chips 12px, panels 20px. **No blur on full-screen scrims**: full-screen blur over playing video is the most expensive layer we had. | `animation-performance` "Blur"; `emil-design-eng` "keep blur ≤20px"; `apple-design` §12 (bigger surface = thicker material) |
| Enter and exit use a strong ease-out `cubic-bezier(.23,1,.32,1)`, on-screen moves use ease-in-out, and colour changes keep Linear's curve. All UI motion is ≤250ms (C's log was 500ms, its fade 1s). | `emil-design-eng` "What easing…", "How fast…"; `review-animations` Std 3, 4 |
| Press feedback is `scale(.97)` on every button. | `emil-design-eng` "Buttons must feel responsive" |
| `transition: all` is replaced by explicit property lists. | `animation-performance` Hard Rule 4 |
| B's caption crossfades with `blur(2px)` when its message changes. | `emil-design-eng` "Use blur to mask…" |
| Keyboard Space clearing a wait removes it instantly, without animation. | `emil-design-eng` "Never animate keyboard-initiated actions" |
| Text that updates in place (paused → played, timecodes) does not animate. | `find-animation-opportunities` Gate 4 |
| Added `prefers-reduced-motion` (gentler, not zero), `prefers-reduced-transparency` (solid panels) and `prefers-contrast: more`. | `emil-design-eng` "Accessibility"; `review-animations` Std 8; `apple-design` §14 |
| Hover effects only run on real pointers (`hover: hover`). | `emil-design-eng` |
| Screen readers: a polite live region for toasts, an assertive one for questions and blocking problems, and a labelled region. *My judgment: the skills only name `containerAriaLabel`.* | `ask-sonner` API `containerAriaLabel` |
| No text darker than `--tx-3` on glass, and subtitles moved to `--tx-2`. The glass is a bit more opaque (82%). | `apple-design` §12 |
| B's log uses a scroll-edge fade instead of a divider line. | `apple-design` §12 "Scroll edge effects" |

### Added to the driver panel

- **Stress data** buttons: long name, emoji name, one letter, lowercase, right-to-left name, HTML name, empty name, Korean title, long title, **bright scene**, plus free-text fields for the name and title.
- An **"everything at once"** scenario.

## Verified in a browser

Checked in a 1280×800 tab against a local server, via scripted DOM checks and screenshots:
- **Toasts:**
  - one toast per Partner across paused, played and seeked;
  - an existing toast node survives a new Notice (no replay);
  - the last toast animates out and is removed;
  - siblings slide into place;
  - B's caption crossfades, with two lines overlapping briefly.
- **Clicks and timers:**
  - buttons inside A's stack and C's log are clickable;
  - empty stack space passes clicks through to the video;
  - C's modal lets clicks reach the player while its Play button stays clickable;
  - B's toast timer is paused during a system wait;
  - a keyboard Play removes the dim instantly.
- **Data and layout:**
  - the HTML-name injection no longer runs (0 executions, 0 injected nodes);
  - emoji and empty initials;
  - the Spanish error line stays inside a 640px player;
  - A's centre card is exactly centred mid-animation;
  - legible over a bright white scene.

Not verified:
- the reduced-transparency and contrast media queries (no OS toggle in the test browser);
- real fullscreen;
- macOS.

One correction: two reviewers reported that buttons in A's stack and C's log couldn't be clicked. The CSS made that unlikely, and I couldn't confirm it before the rewrite. After the rewrite, these buttons have explicit `pointer-events` and are verified clickable.

## Round 3.1: after Sebastian's feedback

Sebastian reported two problems: toasts seemed to stay longer than before, and they disappeared abruptly instead of fading out.

**Correction to "Verified in a browser" above.** Two of the claims there were checked only in the page structure, not on screen: "animates out" and "siblings slide into place". The test panes never painted a frame: the in-app pane was hidden, and the Chrome window was covered by other windows. Animation time stayed frozen at 0, so no exit motion was ever actually observed.

**Exit: diagnosis and fix**
- **Diagnosis.** The round 3 exit was a single 140ms strong ease-out applied to opacity and motion together. About 70% of the fade happens in the first ~35ms, so on screen it reads as a cut. The neighbouring toasts also only started moving after the exit finished, so they jumped and then slid.
- **Fix: a dissolve.**
  - Motion and blur run 220–260ms on the drawer curve (`.32,.72,0,1`): the toast shrinks to 96%, drifts 6–24px along its exit edge, and blurs to 4px.
  - Opacity runs on its own accelerating curve (`.4,0,.9,.6`), so it is still about 0.9 after 80ms and only drops out at the end.
  - A leaving stack item is lifted out of the layout at once, and its neighbours glide into the gap. They wait 80ms first, so they don't slide over a still-sharp toast.
- **Checked by stepping the paused animation:**
  - 0ms: opacity 1.00, no blur.
  - 80ms: 0.90, blur 3.4px.
  - 160ms: 0.65.
  - 240ms: 0.20.
  - 260ms: gone.
  - A screenshot frozen at 130ms shows the toast dissolving while the one above glides down.
- **Deviation from `emil-design-eng`.** It says exits should be shorter and subtler than entrances. Ours is now longer (260ms vs 180ms) because, over a film, a too-subtle exit was perceived as a glitch. Still within the "UI under 300ms" rule.

**Timing: diagnosis and fix**
- **Diagnosis.** Round 3 paused a toast's timer whenever the toast wasn't on screen: behind a wait in B and C, or past the stack cap. Stale toasts like "Ana paused at 41:12" could then reappear after a wait and stay another 3s.
- **Fix.**
  - Timers run in real time. They pause only while the tab is hidden, or while the pointer rests on a Notice so it can be read or clicked. *Pause-on-hover is my judgment, not stated in the skills.*
  - A toast that never got on screen simply expires; B's activity log still records it.
  - Durations are unchanged: 3s for Playback Commands, 4–8s for session and pairing toasts.
- **Measured:**
  - a single toast leaves at about 3.0s;
  - the four-command burst clears about 5s after the first command, the same as round 1;
  - a toast fired just before a wait in C expires during the wait instead of reappearing after it;
  - hovering holds the timer.

**A bug found by watching it live.** On Sebastian's screen, the last toast in A's stack squeezed into a one-word-per-line column while it dissolved. Lifting it out of the layout left the stack empty, so the stack shrank to 0 wide, and the toast's `max-width: 100%` followed it. The leaving item now keeps a pinned width and height with `max-width: none`. I checked all ten exits (A: last, top, middle and bottom toast, stacked alert, banner, card; B line; C last and first item): each keeps its exact size and position at the start of its exit. A frame frozen at 110ms shows the last toast dissolving as one line.

**Still to check on a real screen.** Watch an exit in your own visible browser, Chrome or the app pane in front, at normal frame rate. Under reduced motion, the exit is a plain 200ms fade.

## Recommendations for the spec (not the prototype)

1. **Notice contract, library-neutral.**
   - The engine emits typed Notices with stable ids. The UI layer applies Sonner's rules: same-id updates, `Infinity` for persistent Notices, at most 3 visible, separate dismiss and timeout events, timers paused while hidden, and a labelled live region.
   - Waits, questions and blocking problems are engine state, not toasts.
2. **Library.** `pick-ui-library` says to use Sonner, not hand-built toasts. *My judgment:*
   - Sonner needs React. It injects styles into the page `<head>`, which here would be Netflix's, and it covers only one of our five Notice classes.
   - If the UI picks React or Preact: headless Sonner (`toast.custom`), with its styles copied into our Shadow DOM, mounted inside Netflix's fullscreen element.
   - If vanilla TypeScript: a small hand-built manager following the contract above.
   - This belongs to the UI-framework decision.
3. **Rendering.** Keep the overlay in a Shadow DOM inside Netflix's fullscreen element. Patch the DOM by key, never by `innerHTML`, and never interpolate Partner names or titles into HTML.
4. **Performance checks before release** (`animation-performance` Hard Rule 3: never call it fine from a fast machine):
   - record a DevTools trace in real Netflix fullscreen on the Windows laptop and on her Mac;
   - check whether `backdrop-filter` can blur DRM-protected video at all;
   - check whether our layers stop Chrome using hardware video overlays, which costs battery.
5. **Display names.** Trim and limit to 40 characters at pairing, in the popup and in the protocol, and treat them as untrusted everywhere.
6. **4K and large screens** (*inferred, not tested*). Sizes are fixed px, so on a 4K TV at 1× scaling everything is small. Size the overlay from the player width (container units or one scale factor on the shadow host).

## Rejected

- **Springs, drag, swipe-to-dismiss and momentum:** this is a mouse-driven player, and nothing here is dragged.
- **Sound and haptics:** they would clash with the film's audio, and desktops have no haptics.
- **Staggered entrances:** Notices arrive one at a time from the network.
- **Animating digits in timecodes:** this is information people read.
- **Sonner's `richColors`:** coloured fills over a film. We keep the small status dots.
- **`rem`-based Dynamic Type** (`apple-design` §15): inside Netflix, `rem` resolves to Netflix's root size. Sizing from the shadow host instead is covered under "4K and large screens".
