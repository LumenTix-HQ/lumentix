# Lumentix API Reference

This is the entry-point reference for building against Lumentix: the NestJS
REST API, the Soroban smart contract, the events both surfaces emit, and how
the pieces fit together. It links out to the deeper documents that already
exist in this repo (`contract/ERRORS.md`, `contract/USAGE_EXAMPLES.md`)
instead of duplicating them.

## Contents

- [Architecture overview](#architecture-overview)
- [REST API](#rest-api)
  - [Authentication](#authentication)
  - [Endpoint groups](#endpoint-groups)
  - [Error format](#error-format)
  - [Rate limiting](#rate-limiting)
- [Smart contract interface](#smart-contract-interface)
  - [Core lifecycle functions](#core-lifecycle-functions)
  - [Errors](#errors)
  - [Events](#events)
- [Integration guidelines](#integration-guidelines)
- [Code samples](#code-samples)
- [Runnable sandboxes](#runnable-sandboxes)

---

## Architecture overview

```
frontend (Next.js)  ──HTTP──>  backend (NestJS, /backend)  ──DB/Redis──> Postgres, Redis
       │                              │
       │                              └──RPC──> Soroban contract (/contract) on Stellar
       └────────────────────wallet signing (Freighter/Albedo)────────────────────┘
```

- The **backend** (`backend/`) is the system of record for accounts, event
  metadata, off-chain analytics, notifications, etc. It talks to the chain
  where a feature is inherently on-chain (ticket ownership, escrow, payments).
- The **contract** (`contract/`) is the Soroban smart contract
  (`LumentixContract` in `contract/src/lumentix_contract.rs`) that owns
  ticket issuance, escrow, and every feature that needs trustless
  verification.
- The **frontend** (`frontend/`) is the reference client for both surfaces —
  see `frontend/lib/api-client.ts` for the REST client and
  `frontend/lib/stellar.ts` for contract invocation helpers.

---

## REST API

### Base URLs

| Environment | URL |
|---|---|
| Local dev | `http://localhost:3000` |
| Staging/Production | set via your deployment's `API_BASE_URL` |

Interactive, always-current Swagger docs are mounted at **`/api`** whenever
`NODE_ENV !== 'production'` (see `backend/src/main.ts`). Use Swagger for the
authoritative, per-endpoint request/response schema — the tables below are a
map of what exists, not a full schema dump.

### Authentication

Two authentication schemes are supported:

1. **Email/password + JWT** — standard bearer token flow.
2. **Wallet signature challenge** — for wallet-first clients that never send
   a password.

```
POST /auth/register          { email, password, name }        → 201 user created
POST /auth/login             { email, password }               → { accessToken, refreshToken }
POST /auth/refresh           { refreshToken }                   → { accessToken, refreshToken }
GET  /auth/me                Authorization: Bearer <token>      → current user
POST /auth/logout            Authorization: Bearer <token>       → 200
POST /auth/verify-email      { token }                          → 200
POST /auth/resend-verification { email }                        → 200
POST /auth/forgot-password   { email }                          → 200 (always, to avoid email enumeration)
POST /auth/reset-password    { token, newPassword }             → 200
POST /auth/wallet-challenge  { publicKey }                       → { challenge } — sign this with your wallet
POST /auth/wallet-verify     { publicKey, signature }            → { accessToken, refreshToken }
GET  /auth/google            → redirects to Google OAuth
GET  /auth/google/callback   → OAuth callback, issues JWT
```

Send the JWT on every subsequent request:

```
Authorization: Bearer <accessToken>
```

Wallet-signature flow in short: request a challenge string tied to your
public key, sign it locally with your wallet (Freighter, Albedo, etc.),
then POST the signature back to receive a session JWT — the backend never
sees your secret key.

### Endpoint groups

Full CRUD/detail schemas live in Swagger (`/api`); this table is the map of
what each router covers so you know where to look.

| Prefix | Module | Covers |
|---|---|---|
| `/auth` | `auth` | Registration, login, JWT refresh, wallet challenge auth, OAuth |
| `/users` | `users` | Profile CRUD, preferences |
| `/events` | `events` | Event CRUD, publish/cancel/complete lifecycle, images, series, emergency/weather alerts, stats |
| `/events/:eventId/tickets` | `events` | Tickets for a given event + sales summary |
| `/events/:eventId/accessibility` | `accessibility` | Accessibility accommodation booking |
| `/events/:eventId/impact` | `impact` | Environmental/carbon impact tracking |
| `/events/:eventId/venues` | `venues` | Venue/seat layout for an event |
| `/events/:eventId/vip-tiers` | `vip` | VIP tier configuration |
| `/events/:eventId/capacity` | `venues` (`iot-capacity`) | Real-time IoT capacity feed |
| `/events/:eventId/sponsors`, `/events/:eventId/tiers` | `sponsors` | Sponsor tier registration & contributions |
| `/tickets` | `tickets` | Issue, transfer, verify (QR), resale status |
| `/tickets` (dynamic QR) | `tickets/dynamic-qr` | Rotating QR codes for check-in |
| `/tickets` (verification) | `tickets/verification` | Gate-side ticket verification |
| `/resale`, `/resale/marketplace` | `tickets/resale` | Secondary market listings |
| `/payments` | `payments` | Payment intents, confirmation, refunds, history, season passes |
| `/payments/analytics` | `payments` | Payment analytics |
| `/payments/multisig` | `payments/multisig` | Multi-sig escrow release approvals |
| `/refunds` | `payments/refunds` | Bulk refund pipeline |
| `/mobile-payments` | `mobile-payments` | Mobile money / carrier billing |
| `/reviews` | `reviews` | Event reviews & organizer reputation |
| `/insurance` | `insurance` | Ticket insurance purchase & claims |
| `/sponsors` | `sponsors` | Cross-event sponsor management |
| `/venues` | `venues` | Venue directory |
| `/vip` | `vip` | Cross-event VIP management |
| `/streaming` | `streaming` | Hybrid/virtual event streaming access |
| `/loyalty` | `loyalty` | Points, tiers, rewards |
| `/gamification` | `gamification` | Badges, challenges, leaderboards |
| `/recommendations` | `recommendations` | Personalized event recommendations |
| `/scheduling` | `scheduling` | AI scheduling optimization |
| `/social` | `social` | Social sharing/collab features |
| `/collaboration` | `collaboration` | Multi-organizer collaboration |
| `/analytics` | `analytics` | Event/organizer analytics |
| `/performance/events` | `performance` | Performance monitoring |
| `/currencies`, `/exchange-rates` | `currencies`, `exchange-rates` | Multi-currency pricing |
| `/wallet` | `wallet` | Wallet linking to user accounts |
| `/stellar` | `stellar` | Stellar network helpers (fees, network passphrase, etc.) |
| `/zkp` | `zkp` | Zero-knowledge proof helpers |
| `/decentralized-storage` (`/storage`) | `decentralized-storage` | IPFS/Arweave asset pinning |
| `/categories` | `categories` | Event category taxonomy |
| `/chat` | `chat` | In-app messaging |
| `/transactions` | `transactions` | Cross-cutting transaction ledger |
| `/admin`, `/admin/audit` | `admin`, `audit` | Admin console + audit log |
| `/age-verification` | `age-verification` | Age-gated event compliance |
| `/health` | `health` | Liveness/readiness probes |
| `/internal/*` | `internal` | Service-to-service only — see `docs/internal-api.md` |
| `/webhooks` | `webhooks` | Inbound webhook receivers (payment providers, etc.) |

### Error format

Every error response (from `HttpExceptionFilter`) has this shape regardless
of which module threw it:

```json
{
  "statusCode": 404,
  "message": "Event not found",
  "allMessages": ["Event not found"],
  "error": "Not Found",
  "timestamp": "2026-07-29T12:00:00.000Z",
  "path": "/events/123",
  "method": "GET"
}
```

`allMessages` is always an array — for `class-validator` DTO failures it
contains every field error, while `message` holds just the first one for
convenience.

### Rate limiting

A global Redis-backed limiter allows **100 requests per 60 seconds** per
client by default (`ThrottlerModule` in `backend/src/app.module.ts`).
Individual routes may apply a stricter `@Throttle(...)` (e.g. `auth/login`).
Exceeding the limit returns `429 Too Many Requests`.

---

## Smart contract interface

The contract lives at `contract/src/lumentix_contract.rs` (entry point
`LumentixContract`) plus a smaller standalone `TicketContract` in
`contract/src/contract/mod.rs` used for the original escrow/validator demo
flow. Types are in `contract/src/types.rs`, storage helpers in
`contract/src/storage.rs`, errors in `contract/src/error.rs`, and events in
`contract/src/events/mod.rs`.

For the exhaustive, code-sample-driven walkthrough see
**`contract/USAGE_EXAMPLES.md`**, and for a full per-error breakdown see
**`contract/ERRORS.md`**. This section is the map of what's there.

### Core lifecycle functions

| Function | Purpose |
|---|---|
| `initialize(admin)` | One-time contract setup |
| `create_event(...)`, `update_event`, `update_event_status`, `cancel_event`, `complete_event` | Event lifecycle |
| `purchase_ticket`, `batch_purchase_tickets`, `mint_batch_tickets` | Ticket issuance |
| `use_ticket`, `batch_use_tickets`, `revoke_ticket` | Check-in / gate control |
| `transfer_ticket`, `batch_transfer_tickets` | Peer-to-peer ticket transfer |
| `refund_ticket` | Refunds for cancelled events |
| `release_escrow`, `get_escrow_balance` | Organizer payout |
| `submit_event_review`, `validate_reviewer_attendance`, `calculate_reputation_score` | Attendance-gated reviews & organizer reputation |
| `propose_upgrade`, `vote_on_upgrade`, `execute_upgrade` | Governance-gated contract upgrades |
| `purchase_insurance`, `process_insurance_claim` | Optional ticket insurance |
| `create_venue_layout`, `select_seat` | Seat-map based venues |

Every mutating call that requires authorization calls
`<address>.require_auth()` before touching storage — always simulate first
(`try_<fn>` in the generated client) to catch `LumentixError`s without
spending network fees.

### Errors

All contract errors are a single `LumentixError` enum (`contracterror`,
`u32` codes) — see `contract/src/error.rs` for the full, numbered list and
`contract/ERRORS.md` for a per-error "when it occurs / how to resolve"
writeup. Client-side, prefer the `try_*` variant of any call so failures come
back as a typed `Result` instead of a failed transaction:

```rust
match client.try_purchase_ticket(&buyer, &event_id, &payment) {
    Ok(Ok(ticket_id)) => { /* success */ }
    Ok(Err(LumentixError::EventSoldOut)) => { /* handle */ }
    Err(_) => { /* host/network error */ }
}
```

### Events

The contract publishes a topic-tagged event for nearly every state
transition (ticket transfers, check-ins, reviews, upgrades, insurance
claims, etc.) — see the full list exported from `contract/src/lib.rs` and
implemented in `contract/src/events/mod.rs`. Each event struct exposes a
static `emit(&env, ...)` and publishes under a short (≤9 char) topic symbol,
e.g.:

```rust
pub struct TicketPurchased;
impl TicketPurchased {
    pub fn emit(env: &Env, ticket_id: u64, event_id: u64, buyer: Address, price: i128) { ... }
}
```

Index these from an off-chain indexer via `getEvents` on the Soroban RPC,
filtering by contract ID and topic.

---

## Integration guidelines

1. **Pick the right surface.** Anything that must be independently
   verifiable on-chain (ticket ownership, payment escrow, attendance proofs)
   belongs in the contract. Everything else (search, notifications,
   analytics, recommendations) belongs in the backend.
2. **Simulate before you send.** Use `try_*` contract calls and the
   backend's validation-pipe error responses to fail fast in development.
3. **Auth once, reuse everywhere.** A single wallet-verify or
   email/password login gives you a JWT valid for both the backend and, via
   `frontend/contexts/WalletContext.tsx`, wallet session state for signing
   contract transactions.
4. **Respect the rate limiter.** Batch reads where possible; the default
   budget is 100 req/min per client.
5. **Watch contract events, don't poll contract state.** Polling `get_*`
   view functions for every ticket is wasteful — subscribe to the relevant
   emitted event instead.
6. **Non-production only tooling.** Swagger (`/api`) and any `/testing/*`
   routes are unavailable when `NODE_ENV=production` — don't build a
   production integration against them.

---

## Code samples

### REST: purchase flow (TypeScript)

```typescript
const api = 'http://localhost:3000';

const { accessToken } = await fetch(`${api}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
}).then((r) => r.json());

const intent = await fetch(`${api}/payments/intent`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({ eventId, quantity: 1 }),
}).then((r) => r.json());

// Sign `intent.xdr` with the user's wallet, then confirm:
await fetch(`${api}/payments/confirm`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({ paymentId: intent.id, signedXdr }),
});
```

### Contract: purchase + check-in (Rust test harness style)

```rust
let admin = Address::generate(&env);
let organizer = Address::generate(&env);
let buyer = Address::generate(&env);

client.initialize(&admin);
let event_id = client.create_event(
    &organizer, &name, &description, &location,
    &start_time, &end_time, &ticket_price, &max_tickets,
);

let ticket_id = client.purchase_ticket(&buyer, &event_id, &ticket_price);
client.use_ticket(&ticket_id, &organizer); // gate check-in
```

### Contract: JS client (soroban-client / stellar-sdk)

```typescript
import { Contract, SorobanRpc, TransactionBuilder, Networks } from '@stellar/stellar-sdk';

const server = new SorobanRpc.Server('https://soroban-testnet.stellar.org');
const contract = new Contract(CONTRACT_ID);

const tx = new TransactionBuilder(sourceAccount, {
  fee: '1000000',
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(contract.call('purchase_ticket', buyerAddr, eventIdU64, priceI128))
  .setTimeout(30)
  .build();

const simulated = await server.simulateTransaction(tx);
// inspect simulated.result / simulated.error before signing + submitting
```

---

## Runnable sandboxes

Live-hosted CodeSandbox links aren't checked into source control (URLs would
go stale and can't be verified from this repo), but the snippets below are
self-contained CodeSandbox/StackBlitz-ready projects — paste each into a new
sandbox to get an interactive playground.

### Sandbox 1 — REST client (Node + `sandbox.config.json` for CodeSandbox)

```json
// sandbox.config.json
{ "template": "node" }
```

```json
// package.json
{
  "name": "lumentix-rest-sandbox",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": { "start": "node index.js" },
  "dependencies": { "node-fetch": "^3.3.0" }
}
```

```javascript
// index.js
import fetch from 'node-fetch';

const API = process.env.LUMENTIX_API ?? 'http://localhost:3000';

async function main() {
  const events = await fetch(`${API}/events`).then((r) => r.json());
  console.log('Upcoming events:', events);
}

main().catch(console.error);
```

### Sandbox 2 — Wallet-signed contract call (browser + Freighter)

```json
// package.json
{
  "name": "lumentix-contract-sandbox",
  "version": "1.0.0",
  "dependencies": {
    "@stellar/stellar-sdk": "^12.0.0",
    "@stellar/freighter-api": "^2.0.0"
  }
}
```

```typescript
// index.ts
import * as Freighter from '@stellar/freighter-api';
import { Contract, SorobanRpc, TransactionBuilder, Networks } from '@stellar/stellar-sdk';

async function purchaseTicket(eventId: bigint, price: bigint) {
  const { address } = await Freighter.requestAccess();
  const server = new SorobanRpc.Server('https://soroban-testnet.stellar.org');
  const account = await server.getAccount(address);
  const contract = new Contract(process.env.CONTRACT_ID!);

  const tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call('purchase_ticket', address, eventId, price))
    .setTimeout(30)
    .build();

  const { signedTxXdr } = await Freighter.signTransaction(tx.toXDR(), {
    networkPassphrase: Networks.TESTNET,
  });

  return server.sendTransaction(TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET));
}
```

Both sandboxes assume a locally running backend (`backend/README.md`) and/or
a deployed testnet contract (`contract/SETUP.md`).
