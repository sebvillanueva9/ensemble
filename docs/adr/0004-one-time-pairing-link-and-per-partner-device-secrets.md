# Pairing uses a one-time Pairing link and a device secret per Partner

The relay URL is public, so a Pair needs a credential, and the Pairing link travels through chat apps where it can leak. The Pairing link therefore carries only a `pairId` and a single-use join token that expires after 7 days. When a Partner pairs, their extension generates its own 256-bit device secret and registers it with the relay: the creator when the Pair is made, the joiner by redeeming the token, which burns it. The relay stores only SHA-256 hashes, and each `hello` sends that Partner's secret in the first `wss://` message, never in a URL. Once the second Partner has joined, a leaked Pairing link opens nothing, and an Invite sent as a link carries only the `pairId`. `pairId`s carry a truncated HMAC under a relay-held key, so the Worker rejects forged ids without touching a Durable Object.

## Considered Options

- **One shared secret in the link**: simpler, but anyone who ever saw the link (a chat backup, a forwarded message) stays a Partner for good, and closing the Pair to a third device would need extra machinery.
- **Challenge-response `hello`**: protects only against broken TLS or a relay that logs messages, at the cost of a round trip and more code.
- **Untagged `pairId`s**: every made-up id would cost a Durable Object request on the $0 quota.

## Consequences

- A lost device secret (Chrome data cleared, reinstall, new machine) can't be recovered: that Partner starts a new Pair, and the other Partner's "Replace your pairing" prompt deletes the old one.
- Changing this scheme later invalidates every existing Pair.
