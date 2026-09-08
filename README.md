# Wasil Food Delivery

Wasil is a pnpm workspace containing the customer, driver, restaurant-owner,
administrator, and backend applications for a food-delivery platform.

## Projects

| Project | Path | Technology | Run command |
| --- | --- | --- | --- |
| API | `apps/api` | NestJS, Drizzle, Neon/Postgres, Upstash | `pnpm dev:api` |
| Mobile | `apps/mobile` | Expo, React Native | `pnpm --dir apps/mobile start` |
| Admin portal | `apps/admin` | React, Vite | `pnpm dev:admin` |
| Shared types | `packages/types` | TypeScript | workspace dependency |

Project guides: [API](apps/api/README.md), [mobile](apps/mobile/README.md),
[admin](apps/admin/README.md), [shared types](packages/types/README.md), and
[app flows/testing](docs/APP_FLOWS.md). For backend connection diagrams, see
[NestJS architecture](docs/NESTJS_ARCHITECTURE.md). For the all-in-one map,
see [complete project flow](docs/PROJECT_SYSTEM_FLOW.md).

## Prerequisites

- Node.js 20 or newer
- pnpm 11 (`corepack enable && corepack prepare pnpm@11.21.0 --activate`)
- PostgreSQL/Neon and Upstash Redis credentials
- Android Studio for Android; Xcode and CocoaPods on macOS for iOS

## First local setup

```bash
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
cp apps/admin/.env.example apps/admin/.env
pnpm --dir apps/api db:push
```

Fill in real values in `.env` files; never commit secrets.

## Run the complete app

Use three terminals:

```bash
# Terminal 1 — API: http://localhost:3000
pnpm dev:api

# Terminal 2 — Admin portal: normally http://localhost:5174
pnpm dev:admin

# Terminal 3 — Expo Metro
pnpm --dir apps/mobile start
```

For API and Metro together: `pnpm dev`.

## Database and verification

```bash
pnpm --dir apps/api db:push
pnpm --dir apps/api db:studio
pnpm verify
pnpm test:e2e
```

Use reviewed migrations, not `db:push`, in production.

## Architecture

```text
Mobile app / Admin portal → Nest API → PostgreSQL / Neon
                              ├─ Upstash Redis (GPS + catalogue cache)
                              ├─ Stripe
                              └─ FCM / Expo push
Mobile app ← Socket.IO /orders → Nest API
```

## Security

- Keep `.env`, Firebase service accounts, Stripe keys, database URLs, and JWT
  secrets out of Git and chat.
- Rotate any credential that was exposed.
- There is no public admin registration. See the API guide for bootstrap.
