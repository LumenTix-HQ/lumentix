# Lumentix Frontend

Next.js 14 app for Lumentix: event discovery, registration, ticketing and
Stellar payments.

- [Requirements](#requirements)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Running the backend](#running-the-backend)
- [Authentication and the API proxy](#authentication-and-the-api-proxy)
- [Scripts](#scripts)
- [Project layout](#project-layout)
- [Wallet integration](#wallet-integration)
- [Security headers and images](#security-headers-and-images)
- [Testing](#testing)
- [Further reading](#further-reading)

## Requirements

- **Node.js >= 20.19** (or >= 22.12). The toolchain (jsdom 29,
  `@vitejs/plugin-react` 6) does not support Node 18, and CI runs Node 20. The
  version is pinned in `.nvmrc` and enforced by the `engines` field in
  `package.json`.
- npm 10+
- A running Lumentix backend and its Postgres/Redis dependencies (see below)
- [Freighter](https://www.freighter.app/) for wallet payments

```bash
nvm use            # reads .nvmrc
```

## Getting started

```bash
cd frontend
npm install
cp env.example .env.local
npm run dev
```

Open http://localhost:3000. The app expects the backend at the origin in
`NEXT_PUBLIC_API_URL`; see [Running the backend](#running-the-backend).

If `next dev` and the backend both want port 3000, either start Next on another
port (`npm run dev -- -p 3001`) or start the backend on 8000 (matching
`env.example`): `PORT=8000 npm run start:dev`.

## Environment variables

`env.example` is the source of truth and documents every variable. Copy it to
`.env.local`; only `NEXT_PUBLIC_*` values reach the browser, so never put a
secret there.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` or `mainnet`; the wallet must match. |
| `NEXT_PUBLIC_HORIZON_URL` | Horizon endpoint for that network. |
| `NEXT_PUBLIC_API_URL` | NestJS backend origin used by the server-side `/api/proxy` route. |
| `NEXT_PUBLIC_APP_URL` | Public frontend origin for sitemap, robots and share links. |
| `NEXT_PUBLIC_IMAGE_HOSTS` | Comma-separated https hosts `next/image` may optimize. |
| `NEXT_PUBLIC_ANALYTICS_URL` | Optional analytics collector; also added to the CSP. |
| `NEXT_PUBLIC_PLATFORM_ACCOUNT` | Platform/escrow Stellar public key. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Enables web push when set. |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Enables the WalletConnect connector when set. |

## Running the backend

The API lives in `../backend` and needs Postgres and Redis.

```bash
cd ../backend
cp .env.example .env          # set DB_*, JWT_SECRET, Stellar keys
npm install
npm run migration:run
PORT=8000 npm run start:dev   # 8000 keeps 3000 free for `next dev`
```

Then keep `NEXT_PUBLIC_API_URL=http://localhost:8000` in `frontend/.env.local`.
The backend's own defaults, migrations and Swagger URL are documented in
[`../backend/README.md`](../backend/README.md).

## Authentication and the API proxy

The browser never talks to the NestJS API directly and never stores JWTs in
JavaScript-readable storage:

1. `app/api/auth/login/route.ts` posts credentials to the backend and sets the
   returned access/refresh tokens as **HttpOnly, SameSite cookies**.
2. Every authenticated browser call goes through `lib/api-client.ts`, which
   requests the catch-all route handler at `app/api/proxy/[...path]/route.ts`.
   The handler validates the path, resolves it against `NEXT_PUBLIC_API_URL`,
   attaches the cookie's bearer token and forwards the response.
3. `app/api/auth/refresh/route.ts` rotates the cookies. `AuthContext` resolves
   the current user from `/api/proxy/auth/me`, and `app/api/auth/logout/route.ts`
   clears both cookies.
4. `middleware.ts` redirects anonymous users away from protected pages and
   enforces organizer/admin roles from the JWT claim.

Because of this model, pages must use `lib/api-client.ts` (or `apiGet` from
`lib/api-client.ts`) rather than `fetch(`${NEXT_PUBLIC_API_URL}/...`)`. Direct
browser calls skip the cookie and see a 401.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Next.js dev server. |
| `npm run build` | Production build. |
| `npm start` | Serve the production build. |
| `npm run lint` | `next lint`. |
| `npm test` | Vitest in watch mode. |
| `npm run test:run` | Vitest once (what CI runs). |
| `npm run test:coverage` | Vitest with the coverage gate. |
| `npm run test:e2e` | Playwright end-to-end suite. |
| `npm run test:e2e:install` | Install the Playwright Chromium browser. |
| `npm run verify:stellar` | Stellar integration smoke script. |
| `npm run check-deps` | Fails if a package is in both `dependencies` and `devDependencies`. |

## Project layout

```
app/          App Router pages and route handlers (api/auth, api/proxy)
components/   UI components
contexts/     Auth, wallet and theme providers
hooks/        Data and wallet hooks
lib/          API client, auth helpers, Stellar helpers, validation
messages/     next-intl translations
tests/        Vitest unit/integration tests and Playwright e2e specs
public/       Static assets and the hand-written service worker (sw.js)
```

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the data flow and module
boundaries.

## Wallet integration

Payments are signed in the user's wallet (Freighter, or WalletConnect when
configured). The app never asks for a Stellar secret key, and signing happens
before the transaction hash is sent to the backend. See
[`WALLET_INTEGRATION.md`](./WALLET_INTEGRATION.md) for the provider, hooks and
transaction helpers.

> `/test-payment` is a **development-only demo** for exercising Friendbot and
> the Stellar SDK. It is not part of the customer purchase flow; real checkout
> runs through `components/PaymentFlow.tsx`.

## Security headers and images

`next.config.base.js` (wrapped by `next.config.js`) sets:

- a Content-Security-Policy whose `script-src` pins the inline theme bootstrap
  by SHA-256 hash, plus `frame-ancestors 'none'`, `object-src 'none'`,
  `base-uri 'self'` and `form-action 'self'`
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin` and a restrictive
  `Permissions-Policy`

`next/image` only optimizes **https** hosts listed in `NEXT_PUBLIC_IMAGE_HOSTS`;
the former `hostname: "**"` http/https wildcards are gone. Add a CDN/storage
host there when organizers host images elsewhere.

## Testing

The unit suite is Vitest + Testing Library; end-to-end specs are Playwright
(see `playwright.config.ts`). The manual QA checklist, including wallet cases,
is in [`TESTING_CHECKLIST.md`](./TESTING_CHECKLIST.md).

## Further reading

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system architecture
- [`WALLET_INTEGRATION.md`](./WALLET_INTEGRATION.md) — wallet provider and signing
- [`TESTING_CHECKLIST.md`](./TESTING_CHECKLIST.md) — manual test plan
- [`SETUP.md`](./SETUP.md) — longer local setup notes
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — contribution rules and migrations

## License

MIT
