Lumentix on-chain sponsors contract (Soroban)

This directory contains a Soroban smart contract that provides an on-chain
equivalent for sponsor tiers and contributions. It implements three primary
functions:

- `register_sponsor_tier(env, event_id, tier_id, price, max_sponsors)`
  - Registers a tier for an event. The first caller for a given event is
    recorded as the event organizer; subsequent calls require the organizer's
    authorization.
- `contribute(env, event_id, tier_id, sponsor, amount)`
  - Verifies capacity, records the sponsor in the tier contribution list, and
    increments the sponsor count. Token payment handling is intentionally
    left minimal and should be integrated with a token client (transfer/pull)
    per your token strategy.
- `get_tier_contributions(env, event_id, tier_id)`
  - View that returns the sponsor count and the list of sponsor addresses.

Notes / Next steps
- The contract is a minimal, first-pass implementation. You should:
  - Add explicit token transfer semantics (token client calls / allowances).
  - Add events/logs for registrations and contributions for better auditability.
  - Add unit tests using the Soroban SDK test harness and CI steps to build.

Build (requires Rust + Soroban CLI):

```bash
cd contract
cargo build --target wasm32-unknown-unknown
```
Contract Folder