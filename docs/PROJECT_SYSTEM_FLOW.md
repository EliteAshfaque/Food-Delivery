# Wasil Complete Project Flow

This is the whole-system view: who uses each app, where requests go, what is
stored, and which events update other users in real time.

## Complete connection map

```mermaid
flowchart LR
    customer["Customer"]
    owner["Restaurant owner"]
    driver["Driver"]
    adminUser["Administrator"]

    mobile["Wasil mobile app (Expo React Native)"]
    adminWeb["Admin portal (React Vite)"]

    api["NestJS API: HTTP slash api and Socket.IO slash orders"]

    auth["Auth: JWT role and account guards"]
    catalog["Restaurants and menu: public catalogue"]
    address["Addresses and maps: saved pin coordinates"]
    order["Orders: state machine timeline and events"]
    payment["Payments: Stripe confirmation and refunds"]
    dispatch["Driver dispatch: offer accept pickup delivery"]
    tracking["Live tracking: driver GPS socket gateway"]
    operations["Operations: admin support notifications reports"]
    upload["Upload authorization"]

    postgres["PostgreSQL or Neon: users restaurants menus orders payments audit"]
    redis["Upstash Redis: live GPS and catalogue cache"]

    stripe["Stripe: payments and webhooks"]
    fcm["Firebase Cloud Messaging: Android push"]
    expo["Expo push or APNs: iOS push route"]
    google["Google Maps Places: search geocode map"]
    files["UploadThing: restaurant and menu images"]

    customer --> mobile
    owner --> mobile
    driver --> mobile
    adminUser --> adminWeb

    mobile -->|"HTTPS API requests"| api
    mobile <-->|"Socket.IO live order and GPS"| api
    adminWeb -->|"HTTPS admin requests"| api

    api --> auth
    api --> catalog
    api --> address
    api --> order
    api --> payment
    api --> dispatch
    api --> tracking
    api --> operations
    api --> upload

    auth --> postgres
    catalog --> postgres
    catalog --> redis
    address --> postgres
    order --> postgres
    payment --> postgres
    dispatch --> postgres
    tracking --> redis
    operations --> postgres

    payment -.->|"Create intent verify webhook refund"| stripe
    operations -.->|"Send Android order push"| fcm
    operations -.->|"Send Expo or iOS push"| expo
    mobile -.->|"Place search map and geocoding"| google
    upload -.->|"Authorise image uploads"| files
```

## How to read the map

1. The Customer, Owner, and Driver use the same mobile app with role-specific
   routes after login.
2. The Admin uses the separate browser portal.
3. Every protected request first passes JWT/account/role checks.
4. Business services write permanent records to PostgreSQL/Neon.
5. Redis is only for fast, temporary data: last driver GPS and public catalogue
   cache. It is never the source of truth for payments or orders.
6. Socket.IO sends live order/GPS events while an app is open.
7. FCM/Expo/APNs sends push updates when an app is backgrounded or locked.

## Whole order journey

```mermaid
flowchart TD
    discover["Customer browses approved open restaurant"]
    menu["Customer adds available menu items to cart"]
    address["Customer chooses saved address or exact map pin"]
    review["Review and pay"]
    pending["API creates pending order and payment intent"]
    paid["Stripe webhook confirms payment"]
    confirmed["Order confirmed: customer and owner notified"]
    preparing["Owner starts preparing"]
    ready["Owner marks ready: dispatch offers online driver"]
    accepted["Driver accepts delivery"]
    pickup["Driver reaches restaurant and confirms pickup"]
    tracking["Driver shares GPS: customer and owner map updates"]
    delivered["Driver marks delivered"]
    reviewOrder["Customer can review restaurant and driver"]

    discover --> menu --> address --> review --> pending --> paid --> confirmed
    confirmed --> preparing --> ready --> accepted --> pickup --> tracking --> delivered --> reviewOrder
```

## Who receives which update

| Event | Customer | Restaurant owner | Driver | Admin |
| --- | --- | --- | --- | --- |
| Payment confirmed | Tracking status/push | New order socket/push | — | Order visible |
| Preparing | Status/push | Own dashboard | — | Timeline visible |
| Ready | Status/push | Own dashboard | Driver offer | Timeline visible |
| Driver accepts | Rider assigned status | Driver progress | Active delivery | Timeline visible |
| Driver GPS | Smooth moving map pin | Pickup progress map pin | Own location | Operations data |
| Picked up | On-the-way status/push | Order progress | Delivery route | Timeline visible |
| Delivered | Delivered status/push/review | Completed order | Delivery finished | Settlement/report data |
| Cancel/refund | Cancellation/refund status | Intervention result | Offer revoked if relevant | Full audit/support record |

## Data ownership

| Data | Owner/source of truth | Used by |
| --- | --- | --- |
| Accounts, roles, status | PostgreSQL `user` records | All applications |
| Restaurant/menu/location | PostgreSQL, owner/admin writes | Customer catalogue, owner, driver pickup |
| Saved customer address | PostgreSQL `user_addresses` | Customer checkout; copied to order snapshot |
| Order/address/total/status | PostgreSQL `orders` and timeline | All role-specific order screens |
| Payment/refund | Stripe + PostgreSQL payment records | Customer, admin finance |
| Driver current GPS | Upstash Redis with TTL | Customer/owner live maps |
| Restaurant catalogue cache | Upstash Redis short TTL | Customer discovery and menu reads |
| Push token/delivery history | PostgreSQL | Notification sender/admin delivery log |

## Runtime commands

```bash
# API
pnpm dev:api

# Admin browser portal
pnpm dev:admin

# Mobile Metro for installed development build
pnpm --dir apps/mobile start --dev-client

# Android native build/install after native config changes
pnpm --dir apps/mobile android

# iOS native build/install
pnpm --dir apps/mobile ios

# Validate the full repository
pnpm verify
```

For a physical phone, point `EXPO_PUBLIC_DEV_HOST` in `apps/mobile/.env` to
the Mac LAN IP and restart Metro.
