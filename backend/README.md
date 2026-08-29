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
npm run typeorm:migration:run

# start dev server
npm run start:dev
```

API runs at:

```
http://localhost:3000
```

Swagger docs:

```
http://localhost:3000/api-docs
```

---

# 📁 Project Structure (NestJS Style)

```
lumentix-backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│
│   ├── config/
│   │   ├── database.config.ts
│   │   └── stellar.config.ts
│
│   ├── common/
│   │   ├── guards/
│   │   ├── filters/
│   │   ├── interceptors/
│   │   └── decorators/
│
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── dto/
│   │
│   │   ├── users/
│   │   ├── events/
│   │   ├── payments/
│   │   ├── sponsors/
│   │   ├── tickets/
│   │
│   │   └── stellar/
│   │       └── stellar.service.ts
│
├── test/
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

# ⚙️ Environment Variables

Copy `.env.example` to `.env` and fill in the required values. The full list below matches what `src/config/env.validation.ts` validates on boot — missing required variables will prevent the app from starting.

```env
# App
PORT=3000
NODE_ENV=development

# Postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=change_me
DB_NAME=lumentix

# JWT (secret must be at least 32 characters)
JWT_SECRET=change_me_to_a_random_32_char_secret_value
JWT_EXPIRES_IN=1h

# Stellar
STELLAR_NETWORK=testnet
HORIZON_URL=https://horizon-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
PLATFORM_PUBLIC_KEY=your_stellar_platform_public_key
PLATFORM_SECRET_KEY=your_stellar_platform_secret_key

# Ticket Signing
TICKET_SIGNING_SECRET=your_ticket_signing_stellar_secret_key
TICKET_SIGNING_PUBLIC_KEY=your_ticket_signing_stellar_public_key

# SMTP / Mailer
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
MAIL_FROM=no-reply@example.com

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

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
/api-docs
```

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
npm run typeorm:migration:generate -- src/database/migrations/init

# run migration
npm run typeorm:migration:run

# revert
npm run typeorm:migration:revert
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
