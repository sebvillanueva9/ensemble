# Drift is measured player against player and only the Partner who is ahead corrects

Ensemble has no host. Drift is the difference between the two Partners' real playback positions, taken from position heartbeats each Partner sends. It is not measured against an ideal timeline extrapolated from the last Playback Command. Only the Partner whose player is ahead corrects: a freeze (pause for the Drift, then play) for small Drift, and a hard seek back for large Drift. Nobody ever skips forward, so neither Partner misses content, and a Partner who fell behind by buffering is waited for rather than chased. Concurrent Playback Commands are ordered by a Lamport counter `ver`, with ties broken by shared-clock `at` and then Partner id. Both clients and the relay pick the same winner without the relay making a decision, and no correction runs until both heartbeats report the same `ver`.

## Considered Options

- **Host/follower**: simpler to reason about, but it contradicts equal control, and the follower would skip content to catch up with a host who is ahead.
- **Correct against the shared timeline**: no heartbeats are needed, but a Partner who stalled would have to seek forward past content they never saw.
- **Playback-rate nudging** (Syncplay, Jellyfin): it corrects invisibly in theory, but Jellyfin turned it off by default after stutter complaints, and fine rates are untested on Netflix. Freezes of up to ~300ms are invisible there and seeks are exact, so freeze and seek are enough.
- **Pure timestamp ordering `(at, from)`**: simpler, but the ~100ms clock error can reorder causally related commands, for example a pause pressed just after seeing the other Partner's seek.
- **Relay-assigned sequence numbers**: it would make the relay a decision-maker, against ADR 0001.
