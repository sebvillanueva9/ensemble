# Research: realtime channel between two extensions on free tiers

Ticket: [#6](https://github.com/sebvillanueva9/ensemble/issues/6). Researched 2026-10-09.

**Question.** What is the best free-tier way to give two Chrome MV3 extensions (one Partner in Bolivia, one in France) a low-latency, reliable, bidirectional channel for Playback Commands and Drift reports? Where should the connection live inside the extension, and what RTT should we expect?

**Legend.** **[C]** means confirmed: a primary source states it, and the source and its "last updated" date are given. **[I]** means inferred: it is my reasoning or arithmetic from confirmed facts, or it comes from a non-primary source. Validate [I] items in a spike.

---

## TL;DR

1. **Recommended: one Cloudflare Worker plus a single Durable Object using the WebSocket Hibernation API, with the WebSocket held in the extension's service worker.** Each Partner's extension connects to the same DO. The DO relays Playback Commands to the other socket. Ensemble's load uses well under 1% of the Workers Free quotas, the account costs $0, and the server code is about 50 lines.
2. **Put the connection in the service worker**, not in the Netflix content script or an offscreen document. Set `minimum_chrome_version: "116"`, send an app-level keepalive every 20 s, and answer it with `setWebSocketAutoResponse` so the DO stays hibernated. Content scripts talk to the service worker over a `runtime.connect` port. That way Netflix reloads, SPA navigations and episode changes never touch the channel.
3. **Expect about 200 ms RTT between Bolivia and France**, so about 100 ms one way. Relaying through a DO in Western Europe adds little. That delay is small next to Netflix's own seek and buffer time. Commands should carry a position and a timestamp so the receiver can compensate.
4. **Fallbacks:** Ably's free plan is the zero-server-code alternative. Supabase Realtime works but free projects pause after 7 days without *database* activity. Firebase RTDB works but uses a database as a message bus. WebRTC doesn't pay off here: it still needs signaling, needs an offscreen document, and may need TURN, and saves only a few ms.

---

## 1. Where the connection lives in MV3

### Service worker (recommended)

- **[C]** Extension service workers are terminated after **30 s of inactivity**. Events and extension API calls reset the timer. A single request taking more than 5 min, or a `fetch()` response taking more than 30 s, can also cause termination. Source: [Extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) (developer.chrome.com, footer reads 2023-05-02, but it cites changes through Chrome 118).
- **[C]** Since **Chrome 116**, an active WebSocket extends service worker lifetime, and sending or receiving messages on it resets the idle timer. Source: same page.
- **[C]** The Chrome guide recommends sending a message every **20 s** in either direction, and declaring `"minimum_chrome_version": "116"`. Its sample uses `setInterval(20_000)` to send `'keepalive'`. Source: [Use WebSockets in service workers](https://developer.chrome.com/docs/extensions/how-to/web-platform/websockets) (last updated 2023-07-04).
- **[C]** Since Chrome 114, long-lived messaging (ports) keeps a worker alive while messages flow, but opening a port alone no longer resets timers. Since Chrome 109, messages from an offscreen document reset the timers. Source: lifecycle page above.
- **[C]** Globals are lost when the worker shuts down. Persist state in `chrome.storage`, IndexedDB or CacheStorage. Source: lifecycle page above.
- **[C]** `chrome.alarms` fire at most once every 30 s in packed extensions. Source: [chrome.alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms) (last updated 2026-10-04).
- **[I]** If the socket drops, for example when Wi-Fi blips or the laptop sleeps, the worker gets only about 30 s of idle time to reconnect. A reconnect loop inside the worker will usually make it. As a safety net, use a 30 s `chrome.alarms` alarm while a Watch Session is active, plus a reconnect when the Netflix content script messages the worker. Both wake a dead worker, because events start the worker. The alarms page does not state this explicitly, so verify it in the spike.
- **[I]** Netflix SPA navigation, episode changes and full page reloads only tear down the content script, never the service worker, so the channel survives all of them. When the content script comes back it reconnects its `runtime.connect` port and re-reads session state from the worker.

### Content script (not recommended for the socket)

- **[C]** Content scripts "initiate requests on behalf of the web origin that the content script has been injected into". Cross-origin requests are always treated as cross-origin, even with host permissions. Source: [Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).
- **[I]** That means a socket in the content script would run under netflix.com's origin, and possibly under its CSP `connect-src`, which the Chrome docs do not settle for isolated worlds. It would also die on every full reload. Avoid it. Keep the content script as the player adapter only (see #4).

### Offscreen document (fallback only)

- **[C]** Offscreen documents must declare one of 15 `reasons`: TESTING, AUDIO_PLAYBACK, IFRAME_SCRIPTING, DOM_SCRAPING, BLOBS, DOM_PARSER, USER_MEDIA, DISPLAY_MEDIA, **WEB_RTC**, CLIPBOARD, LOCAL_STORAGE, WORKERS, BATTERY_STATUS, MATCH_MEDIA, GEOLOCATION. Only AUDIO_PLAYBACK has a lifetime limit (it closes after 30 s without audio). One document is allowed per profile, and the only extension API available is `runtime`. Source: [chrome.offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen) (last updated 2026-09-21).
- **[I]** None of those reasons describes "hold a WebSocket". Using one as a pretext is a Web Store review risk, even for an unlisted item (see #5). An offscreen document is only legitimate here if we choose WebRTC, under the `WEB_RTC` reason, because `RTCPeerConnection` is not available in service workers.

---

## 2. Candidates on free tiers

Assumed load: 2 Partners, 4 nights a week, about 3 h a night. That works out to 2 sockets, a keepalive every 20 s per socket, and a few dozen Playback Commands an hour, about **1,500 incoming messages a day** at most. Even a worst case of sockets open 24/7 is about 9,000 messages a day. **[I]**

### A. Cloudflare Workers + Durable Objects (Hibernation API): best fit

- **[C] Workers Free:** 100,000 requests/day (Error 1027 past that, resets 00:00 UTC) and 10 ms CPU per HTTP request. Source: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (last updated 2026-10-08).
- **[C] DO on Workers Free:** 100k requests/day, **13,000 GB-s/day duration**, 5 GB SQLite storage, and SQLite backend only. Opening a WebSocket counts as one request. **Incoming WS messages are billed 20:1. Outgoing messages and incoming protocol pings are not billed.** Hibernation-eligible idle objects are not billed for duration. Exceeding a limit makes that operation fail. Source: [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) (last updated 2026-09-30).
- **[C]** With the Hibernation API, a DO sleeps while clients stay connected. In-memory state resets on wake, so per-socket state belongs in `serializeAttachment` (max 16 KiB). The runtime auto-replies to ping frames without waking the DO. **Code deploys disconnect all WebSockets.** Hibernation and eviction do not. Source: [DO WebSockets best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) (last updated 2026-09-30).
- **[C]** `setWebSocketAutoResponse(request, response)` answers a matching message without waking the DO and without duration charges. Request and response are each at most 2,048 characters. A DO can hold up to 32,768 hibernatable sockets. Source: [DurableObjectState API](https://developers.cloudflare.com/durable-objects/api/state/) (last updated 2026-09-30).
- **[C]** Placement: a DO is created near the first `get()` unless a `locationHint` is given. Options include `weur` and `sam`, and `sam` actually spawns in Eastern North America. A DO does not move after creation. Source: [DO data location](https://developers.cloudflare.com/durable-objects/reference/data-location/) (last updated 2026-06-26).
- **[C]** DO limits on Free: 32 MiB max received WS message, 100 classes, unlimited objects. Source: [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/) (last updated 2026-06-01).
- **[I] Quota use:** about 1,500 incoming messages a day ÷ 20 is about 75 billed requests, plus a few connection requests, against 100,000. That is under 0.1%. Duration: even a DO that never hibernates at 128 MB uses 0.125 GB × 86,400 s, about 10,800 GB-s a day, which is under 13,000. With hibernation and auto-responded keepalives it is close to 0.
- **[I] Reconnect behaviour:** sockets drop on our own deploys and on network blips. The client needs backoff-based reconnect either way. Cloudflare's [`partysocket`](https://github.com/cloudflare/partykit) (reconnecting WS with buffering) is an option if it runs in a service worker. Otherwise hand-roll about 40 lines.
- **[I] Ops burden:** low. It is one Cloudflare account in the owner's name, `wrangler deploy`, and no database. There is nothing to pause: no inactivity policy was found in the Workers/DO docs.

### B. PartyKit

- **[C]** Cloudflare acquired PartyKit in April 2024 ([Cloudflare blog](https://blog.cloudflare.com/cloudflare-acquires-partykit)). The open-source successor libraries live at [cloudflare/partykit](https://github.com/cloudflare/partykit): **PartyServer** (DO helpers for WS, lifecycle, broadcast) and **PartySocket** (reconnecting client).
- **[I]** PartyKit is effectively option A with a helper library. Its managed platform's current status was not confirmed. Use the libraries on our own Workers account if they help, but don't take a dependency on the hosted platform.

### C. Ably (free plan): best no-server-code alternative

- **[C]** The free plan includes 6M messages a month, 200 concurrent connections, 200 channels and 500 msg/s. Source: [ably.com/pricing](https://ably.com/pricing) (accessed 2026-10-09, no page date).
- **[I]** Ably needs no server, but a key with publish/subscribe capability would ship inside the extension unless we run a token endpoint, which is a server again. For an unlisted two-user item that is a tolerable but real risk. Ably's inactivity and account policies were not checked.

### D. Supabase Realtime (Broadcast)

- **[C]** The free plan includes 200 concurrent peak connections, 2M Realtime messages a month, 100 msg/s, a 256 KB broadcast payload and 2 active projects. Sources: [Realtime limits](https://supabase.com/docs/guides/realtime/limits) and [pricing](https://supabase.com/pricing) (accessed 2026-10-09).
- **[C]** "Free projects are paused after 1 week of inactivity". Inactivity means not enough **user database activity** over 7 days. **Resuming is manual**, through the dashboard. Source: [Project pausing](https://supabase.com/docs/guides/platform/free-project-pausing) (no page date).
- **[I]** Broadcast traffic probably does not count as database activity. A community answer says so, not Supabase staff. Weeks without a Watch Session, such as holidays, would pause the project and break Ensemble until the owner clicks Resume. A cron "heartbeat write" would avoid that, at the cost of ops burden.

### E. Firebase Realtime Database / Firestore (Spark)

- **[C] Spark RTDB:** 100 simultaneous connections, 1 GB stored and 360 MB/day downloaded. **Firestore:** 50K reads/day and 20K writes/day. Sources: [Firebase pricing](https://firebase.google.com/pricing) (accessed 2026-10-09) and [RTDB limits](https://firebase.google.com/docs/database/usage/limits) (last updated 2026-10-06).
- **[I]** Quotas are ample, but both products use a database as a message bus. Running the Firebase JS SDK (and Firebase Auth) inside an MV3 service worker is a known area of friction that I did not verify. Latency depends on the instance region. Nothing here beats option A.

### F. Pusher Channels (Sandbox)

- **[C]** 200k messages/day and 100 concurrent connections. Source: [Pusher pricing](https://pusher.com/channels/pricing/) (accessed 2026-10-09).
- **[I]** Client-to-client messages require private channels with an auth endpoint, which is a server again. So it has the same shape as option A with less control.

### G. WebRTC data channel + minimal signaling

- **[C]** `WEB_RTC` is a valid offscreen reason, per the offscreen page above. Cloudflare TURN costs $0.05/GB, but "the first 1,000 GB each month is free", shared with the Realtime SFU. Sources: [Realtime pricing](https://developers.cloudflare.com/realtime/pricing/) (last updated 2026-09-22) and [TURN](https://developers.cloudflare.com/realtime/turn/) (last updated 2026-09-25).
- **[I]** WebRTC still needs a signaling server, which is option A anyway. It also needs an offscreen document kept alive and coordinated with the service worker, and probably TURN behind CGNAT, which is common on residential and mobile ISPs. With TURN the traffic is relayed anyway. A direct path saves maybe 10–20 ms over a DO in Western Europe, and that doesn't matter for play/pause/seek. **Not worth the complexity.**

---

## 3. Expected RTT Bolivia ↔ France and its effect on sync

- **[C]** WonderNetwork's server-to-server ping from **La Paz to Paris averaged about 197–201 ms** (min about 197 ms) in samples from 2026-10-09 and 2026-10-10. Source: [wondernetwork.com/pings/La Paz/Paris](https://wondernetwork.com/pings/La%20Paz/Paris). Datacenter hosts, not residential lines.
- **[I]** Residential last-mile, Wi-Fi and the Bolivian ISP's route will add tens of ms. Plan for **about 200–300 ms RTT, so about 100–150 ms one way.** Cloudflare appears to have a PoP in La Paz (LPB), but only third-party trackers say so. That helps TLS termination but not the long haul to the DO.
- **[I]** DO placement: pin with `locationHint: "weur"` (or let France's first connection create it). The France leg is then about 10–20 ms and the Bolivia leg carries the whole transatlantic path. Total relay RTT is roughly the direct path plus a small detour. Avoid `sam`, because it spawns in Eastern North America, adding a US hop that is harmless but unnecessary.
- **[I] Effect on sync:** a one-way delay of about 0.1–0.15 s is well under typical Drift tolerances (hundreds of ms) and under Netflix's own seek and rebuffer time. Make every Playback Command carry `{position, sentAt}` and have the receiver apply `position + (now − sentAt)` while playing. That needs a rough clock-offset estimate from the keepalive exchange (NTP-style, offset ≈ RTT/2). Exact Drift and Resync rules belong to #10 and #8.

---

## 4. Ranked recommendation

1. **Cloudflare Worker + one Durable Object (Hibernation API, `setWebSocketAutoResponse` keepalive), socket held in the MV3 service worker** (`minimum_chrome_version: 116`). $0, under 0.1% of quota, no inactivity pause, full control, and about 200–300 ms RTT. Optionally use `partyserver`/`partysocket` from cloudflare/partykit.
2. **Ably free plan**, if we'd rather write zero server code. The cost is an embedded key and a third-party account.
3. **Supabase Realtime Broadcast.** It works, but the 7-day pause with manual resume is a real availability risk for occasional use.
4. **Firebase RTDB/Firestore.** It works, but it uses a database as a bus and the SDK may not fit a service worker well.
5. **WebRTC data channel.** It costs the most complexity (offscreen document, signaling, TURN) for a negligible latency gain.

## 5. Risks and unknowns to validate in a spike

- **Service worker reconnect window [I]:** confirm that a socket drop, such as laptop sleep or a network change, reliably reconnects through the in-worker retry, the 30 s alarm, or the content script ping. Also confirm that Chrome doesn't kill the worker mid-session for other reasons, such as an extension update or browser restart.
- **Keepalive and `setWebSocketAutoResponse` [I]:** confirm a 20 s text keepalive matched by auto-response still counts as "messages received" for Chrome's lifetime extension. It should, because it is a real WS frame.
- **Deploys drop sockets [C]:** never deploy during a Watch Session, and the client must resync state after a reconnect.
- **Auth [I]:** the Worker URL is public. Use a shared secret or pairing code in the connect URL to scope a DO to the two Partners, and validate it in the Worker before the DO, since requests are billed.
- **`partysocket` in a service worker [I]:** not verified. It may assume `window`.
- **Content script CSP for WS [I]:** unresolved in the Chrome docs. This is moot if the socket stays in the service worker as recommended.
- **Bolivian residential RTT and jitter [I]:** only datacenter-to-datacenter data was found. Measure from the real Partner's connection during the spike.
