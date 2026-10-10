# Controlling Netflix's web player from a Chrome MV3 extension

Research for [#4](https://github.com/sebvillanueva9/ensemble/issues/4). Researched 2026-10-09.

**Question:** how can Ensemble observe and control a Partner's Netflix player reliably: read state, issue Playback Commands (play, pause, seek) without crashing the player, detect episode changes, and identify what is playing, within MV3's isolated-world / main-world split.

**Evidence labels.** *Confirmed* means read directly in a primary source: Chrome's docs, or the source code of an extension that ships this today. *Inferred* means it follows from that evidence but nobody states it. *Unknown* means it needs a hands-on test on a logged-in Netflix account. Netflix publishes **no** documentation for any of this. Everything about Netflix's internals below comes from reading other extensions' code and issue trackers.

## Answer in brief

1. **Use Netflix's internal player API from a main-world script (confirmed, widely used).** The entry point is `window.netflix.appContext.state.playerApp.getAPI().videoPlayer`. A session player from `getVideoPlayerBySessionId(id)` exposes `play()`, `pause()`, `seek(ms)`, `getCurrentTime()` (ms), `getDuration()` (ms), `isPaused()`, `isPlaying()`, `isReady()`, `getMovieId()`, `getElement()`, `getPlaybackRate()` / `setPlaybackRate()`. Firefox's own built-in Picture-in-Picture uses this API, and so do asbplayer, Video Speed Controller, Global Speed and several watch-party extensions (§2).
2. **Never write `video.currentTime` on Netflix (confirmed).** It ends playback with error M7375 (Chrome) / F7375 (Firefox). Bug reports go back to 2016 and are still being filed in 2026 (§3). `play()` / `pause()` on the `<video>` element are less dangerous, but the API's `play()` / `pause()` are the safer route.
3. **The API has been stable for about 8 years (confirmed timeline).** The same call chain shows up in code from Nov 2018 / Jan 2019, Firefox in 2022–2024, Video Speed Controller in Jun 2024, and asbplayer and others committing in Sep–Oct 2026 (§4). It is still undocumented and can break with any Netflix release.
4. **Pick the right session, not `getAllPlayerSessionIds()[0]` (confirmed).** Netflix can hold several player sessions at once. For example, it preloads the next episode, and a browse-page preview has its own session. Choose a session whose id starts with `watch`, whose `getMovieId()` equals the `/watch/<id>` in the URL, and whose `getElement()` sits inside `.watch-video` (§5).
5. **Inject with a static `"world": "MAIN"` content script and talk to it over `CustomEvent`s on `document` (confirmed pattern).** Keep extension APIs and networking in the isolated-world content script. Only the thin bridge runs in the main world. Netflix's CSP does not block this, because Chrome injects main-world content scripts directly instead of through a `<script>` tag (§6).
6. **Read state from both sources (inferred design).** Position comes from `player.getCurrentTime()`, which is the same clock `seek()` uses. `<video>.currentTime` can be offset from it (§7). User-initiated play, pause and seek, and buffering, come from the `<video>` element's events and `readyState`. No player-API event or buffering method turned up in any source.
7. **Episode identity = the numeric id in `/watch/<id>` (confirmed).** Each episode has its own id, and moving to the next episode changes the URL inside the SPA. Series, season and episode metadata come from `getAPI().getVideoMetadataByVideoId(id).getCurrentVideo()` (asbplayer), with the on-screen `[data-uia="video-title"]` as a fallback (§8).
8. **The end-of-episode UI is reachable through `data-uia` selectors (confirmed in a maintained extension, Oct 2026).** These include `next-episode-seamless-button`, `next-episode-seamless-button-draining` (the countdown), `watch-credits-seamless-button` and `interrupt-autoplay-continue` ("Are you still watching?"). They are UI hooks, not an API, and can change (§9).

## 1. Sources and how recent they are

| Source | What it shows | Last change touching the Netflix code |
|---|---|---|
| Mozilla Firefox, built-in PiP Netflix wrapper: [`browser/extensions/pictureinpicture/video-wrappers/netflix.js`](https://github.com/mozilla-firefox/firefox/blob/main/browser/extensions/pictureinpicture/video-wrappers/netflix.js) | Shipping browser code: session chosen by `watch-` prefix; `getCurrentTime`/`getDuration` in ms; `seek(position * 1000)`; `play`/`pause`/volume/mute | 2024-07-16 (still in tree; Netflix rewrite 2023-06-17, "Fix Netflix wrapper to allow scrubbing", Bug 1779454, 2022) |
| asbplayer: [`extension/src/entrypoints/netflix-page.ts`](https://github.com/asbplayer/asbplayer/blob/main/extension/src/entrypoints/netflix-page.ts) | Page-script bridge via `CustomEvent`s; `play`/`pause`/`seek`; metadata API; `preciseSeeking` override; polls up to 30 s for the API | 2026-09-30 |
| igrigorik/videospeed (Video Speed Controller): [`src/site-handlers/scripts/netflix.js`](https://github.com/igrigorik/videospeed/blob/master/src/site-handlers/scripts/netflix.js), [`manifest.json`](https://github.com/igrigorik/videospeed/blob/master/manifest.json) | Seek through `getCurrentTimeBySessionId` + `seek`; static `"world": "MAIN"` script | Netflix seek added 2024-06-17 (#984); file last touched 2026-03-27 |
| polywock/globalSpeed: [`src/contentScript/main/utils/seekNetflix.ts`](https://github.com/polywock/globalSpeed/blob/master/src/contentScript/main/utils/seekNetflix.ts), [`staticCh/manifest.json`](https://github.com/polywock/globalSpeed/blob/master/staticCh/manifest.json) | Filters sessions by `isReady()`/`isPlaying()`; corrects a `<video>` vs player clock offset; static MAIN-world script | Fix 2025-04-12; reformatted 2026-02-23 |
| bee-san/hachidori: [`extension/netflix-page.js`](https://github.com/bee-san/hachidori/blob/main/extension/netflix-page.js) | Most careful session picker (watch prefix + movie id + `.watch-video`); waits for `seeked` after `seek()` | 2026-10-08 |
| Dreamlinerm/Netflix-Prime-Auto-Skip (609★): [`src/content-script/netflix.ts`](https://github.com/Dreamlinerm/Netflix-Prime-Auto-Skip/blob/main/src/content-script/netflix.ts) | `data-uia` selectors for skip intro/recap, next-episode countdown, credits, "still watching", title | 2026-10-04 |
| VideoTogether (1.8k★, watch-together): [`source/extension/vt.js`](https://github.com/VideoTogether/VideoTogether/blob/main/source/extension/vt.js) | Sync wrapper: `play`/`pause`/`isPaused`/`getCurrentTime`/`seek`/`getDuration`/`get|setPlaybackRate` | 2025-10-15 |
| Semro/syncwatch (watch-together): [`.../players/netflix/netflix.js`](https://github.com/Semro/syncwatch/blob/master/packages/syncwatch-extension/public/js/players/netflix/netflix.js) | Same API for play/pause/seek/rate | 2024-09-13 |
| jonluca/never-ending-netflix: [`js/playerInject.js`](https://github.com/jonluca/never-ending-netflix/blob/master/js/playerInject.js) | Same call chain in an injected page script after "the Netflix update of November 2018" | 2019-01-01 to 2019-11-30 |
| Chrome docs: [content_scripts manifest](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts), [content scripts concept](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [`chrome.scripting`](https://developer.chrome.com/docs/extensions/reference/api/scripting) (updated 2026-09-11), [`chrome.webNavigation`](https://developer.chrome.com/docs/extensions/reference/api/webNavigation) (updated 2026-10-04) | `world` semantics, CSP rules, version support, SPA navigation events | as listed |
| Issue trackers (§3) | M7375 behavior and history | 2016 → 2026-09 |

Lower-trust corroboration: [SuhaasNv/watchsync](https://github.com/SuhaasNv/watchsync), a 0-star sync extension created 2026-10-02. Its `apps/extension/src/page/netflix-bridge.ts` uses the same API. Its `docs/spikes/player-control.md` is explicitly "desk research … not yet confirmed on real accounts". It counts as evidence the pattern is current, not as verification.

## 2. The player API surface

Reach it only from the page's main world (`window.netflix` is a page global; isolated-world content scripts can't see page JS variables, per [Chrome's content-scripts doc](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)).

```js
const vp = window.netflix?.appContext?.state?.playerApp?.getAPI?.()?.videoPlayer;
const ids = vp.getAllPlayerSessionIds();           // string[], e.g. "watch-…"
const player = vp.getVideoPlayerBySessionId(id);
```

| Method | Units / notes | Seen in |
|---|---|---|
| `play()`, `pause()` | may return a Promise | Firefox PiP, asbplayer, VideoTogether, syncwatch, never-ending-netflix |
| `seek(ms)` | absolute position, milliseconds | all of the above, videospeed, globalSpeed, hachidori |
| `getCurrentTime()` | milliseconds | Firefox PiP, VideoTogether, globalSpeed, hachidori |
| `vp.getCurrentTimeBySessionId(id)` | milliseconds | videospeed |
| `getDuration()` | milliseconds | Firefox PiP, VideoTogether |
| `isPaused()` | | VideoTogether |
| `isPlaying()`, `isReady()` | | globalSpeed |
| `getPlaybackRate()`, `setPlaybackRate(r)` | useful for gentle Drift correction | VideoTogether, syncwatch |
| `getMovieId()` | the episode/movie id, same as `/watch/<id>` | asbplayer, hachidori |
| `getElement()` | player container; `querySelector('video')` finds the `<video>` | globalSpeed, hachidori |
| `getVolume`/`setVolume`/`isMuted`/`setMuted` | | Firefox PiP |
| `getAPI().getVideoMetadataByVideoId(id)` | metadata, see §8 | asbplayer |

**Not found anywhere (unknown):** a buffering or stalled accessor, an `isEnded()`, or an event subscription on the player object. Plan to get those from the `<video>` element (§7).

## 3. Why not `video.currentTime`: error M7375

- **Confirmed, long-standing.** Writing `currentTime` on Netflix's `<video>` crashes playback with M7375. Reports: videospeed [#84](https://github.com/igrigorik/videospeed/issues/84) (2016), [#260](https://github.com/igrigorik/videospeed/issues/260) (2017), [#897](https://github.com/igrigorik/videospeed/issues/897) (2021); LongDistance (a sync extension) [#10](https://github.com/jonnylin13/LongDistance/issues/10) (2018); MALSync [#1537](https://github.com/MALSync/MALSync/issues/1537) (2023); easysubs [#252](https://github.com/Nitrino/easysubs/issues/252) (2024); asbplayer [#631](https://github.com/asbplayer/asbplayer/issues/631) (2025); KoalaSync [#18](https://github.com/Shik3i/KoalaSync/issues/18) (2026-07); himotoki-sub [#52](https://github.com/moikdev/himotoki-sub/issues/52) (2026-09).
- **KoalaSync, a sync extension, hit exactly Ensemble's case in July 2026.** Its play/pause tests passed, then real seeks produced "only M7375 errors". The maintainer fixed it by adding a MAIN-world bridge that calls Netflix's `.seek()` instead of writing to the element.
- **The fallback trap (confirmed).** asbplayer's 2025-01 M7375 fix ([`a3648fb9e8`](https://github.com/asbplayer/asbplayer/commit/a3648fb9e8)) did not change the seek call. It made the extension **wait (poll) for the API to appear** instead of concluding "no API" too early and falling back to `currentTime`. Lesson for Ensemble: never fall back to writing `currentTime`. If the API is missing, report "can't control the player" and retry.
- Seeking through the API in quick succession is fine in practice. hachidori and asbplayer seek repeatedly. An "M7375 on rapid skips" theory in asbplayer #631 turned out to be the fallback bug above (inferred from the fix).

## 4. Stability over time

- Same call chain, unchanged: 2018-11 / 2019-01 (never-ending-netflix: "created to fix the pausing issue after the Netflix update of November 2018"), 2022 to 2024 (Firefox PiP), 2024-06 (videospeed), 2024-09 (syncwatch), 2025-04 (globalSpeed), 2025-10 (VideoTogether), 2026-09/10 (asbplayer, hachidori, watchsync). **Confirmed** by the dated commits in §1.
- **What *has* changed (confirmed):** session handling. Firefox picks the `watch-` session. globalSpeed's 2025-04 "fix netflix issue" commit added filtering when there is more than one session. hachidori (2026-10) notes Netflix "keeps other sessions beside the watch page's, such as the next episode it prepares, and need not list that one first or last."
- **Risk (inferred):** a Netflix front-end release could rename or remove this API at any time. Nobody records a full break of the call chain in eight years, but there is no contract. Ensemble should probe the API at startup with optional chaining. When it is missing, it should tell the Partner instead of degrading to `currentTime`.

## 5. Choosing the right session

Ranked by robustness:

1. **hachidori (most robust):** `id.startsWith("watch")`, then `String(player.getMovieId()) === <id from /watch/<id>>`, then `document.querySelector(".watch-video").contains(player.getElement())`. If there is exactly one session, use it.
2. Firefox: the first id starting with `watch-`.
3. asbplayer: the **last** id. globalSpeed: `isReady()`, then `isPlaying()` if there is more than one.
4. `getAllPlayerSessionIds()[0]` (videospeed, VideoTogether, syncwatch, watchsync). This is fragile when Netflix preloads the next episode.

Re-resolve the session on every command. Don't cache the object across episode changes.

## 6. MV3 mechanics: worlds, injection, CSP, messaging

- **Worlds (confirmed, Chrome docs).** Content scripts default to `ISOLATED`: they share the DOM but not JS variables with the page. `"world": "MAIN"` "will share the execution environment with the host page's JavaScript". The docs warn that "the host page can access and interfere with the injected script". A MAIN-world script has no `chrome.runtime` messaging, so it needs an isolated-world partner script.
- **Version support (confirmed).** `chrome.scripting` `ScriptInjection.world` since Chrome 95, `RegisteredContentScript.world` since Chrome 102 ([scripting reference](https://developer.chrome.com/docs/extensions/reference/api/scripting), updated 2026-09-11). Static manifest `"world"` landed around Chrome 111 (from memory, not stated on the current docs page). Irrelevant in practice for current Chrome.
- **Recommended injection (confirmed pattern).** Two static `content_scripts` entries for `https://www.netflix.com/*`: an isolated script (extension logic and messaging) and a MAIN-world bridge, as videospeed and globalSpeed do. Alternatives in the wild: a `<script src=chrome-extension://…>` tag pointing at a `web_accessible_resources` file (asbplayer, syncwatch), or `chrome.scripting.executeScript({world: "MAIN"})` (watchsync uses it to re-inject into tabs already open at install or update time, because Chrome adds manifest content scripts only to pages loaded after install).
- **CSP (confirmed with one unknown).** Chrome's docs say that "when a content script is injected into the main world, the CSP of the page applies". That governs what the script may *do*, for example `eval` or loading remote code, not whether Chrome injects it. Manifest MAIN-world scripts are injected by the browser, not through a page `<script>` element. A bridge that only calls functions and dispatches events doesn't hit CSP. *Unknown:* Netflix's actual CSP header. The fetch was blocked from this environment, which doesn't matter for the static-MAIN-world route.
- **Messaging between worlds (confirmed pattern).** `document.dispatchEvent(new CustomEvent("ensemble:…", {detail: JSON.stringify(...)}))` in both directions (asbplayer, globalSpeed, hachidori, watchsync), or `window.postMessage` with an origin check (videospeed, syncwatch). Use a JSON *string* in `detail`, since objects don't cross worlds cleanly (globalSpeed and watchsync both stringify). The page can see and forge these events, so validate every payload and never let it trigger anything beyond play, pause and seek on the current tab. Use request ids and answer once: watchsync notes that after an extension update the page can hold both the old and new bridge.
- **Interception side-effects (caution).** asbplayer overrides `Function.prototype.apply` to force Netflix's `preciseSeeking` flags to true (2024-04 commit "Speculative fix for seeking precision issues on netflix"). This implies Netflix's default `seek()` may land a little off the requested time. That matters for Drift (§7). Patching globals like this is invasive. Ensemble should measure seek accuracy first (unknown) rather than copy the hack.

## 7. Reading state: position, play/pause, buffering, Drift

- **Position.** Use `player.getCurrentTime()` (ms). Netflix seeks on this clock, and hachidori calls it "Netflix's own clock". globalSpeed's 2025-04 fix computes `start = video.currentTime − player.getCurrentTime()/1000` before seeking. That shows the `<video>` element's `currentTime` **is not always equal** to Netflix's timeline (confirmed in code; cause unknown, possibly ad insertion or segment stitching). Exchange positions on the player clock only.
- **Playing/paused.** `player.isPaused()` / `isPlaying()`, or the `<video>` element's `paused`.
- **User actions.** Listen to the `<video>` element's `play`, `pause`, `seeking`, `seeked`, `ratechange` events. Isolated-world scripts can do this because the DOM is shared. Ensemble must suppress the echo of its own Playback Commands, for example by tagging an expected state for a short window after each command (watchsync uses 1.5 s). After a `seek()`, wait for `seeked` before treating the position as settled (hachidori).
- **Buffering/stalled (inferred).** No player-API accessor was found. Use `<video>` `waiting` / `playing` / `stalled` events and `readyState < HAVE_FUTURE_DATA (3)` while not paused. This is standard HTML media behavior and is what watchsync does.
- **Ad breaks (unknown, matters if either Partner's plan has ads).** Netflix ad detection in the wild relies on a hashed CSS class (`span[class*="mmvz9h"]` in Netflix-Prime-Auto-Skip). That is very brittle. The sibling research ([#7, netflix-regional-titles](https://github.com/sebvillanueva9/ensemble/blob/research/netflix-regional-titles/research/netflix-regional-titles.md)) assumes a shared no-ads plan, which avoids the problem.

## 8. Identifying the title and episode

- **Episode/movie id (confirmed).** `/^\/watch\/(\d+)/` on `location.pathname`. Every episode has its own id. `player.getMovieId()` returns the same value for the playing session. The sibling research #7 covers whether ids match across BO/FR.
- **Metadata through the API (confirmed in asbplayer, 2026-09).** `getAPI().getVideoMetadataByVideoId(id).getCurrentVideo()`, then `getTitle()`, `isEpisodic()`, `getSeason()._season.seq`, `getEpisodeNumber()`, `getEpisodeTitle()`. asbplayer retries up to 5× at 1 s, because metadata can arrive after the player. Alternative state path: `playerApp.getState().videoPlayer.videoMetadata[id]` (watchsync). The `_season` / `_video` fields are minified-looking internals and fragile, so wrap them in `try` and fall back.
- **On-screen fallback (confirmed).** `[data-uia="video-title"]` holds `<h4>Show</h4><span>S1:E3</span><span>Episode name</span>`, but only while the controls are visible.

## 9. Episode end, post-play, next episode, picking another episode

- **Navigation (confirmed, Chrome docs + code).** Netflix is an SPA. Next episode, autoplay and picking an episode from the episode list all change `/watch/<id>` without a page load. Detection options:
  - `chrome.webNavigation.onHistoryStateUpdated` with a URL filter for `www.netflix.com/watch/` in the service worker. This fires on `history.pushState`. It needs the `"webNavigation"` permission. Its install warning ("Read your browsing history") is from memory and not on the API page; it's acceptable for an unlisted two-user extension.
  - Or, in the content script, watch `location.pathname` (poll about once a second or use a `MutationObserver`). Then re-resolve the session and wait for `getMovieId()` to match.
  - **Unknown:** whether Netflix uses `pushState` or `replaceState` for autoplay-next. Both update the URL. Polling the pathname covers both.
- **Post-play / countdown UI (confirmed in Netflix-Prime-Auto-Skip, 2026-10-04):**
  - `[data-uia="next-episode-seamless-button"]`: the "Next episode" button over the credits.
  - `[data-uia="next-episode-seamless-button-draining"]`: the same button while the autoplay countdown drains.
  - `[data-uia="watch-credits-seamless-button"]`: "Watch credits".
  - `[data-uia="interrupt-autoplay-continue"]`: "Are you still watching?" interrupt. This one fires on one Partner only and will pause that player.
  - `[data-uia="player-skip-intro"]`, `player-skip-recap`, `player-skip-preplay`: skip buttons. Clicking these seeks, so they will show up as a user seek.
  - Watch them with a `MutationObserver`. A click on "Next episode" is detectable by listening for clicks on that selector. The resulting URL change is the authoritative signal.
- **Episode end (inferred).** Netflix usually leaves the episode during the credits (seamless next / post-play), so the `<video>` `ended` event may never fire. Treat "URL id changed" as the episode boundary. Treat the countdown selector appearing as "post-play started", for example to sync whether both Partners continue or watch credits.

## Recommended shape for Ensemble (inferred from the above)

- **MAIN-world bridge** (tiny, no extension APIs). It resolves the session (§5) and handles `play`, `pause`, `seek(ms)`, `setPlaybackRate(r)`, `getState`, and `getMeta`. It answers through a `CustomEvent` with a request id. It never touches `video.currentTime`.
- **Isolated content script.** It observes the `<video>` events, URL changes and post-play selectors, turns user actions into Playback Commands (suppressing echoes), applies remote Playback Commands through the bridge, and measures Drift with `getCurrentTime()`. Resync either seeks or nudges the playback rate. Rate nudging may be gentler than repeated seeks; that is untested.

## Risks and unknowns

- **Undocumented API (risk).** It has been stable for about 8 years, but there is no contract. Detect it, degrade loudly, and keep all Netflix-specific code in one adapter.
- **ToS (risk, unassessed here).** Automating Netflix's player is not sanctioned by Netflix. Many public extensions do it, including Firefox itself for PiP.
- **Seek precision (unknown).** How far `seek(ms)` lands from the target without the `preciseSeeking` hack. This sets the floor for the Drift limit. *Test:* 20 seeks, compare target vs `getCurrentTime()` after `seeked`.
- **`<video>` vs player clock offset (unknown cause).** Test whether `video.currentTime − getCurrentTime()/1000` is non-zero on a normal (no-ads) title, and whether it changes across episodes.
- **Next-episode preload session (confirmed exists, behavior unknown).** Verify the session picker during the credits countdown and right after autoplay.
- **Autoplay-next URL mechanism (unknown).** `pushState` vs `replaceState` vs a full load. Verify on a real series.
- **"Are you still watching?" and ads (risk).** Each fires per Partner and pauses one side only. Ensemble needs to treat them as a pause by that Partner, or as a "waiting" state.
- **API availability timing (confirmed risk).** `window.netflix` and the session appear some time after page load. asbplayer polls for up to 30 s. Never fall back to `currentTime` meanwhile.
- **Netflix CSP header (unknown, low impact).** It can't affect static MAIN-world injection, but it would matter for any `<script>`-tag approach.
