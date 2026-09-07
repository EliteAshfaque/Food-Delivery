# Wasil Food Delivery

Wasil is a role-based food-delivery platform built with an Expo mobile app and
a NestJS API. It supports customers, restaurant owners, drivers, and a
separate protected administrator workspace.

## What is included

- Customer discovery, restaurant distance, searchable map pins, cart,
  delivery-address validation, Stripe card checkout, order tracking, reviews,
  and Hot Offers.
- Restaurant onboarding, approval workflow, map-pin editing, menu management,
  offer campaigns, order preparation, and driver-availability checks.
- Driver availability, atomic order assignment, pickup/delivery workflow,
  route hand-off, and permissioned live-location sharing.
- Admin dashboard, user/account lifecycle management, restaurant moderation,
  orders and refunds, Hot Offer curation, pagination, and immutable audit
  records.
- Server-side validation, account-status enforcement, upload authorization,
  transactional checkout, offer reservations, payment/refund reconciliation,
  and real-time socket authorization.

## Workspace

| Path | Purpose |
| --- | --- |
| `apps/mobile` | Expo / React Native client |
| `apps/admin` | Separate browser-based operations portal |
| `apps/api` | NestJS + Drizzle API |
| `packages/types` | Shared domain types |

## Local setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
cp apps/admin/.env.example apps/admin/.env
pnpm --filter api db:push
pnpm dev:api
pnpm dev:mobile
```

Use separate terminals for the last two commands, or run `pnpm dev`.

## Browser Admin Portal

The administrator workspace is a separate browser application, not part of
the customer/driver mobile experience.

```bash
# Terminal 1 — API (must be running first)
pnpm dev:api

# Terminal 2 — browser admin portal
pnpm dev:admin
```

Open the URL shown by Vite (normally `http://localhost:5174`). Sign in with an
**active ADMIN** account. There is no public admin registration page. Create
the first admin using the bootstrap instructions below, then remove the
bootstrap environment variable.

For a production portal, set `VITE_API_URL` in `apps/admin/.env` to the public
`https://.../api` address and add the exact portal HTTPS address to
`CORS_ORIGINS` in `apps/api/.env`.

## Required configuration

Set the real values in the relevant `.env` files; never commit them.

- API: `DATABASE_URL`, `JWT_SECRET`, Stripe secret/webhook secret,
  UploadThing token, Upstash Redis credentials, and Google Web Client ID.
- If the API is behind one trusted reverse proxy/load balancer, set
  `TRUST_PROXY=true` so login-rate limiting uses the real client IP.
- Mobile: API/server URL for production, Stripe publishable key, Google map
  keys, and the same Google Web Client ID.
- Google Sign-In: the Android OAuth client must use the app package name and
  registered signing SHA-1. Download a fresh `google-services.json` after
  enabling Google Sign-In—the current file must contain the OAuth client.
- Maps: configure separate Android and iOS SDK keys and restrict each key to
  its package/bundle ID.

## First administrator

1. Register a dedicated customer/support account.
2. Set `ADMIN_BOOTSTRAP_EMAIL` in the API deployment environment to that
   account's email.
3. Restart the API once, sign in as that account, then remove the variable.

The API refuses to bootstrap an active owner or driver account as an admin.

## Verification

```bash
pnpm verify
pnpm test:e2e
```

The E2E test starts a temporary localhost server. In restricted environments,
run it where local port binding is permitted.

## Production hand-off

- Configure Stripe webhooks for payment-intent and refund lifecycle events at
  `/api/payments/webhook`; webhook verification is mandatory.
- Use a managed migration process rather than `db:push` for a production
  database rollout.
- Add a transactional email/SMS provider before offering password-reset
  messages, and add a push provider (FCM/Expo/APNs) before promising
  background push notifications. The application already has real-time
  in-app socket updates.
