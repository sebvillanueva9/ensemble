# How existing watch-together tools keep playback in sync

Research for [issue #8](https://github.com/sebvillanueva9/ensemble/issues/8). Researched 2026-10-09.

**Question:** How do existing watch-together tools keep playback in sync, and which techniques fit a two-Partner, no-host, Netflix-only v1? (Drift < ~1s over a full movie, Playback Commands mirrored within ~1s, auto-recovery after buffering, ~200ms+ RTT between Bolivia and France.)

Terms follow `GLOSSARY.md`: **Partner**, **Watch Session**, **Playback Command**, **Drift**, **Resync**.

## How to read this

- **Confirmed** means I read it in the source code or first-party docs linked next to the claim. Links are pinned to the commit I read.
- **Inferred** means my own reasoning or extrapolation. It is not stated by any source.
- Where a tool keeps its internals private, I say so and don't guess.

## Sources and how recent they are

| Source | What it is | Freshness | Trust |
|---|---|---|---|
| [Syncplay](https://github.com/Syncplay/syncplay) @ `2af7ace` | Open-source sync for desktop players (mpv/VLC/MPC). It has been running since 2012. | Active. Release v1.7.6 on 2026-08-04, and `client.py` last changed on 2026-08-20. | High. These are the primary sources. |
| [Jellyfin SyncPlay](https://github.com/jellyfin/jellyfin-web/tree/fc80baea16a8e9a29d1cb34c9a9a014988b41cb4/src/plugins/syncPlay) (web client @ `fc80bae`) + [server](https://github.com/jellyfin/jellyfin/tree/a45d1415d4da7c9b69d6e7a6895fc63d2d68e8f1/MediaBrowser.Controller/SyncPlay) @ `a45d141` | Group playback in a self-hosted media server, with browser clients. | Active. Server release v12.2 on 2026-10-05. Client `PlaybackCore.js` last changed on 2025-03-27. | High. These are the primary sources. |
| Netflix Party v1.7.11 content script, via [kliu128/netflix-party-reborn](https://github.com/kliu128/netflix-party-reborn) @ `cdac3b3` | A verbatim fork of the Netflix Party extension. Netflix Party later became Teleparty. | **Old.** Repackaged in April 2020, from code copyrighted 2016–2018. Netflix's DOM has changed since then. | Medium. This is the real shipped code, but it is dated. |
| Original Netflix Party server (Stephan Boyer), via [dude8604/pynetflixparty-server `index.js`](https://github.com/dude8604/pynetflixparty-server/blob/a64c878a2ed0abad85dd9f876d34d1ac6708d49e/index.js) | Node relay server. | **Very old** (2016). The original `boyers/netflixparty*` repos now return 404. | Medium. Good for the architecture only. |
| [VideoTogether](https://github.com/VideoTogether/VideoTogether) @ `3c61f12` | Open-source watch-together extension and userscript. It has a Netflix adapter. | Fairly recent. `vt.js` last changed on 2025-10-15. | Medium-high. |
| [Video Speed Controller](https://github.com/igrigorik/videospeed) @ `8f9bc13`, [Global Speed](https://github.com/polywock/globalSpeed) @ `8e37a47`, [asbplayer](https://github.com/asbplayer/asbplayer) | Popular extensions that control the Netflix player. They are not sync tools. | Active in 2026. | Medium-high, but only as evidence of how Netflix can be controlled. |
| [Chrome docs: content scripts `world`](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts) | First-party. | Current. | High. |
| Teleparty | The commercial successor to Netflix Party. | n/a | **Closed source.** I found no engineering write-up. Its docs and marketing describe behaviour only. **I make no claims about its internals.** |

## 1. The shared state model

All three primary-source tools use the same core idea. A Playback Command does not travel as a bare event. It travels as **a state snapshot with a timestamp**, and while playing, the receiver extrapolates the position from that snapshot.

- **Netflix Party.** The session state is `{lastKnownTime, lastKnownTimeUpdatedAt, state: 'playing'|'paused'}`. The expected position is `lastKnownTime + (now − lastKnownTimeUpdatedAt − clockOffset)` while playing. *Confirmed:* [server state shape](https://github.com/dude8604/pynetflixparty-server/blob/a64c878a2ed0abad85dd9f876d34d1ac6708d49e/index.js#L36-L52), [client `sync()`](https://github.com/kliu128/netflix-party-reborn/blob/cdac3b328e9413ff59263aff04109fe52216ccbf/content_script.js#L2574-L2630).
- **Syncplay.** The global state is `{position, paused, lastGlobalUpdate}`. `getGlobalPosition()` adds the elapsed time while playing. *Confirmed:* [`client.py#L544-L551`](https://github.com/Syncplay/syncplay/blob/2af7ace347f437d44cd809a65c049e82bb4027fb/syncplay/client.py#L544-L551).
- **Jellyfin.** Every command carries `PositionTicks` and a `When`, which is a server-clock instant. The client estimates the current server position from those two values. *Confirmed:* [`PlaybackCore.js#L508-L545`](https://github.com/jellyfin/jellyfin-web/blob/fc80baea16a8e9a29d1cb34c9a9a014988b41cb4/src/plugins/syncPlay/core/PlaybackCore.js#L508-L545).
- **VideoTogether.** The room state is `{currentTime, paused, playbackRate, lastUpdateClientTime}`. The expected position is `currentTime + (now − lastUpdateClientTime) × playbackRate`. *Confirmed:* [`vt.js#L3446-L3450`](https://github.com/VideoTogether/VideoTogether/blob/3c61f12b84523abed497f690754487b5c21ec6d3/source/extension/vt.js#L3446-L3450).

**Inferred for Ensemble:** I recommend the same model. Each Partner holds a shared state `{paused, position, at, version, setBy}`. Drift is then `localPosition − expectedPosition(sharedState, now)`. Each Partner can compute this locally, at any time, without a round trip.

## 2. Clock sync and comparing positions over a ~200ms RTT link

The tools take two different approaches.

**A. NTP-style clock offset.** Used by Jellyfin, Netflix Party and VideoTogether.

- **Jellyfin** uses the four-timestamp NTP calculation, `offset = ((t2−t1) + (t3−t4)) / 2` and `delay = (t4−t1) − (t3−t2)`. It keeps the last 8 samples and **uses the sample with the lowest delay**. It pings every 1s at first ("greedy", 3 pings), then every 60s. *Confirmed:* [`TimeSync.js#L11-L14, L37-L47, L98-L109`](https://github.com/jellyfin/jellyfin-web/blob/fc80baea16a8e9a29d1cb34c9a9a014988b41cb4/src/plugins/syncPlay/core/timeSync/TimeSync.js#L11-L109).
- **VideoTogether** uses Cristian's algorithm, `offset = serverTs − (start + end)/2`. It only accepts a new sample if its round trip is shorter than the best one seen so far. *Confirmed:* [`vt.js#L3617-L3624`](https://github.com/VideoTogether/VideoTogether/blob/3c61f12b84523abed497f690754487b5c21ec6d3/source/extension/vt.js#L3617-L3624).
- **Netflix Party** pings the server every 5s. It takes the **median of the last 5** RTTs and offsets, with `offset = (now − RTT/2) − serverTime`. *Confirmed:* [`content_script.js#L2547-L2570`](https://github.com/kliu128/netflix-party-reborn/blob/cdac3b328e9413ff59263aff04109fe52216ccbf/content_script.js#L2547-L2570) and [the 5s interval](https://github.com/kliu128/netflix-party-reborn/blob/cdac3b328e9413ff59263aff04109fe52216ccbf/content_script.js#L2949-L2960).

**B. No shared clock, only "message age".** Used by Syncplay.

- Each side echoes the other side's own send timestamp back to it. The sender measures RTT on its own clock, so no cross-clock comparison is needed. RTT is smoothed with an exponential moving average (weight 0.85). The forward delay is estimated as `avgRTT/2`, plus a correction if the latest RTT exceeds the peer's RTT. When a playing state arrives, the receiver adds `messageAge` (the forward delay) to its position. *Confirmed:* [`PingService`, `protocols.py#L816-L844`](https://github.com/Syncplay/syncplay/blob/2af7ace347f437d44cd809a65c049e82bb4027fb/syncplay/protocols.py#L816-L844), [`updateGlobalState` adds `messageAge`](https://github.com/Syncplay/syncplay/blob/2af7ace347f437d44cd809a65c049e82bb4027fb/syncplay/client.py#L490-L497), [`PING_MOVING_AVERAGE_WEIGHT = 0.85`](https://github.com/Syncplay/syncplay/blob/2af7ace347f437d44cd809a65c049e82bb4027fb/syncplay/constants.py#L231).

**Inferred:**
- Both approaches share the same error bound: half the RTT asymmetry. That is at most ~RTT/2 ≈ 100ms at 200ms RTT, which is an order of magnitude below the 1s Drift budget. Clock sync is **not** the hard part.
- With two Partners and no host, there is no server clock to sync to. Each Partner can either estimate the offset to the other Partner's clock (NTP-style; take the minimum-RTT sample, as Jellyfin and VideoTogether do), or use Syncplay's approach and stamp each state with its age.
- I lean towards the minimum-RTT NTP offset. It lets a state carry an absolute `at` timestamp, which also makes ordering concurrent commands easier (see §5).

## 3. Drift correction: hard seeks vs. playback-rate nudging

| Tool | Dead zone | Rate nudge | Hard seek | Other |
|---|---|---|---|---|
| **Syncplay** | <1.5s (configurable, min 1.3s) | **Slow down only:** 0.95× when the client is *ahead* by more than 1.5s, back to 1.0× when within 0.1s | Rewind if ahead by more than 4s. Fast-forward if behind by more than 5s, only for non-controllers or with "don't slow down with me". | A change only counts as a user seek if it moves more than 1s (`SEEK_THRESHOLD`). |
| **Jellyfin** | <60ms | "SpeedToSync" from 60ms to 3000ms: `speed = 1 + diff/1000ms`, applied for 1s (so it can **speed up or slow down**), floor 0.2× | "SkipToSync" at ≥400ms, or when the gap exceeds 3000ms | **Continuous correction has been off by default since Nov 2023.** |
| **Netflix Party** | <2.5s (`maxTimeError`) | none | Seek when off by more than 2.5s | After a seek, if still *ahead* by up to 2.5s, **"freeze"**: pause for the difference, then play. |
| **VideoTogether** | <1s | none (it only mirrors the room's chosen rate) | Seek when off by more than 1s while playing, or more than 0.1s while paused | none |

Sources (all *Confirmed*):
- Syncplay: [`constants.py#L72-L87`](https://github.com/Syncplay/syncplay/blob/2af7ace347f437d44cd809a65c049e82bb4027fb/syncplay/constants.py#L72-L87), [`_slowDownToCoverTimeDifference` and `_changePlayerStateAccordingToGlobalState`, `client.py#L434-L488`](https://github.com/Syncplay/syncplay/blob/2af7ace347f437d44cd809a65c049e82bb4027fb/syncplay/client.py#L434-L488), [`_determinePlayerStateChange`, `client.py#L218-L223`](https://github.com/Syncplay/syncplay/blob/2af7ace347f437d44cd809a65c049e82bb4027fb/syncplay/client.py#L218-L223).
- Jellyfin: [defaults, `PlaybackCore.js#L50-L69`](https://github.com/jellyfin/jellyfin-web/blob/fc80baea16a8e9a29d1cb34c9a9a014988b41cb4/src/plugins/syncPlay/core/PlaybackCore.js#L50-L69), [strategy, `#L558-L596`](https://github.com/jellyfin/jellyfin-web/blob/fc80baea16a8e9a29d1cb34c9a9a014988b41cb4/src/plugins/syncPlay/core/PlaybackCore.js#L558-L596). For why it was turned off: [PR #2946](https://github.com/jellyfin/jellyfin-web/pull/2946) (2021) disabled it on mobile "because it causes constant stuttering", and [PR #5003](https://github.com/jellyfin/jellyfin-web/pull/5003) (merged 2023-11-29, issue [#4972](https://github.com/jellyfin/jellyfin-web/issues/4972)) disabled it everywhere. The maintainers' TODOs in the code also note that SpeedToSync "sounds bad on songs" and misbehaves on Safari and Android Chrome.
- Netflix Party: [`maxTimeError = 2500`](https://github.com/kliu128/netflix-party-reborn/blob/cdac3b328e9413ff59263aff04109fe52216ccbf/content_script.js#L2526-L2529), [`sync()` seek-then-freeze](https://github.com/kliu128/netflix-party-reborn/blob/cdac3b328e9413ff59263aff04109fe52216ccbf/content_script.js#L2595-L2625), [`freeze()`](https://github.com/kliu128/netflix-party-reborn/blob/cdac3b328e9413ff59263aff04109fe52216ccbf/content_script.js#L432-L445).
- VideoTogether: [`vt.js#L3477-L3496`](https://github.com/VideoTogether/VideoTogether/blob/3c61f12b84523abed497f690754487b5c21ec6d3/source/extension/vt.js#L3477-L3496).

**Who corrects, and towards what.** Syncplay's room position is the position of the **slowest watcher**: `min(self._watchers.values())`, refreshed whenever the room state is more than 1s old. Every other client is therefore "ahead", and it is the ahead clients that slow down or rewind. Nobody is ever asked to jump forward, which is what the default config does. *Confirmed:* [`server.py#L597-L608`](https://github.com/Syncplay/syncplay/blob/2af7ace347f437d44cd809a65c049e82bb4027fb/syncplay/server.py#L597-L608). The server broadcasts state every 1s (`SERVER_STATE_INTERVAL = 1`).

**Inferred:**
- Netflix Party's "freeze" and Syncplay's "converge on the slowest" fit a two-Partner, no-host setup well. Both Partners compute the same |Drift| with opposite signs, so a rule like "**only the Partner that is ahead corrects**" gives exactly one actor, with no coordination needed.
- Pausing briefly needs no new data, so it is unlikely to rebuffer, while a seek on a streaming player usually does. The trade-off is that a pause of a few hundred ms is visible.
- Reaching the 1s Drift target needs a tighter dead zone than Netflix Party's 2.5s, around 0.5s. VideoTogether shows a 1s seek threshold is workable in practice.

## 4. Buffering

- **Netflix Party.** When the local player enters a `loading` state, the client broadcasts `buffering: true`, and the server relays `anyoneBuffering`. `waitForBuffering()` then pauses the local player until no one is buffering, **capped at 5s**, and resumes. The 2020 build has some of these waits commented out, which suggests they were tuned or abandoned. *Confirmed:* [`content_script.js#L464-L480`](https://github.com/kliu128/netflix-party-reborn/blob/cdac3b328e9413ff59263aff04109fe52216ccbf/content_script.js#L464-L480), [buffering broadcast](https://github.com/kliu128/netflix-party-reborn/blob/cdac3b328e9413ff59263aff04109fe52216ccbf/content_script.js#L2698-L2742).
- **Jellyfin** has an explicit `Waiting` group state.
  - A `Buffer` request from any member pauses the whole group.
  - The group resumes once every member reports `Ready` within `MaxPlaybackOffset = 500ms` of the group position. There is a group-wait timeout of 30s, and an "ignore wait" opt-out.
  - When playback resumes, the server sends `Unpause` with `When = now + max(2 × highestPing, 500ms)`, so every client starts at the same instant.
  - A member that reports Ready at the wrong position is sent a corrective `Seek`.
  - *Confirmed:* [`Group.cs#L101-L131`](https://github.com/jellyfin/jellyfin/blob/a45d1415d4da7c9b69d6e7a6895fc63d2d68e8f1/Emby.Server.Implementations/SyncPlay/Group.cs#L101-L131), [`PlayingGroupState.cs#L67-L73`](https://github.com/jellyfin/jellyfin/blob/a45d1415d4da7c9b69d6e7a6895fc63d2d68e8f1/MediaBrowser.Controller/SyncPlay/GroupStates/PlayingGroupState.cs#L67-L73), [`WaitingGroupState.cs#L440-L530`](https://github.com/jellyfin/jellyfin/blob/a45d1415d4da7c9b69d6e7a6895fc63d2d68e8f1/MediaBrowser.Controller/SyncPlay/GroupStates/WaitingGroupState.cs#L440-L530), and client-side [`scheduleUnpause`](https://github.com/jellyfin/jellyfin-web/blob/fc80baea16a8e9a29d1cb34c9a9a014988b41cb4/src/plugins/syncPlay/core/PlaybackCore.js#L274-L310).
- **Syncplay** has no explicit buffering message. A buffering client simply falls behind and becomes the slowest watcher. The others then slow down or rewind towards it, as described in §3. It also has an opt-in "readiness" feature, but that is about manual ready-up rather than stalls. *Confirmed:* see §3 links.
- **VideoTogether.** When the room flag `waitForLoadding` is set and this member isn't the one loading, it treats the room as paused. *Confirmed:* [`vt.js#L3477-L3481`](https://github.com/VideoTogether/VideoTogether/blob/3c61f12b84523abed497f690754487b5c21ec6d3/source/extension/vt.js#L3477-L3481).

**Inferred for Ensemble:**
- Use explicit buffering signals, as Jellyfin and Netflix Party do. When a Partner stalls, it tells the other Partner, who pauses.
- On recovery, resume both Partners with a **scheduled play**: a target position and a start time about one RTT ahead, à la Jellyfin's `When`.
- Add a timeout, so that a Partner whose stream is permanently stuck doesn't freeze the session forever.
- This is the main mechanism behind "auto-recovery after buffering".

## 5. Conflict resolution and echo suppression

**Conflicts.** None of these tools are peer-to-peer. All of them serialize commands through a server.

- **Netflix Party.** The server is last-writer-wins. On `updateSession` it overwrites the stored state and rebroadcasts it to the other users. It also compares old and new predicted times (a difference of more than 2.5s means "seeked") to produce chat messages. *Confirmed:* [`index.js#L459-L556`](https://github.com/dude8604/pynetflixparty-server/blob/a64c878a2ed0abad85dd9f876d34d1ac6708d49e/index.js#L459-L556). The client funnels every local and remote action through one promise chain (`pushTask`), "to avoid interference". *Confirmed:* [`content_script.js#L2822-L2842`](https://github.com/kliu128/netflix-party-reborn/blob/cdac3b328e9413ff59263aff04109fe52216ccbf/content_script.js#L2822-L2842).
- **Syncplay** uses `ignoringOnTheFly` counters:
  - When a client makes a local state change, it increments `clientIgnoringOnTheFly` and **ignores every incoming server state** until the server echoes that same counter back.
  - The server mirrors this with `serverIgnoringOnTheFly` after it forces a state on clients.
  - This is a small acknowledgement protocol. It prevents a stale in-flight state from undoing a fresh local command.
  - *Confirmed:* [`protocols.py#L279-L325`](https://github.com/Syncplay/syncplay/blob/2af7ace347f437d44cd809a65c049e82bb4027fb/syncplay/protocols.py#L279-L325) (client), [`#L729-L781`](https://github.com/Syncplay/syncplay/blob/2af7ace347f437d44cd809a65c049e82bb4027fb/syncplay/protocols.py#L729-L781) (server).
- **Jellyfin.** The server's group state machine is the single arbiter. Clients send *requests*, and the server answers with scheduled *commands*. *Confirmed:* see §4 links.

**Echo suppression** takes three different forms:
1. **Mark the extension's own actions.** Netflix Party increments a counter, `uiEventsHappening`, around every programmatic play, pause, seek or freeze. While the counter is non-zero, it does not broadcast. *Confirmed:* [`content_script.js#L432-L480`](https://github.com/kliu128/netflix-party-reborn/blob/cdac3b328e9413ff59263aff04109fe52216ccbf/content_script.js#L432-L480) and [the listeners](https://github.com/kliu128/netflix-party-reborn/blob/cdac3b328e9413ff59263aff04109fe52216ccbf/content_script.js#L2886-L2925).
2. **Only treat real user input as a command.** Netflix Party broadcasts only after a `mouseup` or `keyup` on the page, and never from media events. *Confirmed:* same links. *Inferred:* this is fragile. It misses media keys and Netflix's own auto-actions, and it depends on Netflix's DOM.
3. **Compare against the expected state.** Syncplay counts a player change as a user action only if it differs from **both** the last-seen player state **and** the expected global state. For seeks, the difference must exceed 1s. A change that the extension itself caused already matches the global state, so it is never re-sent. It also ignores corrections where `setBy == self`. *Confirmed:* [`client.py#L218-L223`](https://github.com/Syncplay/syncplay/blob/2af7ace347f437d44cd809a65c049e82bb4027fb/syncplay/client.py#L218-L223), [`#L381-L401`](https://github.com/Syncplay/syncplay/blob/2af7ace347f437d44cd809a65c049e82bb4027fb/syncplay/client.py#L381-L401).

**Inferred for Ensemble:**
- With no server, give every shared-state change a `version`, either a Lamport counter or `(at, partnerId)`, and apply last-writer-wins with a deterministic tiebreak (for example, the lower `partnerId` wins exact ties). Both Partners then converge on the same state without a host.
- For echo suppression, combine #3 with #1. Comparing against the expected state is robust to timing, and a short "applying remote command" guard covers the gap while Netflix's player is still transitioning.
- Add a Syncplay-style "ignore remote states older than my pending local change" rule. This matters at 200ms+ RTT, because when both Partners act within ~RTT of each other, each will receive a message the other sent before seeing their own.

## 6. Controlling the Netflix player specifically

- **Every Netflix-capable tool I inspected seeks via Netflix's internal player API, not `video.currentTime`.** The API is called from a script running in the page's own JS world:
  ```js
  const vp = netflix.appContext.state.playerApp.getAPI().videoPlayer;
  const player = vp.getVideoPlayerBySessionId(vp.getAllPlayerSessionIds()[0]);
  player.seek(ms);
  ```
  - Netflix Party (2020) injects exactly this. *Confirmed:* [`content_script.js#L489`](https://github.com/kliu128/netflix-party-reborn/blob/cdac3b328e9413ff59263aff04109fe52216ccbf/content_script.js#L489).
  - VideoTogether (2025) wraps the whole player. It uses `play()`, `pause()`, `isPaused()`, `getCurrentTime()` (ms), `seek(ms)`, `getDuration()`, `getPlaybackRate()` and `setPlaybackRate()`. *Confirmed:* [`vt.js#L2180-L2197`](https://github.com/VideoTogether/VideoTogether/blob/3c61f12b84523abed497f690754487b5c21ec6d3/source/extension/vt.js#L2180-L2197).
  - Video Speed Controller (2026) overrides *only* seeking on Netflix ("Use Netflix's postMessage API for seeking"). It keeps setting the rate through the `<video>` element. *Confirmed:* [`netflix-handler.js`](https://github.com/igrigorik/videospeed/blob/8f9bc13cd1d8bad549795da265735159d9e9fad1/src/site-handlers/netflix-handler.js), [`scripts/netflix.js`](https://github.com/igrigorik/videospeed/blob/8f9bc13cd1d8bad549795da265735159d9e9fad1/src/site-handlers/scripts/netflix.js).
  - Global Speed (2026) does the same and filters the sessions by `isReady()`. *Confirmed:* [`seekNetflix.ts`](https://github.com/polywock/globalSpeed/blob/8e37a47597b702142cd4a5ff8e8c3f12511c8feb/src/contentScript/main/utils/seekNetflix.ts).
  - A GitHub code search for `getVideoPlayerBySessionId` finds about 20 active repos, including asbplayer and several 2025–2026 watch-together projects.
- **Why not `video.currentTime`?** Community lore says writing to it crashes Netflix's player with error **M7375**. **I could not confirm this from a primary source.** The consistent avoidance across independent tools is circumstantial evidence only.
- **The MV3 implication.** `window.netflix` is only visible to code in the page's JS world. Chrome content scripts default to the `ISOLATED` world. `"world": "MAIN"` makes a script "share the execution environment with the host page's JavaScript", and Chrome warns that "the host page can access and interfere with the injected script". *Confirmed:* [Chrome docs](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts). So Ensemble needs a small MAIN-world bridge, plus messaging to its isolated content script. That is the same pattern VSC, asbplayer and Netflix Party use.
- **Netflix Party's DOM-clicking is obsolete.** In 2020 it paused and played by clicking `.button-nfplayerPause` and `.button-nfplayerPlay`, and read the time from `.scrubber-head[aria-valuenow]`. Those are Netflix class names that newer tools no longer use. *Inferred:* use the player API for all controls, not only seeking.

## Recommendation: what fits a two-Partner, no-host, Netflix-only v1

All of this is **Inferred**, combining the confirmed techniques above.

1. **State, not events.** Each Partner holds a replicated `{paused, position, at, version, setBy}`, with the expected position extrapolated while playing. A Playback Command is a new state with a bumped version, applied last-writer-wins with a deterministic tiebreak.
2. **Clock.** Use an NTP-style offset between the two Partners, taking the minimum-RTT sample of the last ~8 pings (Jellyfin and VideoTogether). Ping often at the start of a Watch Session, then roughly every 5–30s. The expected error is ≤ RTT/2.
3. **Apply Playback Commands immediately locally.** Send them with `at` so the other Partner compensates for the transit delay. When resuming after a pause or a buffering wait, use a **scheduled start** (`now + ~RTT`) so both Partners start together (Jellyfin `When`).
4. **Resync rule: only the Partner that is ahead corrects.**
   - If it is ahead by about 0.5–3s, it **freezes** (pauses for the Drift, then plays), as Netflix Party does.
   - If |Drift| is larger, or the Partner is behind after its own seek, it does a **hard seek via the Netflix player API**.
   - Leave playback-rate nudging for later. Jellyfin turned it off by default after stutter reports, and it is unverified on Netflix at fine rates.
5. **Buffering.** Use explicit `buffering` / `ready` signals. When one Partner stalls, the other pauses. Resume with a scheduled start, and cap the wait at ~30s (Jellyfin). This also covers the "converge on the slowest Partner" behaviour from Syncplay.
6. **Echo suppression.**
   - Don't broadcast a player change that matches the expected shared state (Syncplay).
   - Keep an "applying remote state" guard (Netflix Party).
   - Ignore remote states older than the version of a pending local change (Syncplay `ignoringOnTheFly`).
7. **Netflix control.** Use a MAIN-world script that drives `netflix.appContext…videoPlayer` (`seek(ms)`, `play`, `pause`, `getCurrentTime`), bridged to the extension by `postMessage`.

## Risks and unknowns

- **The Netflix player API is undocumented and private.** It works today in 2026 tools, but Netflix can change it without notice. The M7375 rationale for avoiding `currentTime` is unconfirmed.
- **Playback-rate nudging on Netflix is untested.** It is not known whether rates like 0.95× or 1.05× via `setPlaybackRate` or `video.playbackRate` stick, sound acceptable, or get reset. Jellyfin's experience suggests caution.
- **Seek cost on Netflix is unmeasured.** It is not known how long a `seek()` takes to rebuffer, or how accurately it lands. This decides the dead zone and the freeze-versus-seek boundary. It needs a prototype measurement.
- **The two Partners may not see the same title.**
  - Bolivia and France may serve different cuts, intros, or audio and subtitle-dependent versions of the same title ID. Syncplay warns when durations differ by more than 2.5s (`DIFFERENT_DURATION_THRESHOLD`); Ensemble should compare durations at the start of a Watch Session.
  - **Netflix's ad tier** may put different ad breaks on each side, which would make "position" incomparable during ads. I found nothing in any source about this.
- **Episode transitions** (autoplay next episode, post-play) take a lot of special-case code in Netflix Party. This is not researched here.
- **The transport was not researched.** This covers a relay server versus a WebRTC DataChannel, NAT traversal, and reconnect. Every tool studied uses a central server, so a pure peer-to-peer design has no direct prior art among these tools.
- **The Netflix Party code is from 2020.** Its Netflix integration details are stale, and only its sync *design* carries over.
