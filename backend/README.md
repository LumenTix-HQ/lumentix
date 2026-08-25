# 🌟 Lumentix Backend – Stellar Event Platform API (NestJS)

The backend powering **Lumentix**, a decentralized event management platform built on the Stellar blockchain.

This backend is built with **NestJS + TypeScript + TypeORM + PostgreSQL** and serves as the core API layer that manages events, users, payments, sponsors, and blockchain operations ✨

---

# 🎯 What This Backend Does

This API acts as the bridge between your frontend and the Stellar network. It handles:

- Event management (CRUD)
- User authentication + wallet linking
- Payment orchestration & escrow handling
- Sponsor contributions
- Ticket issuance & verification
- Refund workflows
- Stellar blockchain interactions

If it involves business logic, data, or blockchain operations — it happens here.

---

# 🛠️ Tech Stack (Updated)

- **Framework:** NestJS
- **Language:** TypeScript
- **Runtime:** Node.js 18+
- **Database:** PostgreSQL
- **ORM:** TypeORM
- **Blockchain SDK:** stellar-sdk
- **Authentication:** JWT + Wallet verification
- **API Style:** REST
- **Validation:** class-validator + class-transformer
- **Docs:** Swagger (OpenAPI)

---

# 🚀 Quick Start

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm / yarn / pnpm
- Stellar testnet account + test XLM

---

## Installation

```bash
# install deps
npm install

# copy env
cp .env.example .env

# update env values
# then run migrations
npm run migration:run

# start dev server
npm run start:dev
```

API runs at:

```
http://localhost:3000
```

Swagger docs (development only):

```
http://localhost:3000/api
```

---

# 📁 Project Structure (NestJS Style)

```
lumentix-backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── app.controller.ts
│   ├── app.service.ts
│
│   ├── config/               # env validation
│   ├── common/               # guards, filters, interceptors, decorators, etc.
│   ├── database/             # data-source & migrations
│
│   ├── auth/
│   ├── users/
│   ├── events/
│   ├── payments/
│   ├── tickets/
│   ├── registrations/
│   ├── sponsors/
│   ├── stellar/
│   ├── wallet/
│   ├── notifications/
│   ├── analytics/
│   ├── categories/
│   ├── currencies/
│   ├── reviews/
│   ├── social/
│   └── ...                   # additional feature modules
│
├── .env.example
├── package.json
└── README.md
```

---

# 🔑 Core Modules

## Events Module

**Endpoints**

```
GET    /events
GET    /events/:id
POST   /events
PATCH  /events/:id
DELETE /events/:id
```

**Responsibilities**

- Store event metadata in PostgreSQL
- Create Stellar asset codes for tickets
- Setup escrow accounts
- Link organizer wallet

---

## Registration Module

**Endpoints**

```
POST /events/:id/register
GET  /events/:id/registrations
GET  /users/me/registrations
```

**Paid Flow**

1. Registration request created
2. Payment transaction built
3. Wallet approval
4. Funds sent to escrow
5. Ticket token issued
6. DB record confirmed

---

## Payments Module

**Endpoints**

```
POST /payments/initiate
GET  /payments/:id/status
POST /payments/:id/refund
```

**Features**

- Stellar transaction building
- Escrow funding
- Ticket token issuance
- Multi-asset support
- Path payments

---

## Sponsors Module

Sponsor tiers, funding goals, contribution tracking, escrow distribution.

---

## Tickets Module

QR-based ticket verification via Stellar ownership lookup.

---

# 🔐 Authentication (NestJS)

## JWT Auth

- Passport + JWT strategy
- Access tokens
- Refresh tokens (optional)
- Role-based guards

```
Authorization: Bearer <token>
```

## Wallet Linking

- Challenge signing
- Public key verification
- Wallet binding to user entity

---

# 🗄️ Database (TypeORM)

## Entities

### UserEntity

- id
- email
- passwordHash
- stellarPublicKey
- role
- createdAt

### EventEntity

- id
- title
- description
- price
- assetCode
- escrowAccount
- organizerId

### RegistrationEntity

- id
- eventId
- userId
- paymentTxHash
- ticketTokenId
- status

### SponsorEntity

- id
- eventId
- userId
- amount
- tier

---

# ⚙️ Environment Variables (Updated)

```env
PORT=3000
NODE_ENV=development

# Postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=password
DB_NAME=lumentix

# TypeORM
DB_SYNCHRONIZE=false
DB_LOGGING=true

# JWT
JWT_SECRET=super_secret
JWT_EXPIRES=1h

# Stellar
STELLAR_NETWORK=testnet
HORIZON_URL=https://horizon-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015

PLATFORM_PUBLIC_KEY=
PLATFORM_SECRET_KEY=

# CORS
CORS_ORIGIN=http://localhost:3000
```

---

# 🧪 Testing (NestJS)

```bash
npm run test
npm run test:e2e
npm run test:cov
```

---

# 📚 Swagger Setup

Swagger is enabled in `main.ts`:

- Global config
- JWT bearer scheme
- Module tags
- DTO decorators

Docs available at:

```
/api
```

> Swagger is only served in non-production environments.

---

# 🔒 Security

- DTO validation (class-validator)
- Global validation pipe
- Guards for protected routes
- Rate limiting (nestjs/throttler)
- Env-based secrets
- TypeORM parameterized queries
- CORS config
- Helmet middleware

---

# 📊 Logging & Monitoring

- NestJS Logger or Winston
- Structured logs
- Error filters
- Request tracing interceptor

---

# 🚀 Migration Commands (TypeORM)

```bash
# generate migration
npm run migration:generate -- src/database/migrations/init

# run migration
npm run migration:run

# revert
npm run migration:revert
```

---

# 🐛 Debugging Stellar

Log transactions inside `stellar.service.ts`:

```ts
this.logger.debug(transaction.toXDR());
this.logger.debug(transaction.hash().toString('hex'));
```

---

# 🗺️ Roadmap

### Phase 1 — MVP

- Event CRUD
- Auth
- Registration
- Payments
- Sponsor system

### Phase 2

- Refund automation
- Ticket transfer
- QR verification
- Multi-currency

### Phase 3

- Soroban contracts
- Multi-sig escrow
- Analytics

---

# 🤝 Contributing

- Follow NestJS module structure
- Use DTOs for all input
- Separate guards/services/controllers
- Write tests
- Use Prettier + ESLint

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
