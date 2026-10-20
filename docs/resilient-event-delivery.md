# Resilient event delivery and gate check-in

## Media pinning (#1250)

Configure `IPFS_PINNING_SERVICES` as a JSON array of at least two independent
HTTPS IPFS Pinning Service API providers (distinct names and hostnames):

```json
[
  { "name": "primary", "url": "https://primary.example/api/v1", "token": "<server-side-token>" },
  { "name": "backup", "url": "https://backup.example/api/v1", "token": "<server-side-token>" }
]
```

The URLs must expose `/pins` per the [IPFS Pinning Service API](https://ipfs.github.io/pinning-services-api-spec/).
These are not gateway URLs. Keep tokens in deployment secrets. Provider pin records
are the durable source of truth; restarting the API does not erase pin status.

- `POST /storage/pin`: `{ "eventId": "<uuid>", "hash": "<CID>" }` requests missing replicas.
- `GET /storage/status/:hash`: queries every provider. `pinned: true` requires every
  configured provider to report `pinned`; queued, failed, missing and unavailable
  replicas remain visible to callers.
- `POST /storage/migrate`: `{ "eventId": "<uuid>", "hashes": ["<CID>"] }` repairs a
  caller-supplied inventory of existing media CIDs (up to 100 per request), skips
  healthy/pending replicas and retries failed ones. Repeat after provider outages.
- `GET /storage/retrieve/:hash` returns a gateway URL and current provider status.

Mutation endpoints require the event organizer or an admin. Existing CIDs can
represent images, videos or promotional files of any size supported by providers.
The content must still be available on IPFS for a new service to fetch it.
Pinning requires maintained provider subscriptions and monitoring; it cannot
promise permanent availability after all providers stop retaining the content.

`POST /storage/upload` retains the existing Pinata file-upload adapter via
`IPFS_API_URL` and `IPFS_API_KEY`, then replicates the returned CID. Text uploads
remain UTF-8 by default. Binary files use `contentEncoding: "base64"` with base64
`content`. JSON uploads are subject to the deployment's request-body limit and a
10-million-character DTO limit; large videos should be ingested through the
provider's upload pipeline and pinned by CID. `IPFS_GATEWAY` defaults to
`https://ipfs.io/ipfs`.

## Adaptive playback (#1248)

Configure an event's existing `/streaming/events/:eventId/delivery` endpoint with
an HLS master playlist containing multiple encoded variants. A bitrate setting
alone does not transcode media. The media origin must allow browser CORS access.

Ticket holders and the organizer can open `/events/:id/watch`; the backend checks
ownership of a valid/used ticket before returning playback configuration.
[HLS.js](https://hlsjs.video-dev.org/api-docs/hls.js.hls) measures segment throughput
and controls automatic bitrate selection. The quality selector uses the actual
manifest variants; selecting Auto restores adaptive mode. Native HLS browsers
without MSE use browser-managed adaptation and do not expose manual overrides.
Waiting-to-playing intervals send bounded buffering telemetry to the authenticated
backend endpoint, which emits structured `stream_buffering` logs for the deployment
metrics collector. This does not claim to aggregate a viewer analytics dashboard.
The player detaches listeners and destroys HLS instances on navigation.

The existing CDN must enforce its own access policy/signed URLs; this change does
not mint CDN credentials or make a publicly served manifest private.

## Gate kiosk (#1249)

Open `/organizer/events/:id/kiosk` and select **Enter full-screen** (a browser user
gesture is required). A hardware QR/barcode scanner enters its decoded payload
through the scanner input. The kiosk is sized for tablets and supports reduced
motion. If fullscreen is unavailable it remains usable in the browser tab.

The kiosk includes the current event in each scan. The server verifies the QR
signature, event ownership and event match before atomically changing `valid` to
`used`; concurrent scans cannot both admit the same ticket. Results remain visible
until staff acknowledge them. Existing `User.logoUrl` profile images are displayed
when HTTPS URLs are available; absent/broken images explicitly request a manual ID
check. A profile image is a visual aid, not a verified identity credential. No new
photo collection or facial recognition is introduced.

## Contract replay protection (#1251)

For each new logical operation, request an authenticated account nonce with
`generate_transaction_nonce(account)` and derive/store a 32-byte key including
the contract/network, account, operation and nonce. Retry with that same key:

- `purchase_ticket_idempotent(buyer, event_id, amount, key)`
- `batch_purchase_idempotent(event_id, quantity, buyer, key)`
- `transfer_ticket_idempotent(ticket_id, from, to, key)`

The key is consumed atomically with the operation. Failed operations roll back
key consumption; successful retries return `IdempotencyKeyAlreadyUsed` rather
than minting/transferring again. Look up the original transaction after that error.

**Client ABI update:** `validate_idempotency_key` and `reject_replay_attempt` now
require `(account, key)`. Nonce generation and explicit key consumption require
that account's authorization. New records are account-scoped, while legacy global
used-key records remain honored. Persistent Soroban records must be restored if
archived; do not regenerate keys when retrying. Legacy purchase/transfer entry
points remain available; clients needing retry protection must use the new
idempotent entry points. No deployment or migration is performed by this PR.

## Verification

Focused frontend and backend test suites cover automatic/manual selection,
player disposal, telemetry failures, kiosk duplicate submissions and photo
fallbacks, cross-event/unauthorized scans, atomic check-in, ticket-gated playback,
and pin replication, pending state, outages, repair and restart recovery.

Full TypeScript builds are blocked by existing syntax errors, including frontend
login/register/api-client files and backend gamification/refund files. The same
TypeScript diagnostics reproduce on upstream commit `6597cc4`. Frontend `npm run
lint` also fails because the existing Next config imports undeclared `next-pwa`.
Backend dependency installation requires legacy peer resolution and encounters
an existing out-of-sync lockfile. Focused checks do not establish live provider,
CDN, tablet/browser, database or deployed-contract operation.

The unchanged upstream and feature branch each have 33 Rust compile errors in
unrelated royalty events, age-event signatures, email-campaign tests and other
tests. All 11 replay/nonce tests pass in a disposable copy after temporary repairs
to those blockers; those repairs are not included here. This supplemental result
is not a passing build of the submitted contract tree.
