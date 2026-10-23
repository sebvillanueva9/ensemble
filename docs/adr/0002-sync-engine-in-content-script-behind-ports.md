# The sync engine runs in the content script as a pure module behind ports

The logic that tracks Watch Session state, measures Drift, decides Resyncs and suppresses echoes lives in the content script, not the service worker. It is a pure module that only touches the outside world through two ports: a `Player` port (implemented by the MAIN-world bridge over Netflix's `videoPlayer` API) and a `Transport` port (implemented over `runtime.connect` to the service worker, which owns the WebSocket). Being next to the player keeps position reads and Playback Commands timed tightly, and the content script survives Netflix's in-page episode changes. The ports let agents verify sync behaviour against a fake player and a fake relay, because Netflix's DRM blocks automated testing against the real one.

## Considered Options

- **Engine in the service worker**: one home for all logic, but every position read and command would cross two message hops (service worker ↔ content script ↔ MAIN world), adding jitter to the very timings Drift is measured from.
