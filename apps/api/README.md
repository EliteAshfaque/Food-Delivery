# Wasil API

NestJS API for authentication, restaurants, menus, checkout, Stripe, driver
dispatch, live tracking, notifications, administration, and reports.

## Setup

```bash
cp apps/api/.env.example apps/api/.env
pnpm install
pnpm --dir apps/api db:push
```

Set `DATABASE_URL`, `JWT_SECRET`, Upstash Redis credentials, and integration
values (Stripe, UploadThing, Google) in `apps/api/.env` before running.

## Commands

```bash
# Start API at http://localhost:3000
pnpm --dir apps/api dev
pnpm --dir apps/api start

# Build/production
pnpm --dir apps/api build
pnpm --dir apps/api start:prod

# Database
pnpm --dir apps/api db:push
pnpm --dir apps/api db:studio

# Validation
pnpm --dir apps/api lint
pnpm --dir apps/api lint:fix
pnpm --dir apps/api format
pnpm --dir apps/api exec tsc --noEmit

# Tests
pnpm --dir apps/api test
pnpm --dir apps/api test:watch
pnpm --dir apps/api test:cov
pnpm --dir apps/api test:e2e
```

API prefix: `http://localhost:3000/api`. Socket namespace:
`ws://localhost:3000/orders`.

## Cache

Upstash supports both live driver GPS and cache-aside catalogue reads:

- restaurant list/search: 30 seconds
- restaurant detail: 120 seconds
- menu and categories: 60 seconds

Restaurant/menu/category/review/admin updates invalidate the affected keys;
catalogue invalidation uses a versioned tag to cover all search variants. Redis
failure falls back to PostgreSQL. Orders, payments, carts, dispatch, and GPS
are never cached as catalogue data.

## Android FCM

For direct Android FCM, set only server-side values:

```env
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_SERVICE_ACCOUNT_FILE=/absolute/path/to/service-account.json
```

Restart API after changing them. Keep the service-account JSON outside Git.

## First administrator

1. Register a normal account.
2. Set `ADMIN_BOOTSTRAP_EMAIL` to that account email in API `.env`.
3. Restart API once and sign in to the admin portal.
4. Remove the variable and restart API again.

There is intentionally no public admin-registration endpoint.

## Production

Use HTTPS, exact `CORS_ORIGINS`/`SOCKET_CORS_ORIGIN`, Stripe webhook
verification at `/api/payments/webhook`, managed migrations, and deployment
secret storage.
