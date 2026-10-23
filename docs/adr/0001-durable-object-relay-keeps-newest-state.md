# The relay is a Cloudflare Durable Object that keeps the newest Watch Session state

The two Partners' extensions talk through one Cloudflare Worker with a Durable Object per pair, at $0 on the free tier. The relay forwards messages and also writes the newest versioned Watch Session state and both Partners' presence to Durable Object storage. That way a Partner reconnecting after a drop, a hibernation eviction or a deploy always gets the current state from the relay. The relay never makes sync decisions: picking a winner between conflicting Playback Commands, measuring Drift and deciding Resyncs all stay in the clients.

## Considered Options

- **Dumb forwarder** (no stored state): rejected because a reconnecting Partner would depend on the other Partner being online and responsive to rebuild state, which fails exactly when one side is buffering or briefly offline.
- **Authoritative relay** (decides conflicts): rejected because it duplicates sync logic on the server and puts a ~200–300ms La Paz–Paris round trip in front of every local Playback Command.
- **Peer-to-peer (WebRTC)**: rejected because it still needs a signaling server, and NAT traversal across two home networks adds failure modes for no gain at this message volume.
