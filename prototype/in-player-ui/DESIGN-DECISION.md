# Design decision — Ensemble in-player UI (prototype, round 2)

Recorded with Taste Library's `guides/decision-template.md` ([MartinPuli/taste-library](https://github.com/MartinPuli/taste-library) @ `1b67f96`, data captured 2026-10-06…14). Paths below are relative to that repo.

## Brief

Project: Ensemble, a Chrome extension that draws a few surfaces (status, toasts, system-wait cards, Invite banner, popup) on top of Netflix's web player.
Audience and primary task: two non-designer Partners watching a film. The task is the film; Ensemble's UI must be glanceable, recede, and never compete with the picture.
Available content: no imagery of our own; the "content" is whatever Netflix is playing (any colour, any brightness).
Existing identity and constraints: no Ensemble brand yet. It lives inside someone else's UI (Netflix), in fullscreen, over arbitrary video. It ships no remote code, so no web fonts.
Open assumptions: dark UI only. Netflix's player is always dark.

## Candidates

| Reference | Reason to consider it | Tradeoff or implementation cost | Source and section |
|---|---|---|---|
| Linear | Dark panels, fine translucent borders, clear type hierarchy. It also documents the exact components we need: toast surface, glass panel, pill buttons, motion | It's a dev-tool marketing page, not a media overlay, so its surfaces assume a near-black page, not video | `data/sections/linear/{colors,surfaces,elevation,actions,typography,interactions}.json` |
| Spotify | Media playback product; monochrome dark UI that "lets cover art be the only color"; a surface designed for UI over media | Its buttons and type are proprietary (SpotifyMixUI) and its green accent is brand-specific | `data/sections/spotify/{colors,surfaces,interactions}.json` |
| A24 | Film-first; strictly monochrome so film imagery is the only colour; mono for time metadata | Light editorial site, square brutalist controls; little evidence for dark floating UI | `data/sections/a24/{colors,typography,actions}.json` |
| Krea | Dark media-first app shell with a rail (relevant to variant C) | Large tool-card grid; more about browsing than overlays | `profiles/krea.md` |

## Choice

Primary reference and reason: **Linear**. Of the dark references, it is the only one whose evidence covers the components Ensemble draws: a toast surface, a glass floating panel, an invert-pill primary, a ghost secondary, a label-tag button, a circular icon button, a focus ring and UI motion curves. Its colour insight matches the brief, since the palette "entirely omit[s] saturated brand colors" (`linear/colors.json /data/insights`).

Patterns to adopt (tokens in `index.html :root`):
- **Hierarchy by lightness, not hue.** `#F7F8F8` for names and primary text, `#D0D6E0` for message body, `#8A8F98` for secondary/ghost, `#62666D` for faint metadata (`linear/colors.json /data/baseline`, `/data/secondary`).
- **Toast surface** `#1C1C1E` (`linear/surfaces.json /data/solid_colors` "Toast Background") with **Shadow Medium** `0px 4px 24px #0003`, whose listed use is "Toasts" (`linear/elevation.json /data/shadows/levels/1`).
- **Glass panels** for the pill, cards, panels and popup: `backdrop-filter: blur(20px)`, a 1px `#FFFFFF14` translucent border, panel colour `#0F1011` (`linear/surfaces.json /data/highlights`, "Glass Panel"; `linear/elevation.json /data/borders`). Popovers and menus use **Shadow High** `0px 7px 32px #00000059` (`/data/shadows/levels/2`).
- **Buttons.** All pill-shaped (`rounded-full`), 13px:
  - primary: invert `#E5E5E6` → `#FFFFFF` on hover, text `#08090A` (`linear/actions.json /data/button_list/0`);
  - secondary: ghost `#8A8F98`, hover `rgba(255,255,255,.08)` (`/data/button_list/2`);
  - Leave / Resync in panels: label-tag with a `#2E2E32` border (`/data/button_list/5`);
  - icon-only: circular icon button (`/data/button_list/6`);
  - groups spaced 8px (`/data/button_group`).
- **Type.**
  - body: 13px / 19.5px (`linear/typography.json` "Body Small");
  - labels: 12px / 14px at weight 510 ("Badge / Small Label");
  - card headings: 16px / 28px semibold ("H4 Heading");
  - Partner names at 590.
- **Mono for technical values**, i.e. timecodes such as `41:12` and Netflix error codes (Linear uses Berkeley Mono "for code segments and technical information", `/data/insights`).
- **Motion.**
  - buttons: `.16s cubic-bezier(.25,.46,.45,.94)`;
  - popovers: scale-in from `.98` over `.18s`;
  - C's log sliding out of the rail: drawer easing `cubic-bezier(.32,.72,0,1)`;
  - all from `linear/interactions.json /data/animations`.

Adaptations to our identity (recommendations, not evidence):
- **One reserved accent.** Lavender `#B7A3FF` marks only "needs your answer" (Invite ring, ask dot) and the focus ring, where Linear uses its indigo `#5E6AD2` for focus. Linear's own colour isn't copied.
- **Status as 6px dots only** (green / amber / red), never coloured borders or fills. In round 1 every toast had a coloured left border.
- **Avatars over generic icons.** Anything the other Partner did leads with their initial in a 20px circle, so "who did it" reads before the words.
- **System font stack.** Inter Variable is used on the extracted page, but we can't assume it's available, and a content script shouldn't load web fonts. Linear's own fallback chain (SF Pro / Segoe UI) is the stack.
- **Panel radius 12px, toast radius pill.** Linear's section files give no panel radius, so 12px is our choice.

Elements to leave out and why:
- grain/noise texture, edge glows, hero gradients and marquee: marketing decoration that would muddy video;
- Linear's indigo brand colour;
- grid and layout data: we have no page layout.

Second reference and its specific contribution: **Spotify**, for one thing only, its surface for UI over media: "Background Over Media" `#0000008A` (`spotify/surfaces.json /data/solid_colors`). It's the dimming scrim behind variant C's wait/alert modal and B's radial dim, and the rail gradient in C. Spotify's colour insight also supports the principle above: "avoids saturated color to let dynamic album art … stand out" (`spotify/colors.json /data/insights`). Its type, green and `scale(1.04)` hover bounce are not adopted.

## Evidence to check

Capture dates and evidence metadata: Linear captured 2026-10-10, Spotify 2026-10-08. Both are `extracted_unverified`. Linear's review (`data/reviews/linear.json`) found `#F7F8F8`, `#62666D` and `#08090A` literally in the CSS. It did not find `#D0D6E0` or `#8A8F98`, and that absence is inconclusive. It did not check rendered sizes, hover/focus behaviour, animation timing or responsive layouts.
Values that need verification: all motion timings, and the hover states (`not_checked`).
Fonts or images that need permission: none used. No Linear or Spotify assets are copied; only colour, size and timing values are reused.
Checks to run on the implemented interface:
- legibility of the glass toast over very bright scenes (snow, white rooms) as well as dark ones, since the library's evidence is all on dark pages, never over video;
- contrast of `#8A8F98` ghost text on the toast surface;
- keyboard focus on Join / Not now;
- fullscreen on her macOS Chrome.

## What the library could not answer

Placement (overlay vs control bar vs rail), fullscreen behaviour, toast timing and stacking, and UI language are not in the library: it holds website captures, not video-player overlays. Those remain the ticket's open questions.
