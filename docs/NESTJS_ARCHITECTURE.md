# Wasil NestJS Setup and Connection Flow

This document describes the backend as it is wired in this repository. It is
for developers who need to run, debug, or extend the food-delivery flow.

## 1. Backend startup flow

```mermaid
flowchart TD
    start[Run pnpm dev:api] --> config[ConfigModule loads apps/api/.env]
    config --> app[AppModule imports feature modules]
    app --> db[DbModule connects PostgreSQL or Neon]
    app --> cache[CacheModule enables optional Upstash catalogue cache]
    app --> auth[AuthModule JWT guards and account checks]
    app --> modules[Orders Payments Driver Restaurants Menu Operations]
    modules --> nest[Nest HTTP API and Socket.IO start]
    nest --> api[HTTP API on port 3000 under slash api]
    nest --> socket[Socket.IO namespace slash orders]
```

## 2. System connection architecture

```mermaid
flowchart LR
    subgraph client["Client applications"]
        mobile["Expo mobile app"]
        admin["Vite admin portal"]
    end
    subgraph gateway["API entry"]
        nest["NestJS API"]
    end
    subgraph service["Backend services"]
        auth["Auth service"]
        catalog["Restaurant and menu services"]
        orders["Order and payment services"]
        driver["Driver and location services"]
        operations["Operations and notification services"]
    end
    subgraph datastore["Data stores"]
        postgres["PostgreSQL or Neon"]
        redis["Upstash Redis"]
    end
    subgraph external["External providers"]
        stripe["Stripe"]
        firebase["Firebase Cloud Messaging"]
        maps["Google Maps and Places"]
        uploadthing["UploadThing"]
    end

    mobile -->|"HTTPS"| nest
    admin -->|"HTTPS"| nest
    mobile <-->|"Socket.IO"| nest
    nest -->|"Routes"| auth
    nest -->|"Routes"| catalog
    nest -->|"Routes"| orders
    nest -->|"Routes and socket"| driver
    nest -->|"Admin routes"| operations
    auth -->|"Users and sessions"| postgres
    catalog -->|"Restaurants and menu"| postgres
    catalog -->|"Catalogue cache"| redis
    orders -->|"Orders and payments"| postgres
    driver -->|"Live driver GPS"| redis
    operations -->|"Delivery log"| postgres
    orders -.->|"Orders: payment intents and webhooks"| stripe
    operations -.->|"Notifications: Android push"| firebase
    mobile -.->|"Mobile: place search and maps"| maps
    catalog -.->|"Catalogue: images"| uploadthing
```

## 3. Required environment connections

Copy the example first:

```bash
cp apps/api/.env.example apps/api/.env
```

| Variable group | Used by | Why it is needed |
| --- | --- | --- |
| `DATABASE_URL` | `DbModule` | Persistent users, restaurants, orders, payments, audit history |
| `JWT_SECRET` | `AuthModule` | Signs and validates authenticated API/socket requests |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Location and cache services | Short-lived driver GPS and public catalogue cache |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `PaymentsService` | Creates/validates card payments and refunds |
| `UPLOADTHING_TOKEN` | Upload router | Authorises restaurant/menu uploads |
| `GOOGLE_WEB_CLIENT_ID` | Auth service | Verifies Google sign-in IDs |
| `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_FILE` | FCM service | Sends direct Android FCM notification updates |
| `CORS_ORIGINS`, `SOCKET_CORS_ORIGIN` | Nest HTTP/socket setup | Allows only configured browser origins in production |

Secrets stay in `apps/api/.env` locally and deployment secret storage in
production. Never commit the values.

## 4. API request lifecycle

```mermaid
sequenceDiagram
    participant Client as Mobile or Admin
    participant API as NestJS Controller
    participant Guard as JWT and Role Guard
    participant Service as Feature Service
    participant DB as PostgreSQL

    Client->>API: HTTPS request to slash api route
    API->>Guard: Validate JWT and role
    Guard->>Service: Allow authorised request
    Service->>DB: Read or transactional write
    DB-->>Service: Result
    Service-->>API: Validated response
    API-->>Client: JSON response
```

All controller DTOs pass through Nest `ValidationPipe` with whitelist and
forbid-unknown-field behavior. Authorization is repeated in services for
ownership-sensitive actions such as address edits, restaurant updates, and
driver location.

## 5. Customer cart and payment flow

```mermaid
sequenceDiagram
    participant Customer as Customer mobile app
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Stripe as Stripe
    participant Owner as Restaurant owner

    Customer->>API: Read restaurant and menu
    API->>DB: Read catalogue or cache-backed data
    DB-->>API: Approved open restaurant and available menu
    API-->>Customer: Restaurant and menu
    Customer->>API: Create order with address pin and items
    API->>DB: Validate restaurant items offer and address snapshot
    DB-->>API: Pending order
    API->>Stripe: Create payment intent
    Stripe-->>Customer: Card payment sheet result
    Stripe->>API: Verified payment webhook
    API->>DB: Confirm payment and create event timeline
    API-->>Owner: Socket and push new order update
```

The cart is client state only. An order stores a snapshot of its selected
delivery address, latitude, and longitude. The API is the final authority for
item price, item availability, offers, restaurant opening status, payment, and
order transitions.

## 6. Restaurant, driver, and live location flow

```mermaid
sequenceDiagram
    participant Owner as Restaurant owner
    participant API as NestJS API
    participant Driver as Driver app
    participant Redis as Upstash Redis
    participant Customer as Customer app

    Owner->>API: Mark order preparing then ready
    API->>Driver: Offer online driver through socket and push
    Driver->>API: Accept delivery offer
    Driver->>API: Send driver location socket updates
    API->>Redis: Save last known driver coordinates with TTL
    API-->>Customer: Broadcast driver location in order room
    API-->>Owner: Broadcast driver location in restaurant room
    Driver->>API: Confirm pickup
    API-->>Customer: Order status becomes picked up
    Driver->>API: Mark delivered
    API->>Redis: Delete terminal order location
    API-->>Customer: Order status becomes delivered
```

Driver apps request foreground location only during an accepted active
delivery. The gateway verifies driver identity, order assignment, and valid
status before accepting a GPS point. Redis retains only the last point for a
late-joining tracking screen.

## 7. Cache flow and invalidation

```mermaid
flowchart TD
    request[Customer requests restaurant list menu or detail] --> key[Build versioned cache key]
    key --> redis{Redis has valid value}
    redis -->|Yes| response[Return cached catalogue response]
    redis -->|No or Redis unavailable| db[Read PostgreSQL]
    db --> write[Store short TTL value when Redis is available]
    write --> response

    update[Owner admin menu category restaurant or review update] --> persist[Write PostgreSQL first]
    persist --> invalidate[Delete restaurant detail menu category keys]
    invalidate --> version[Increase catalogue version]
    version --> next[Next search reads a fresh key]
```

| Data | Cached? | Reason |
| --- | --- | --- |
| Public restaurant list/search | Yes, 30s | High read volume; version invalidation covers all searches |
| Restaurant detail | Yes, 120s | Public read-heavy data |
| Menu/categories | Yes, 60s | Public read-heavy data |
| Orders/payments/carts | No | Must always be current and transactional |
| Driver availability/assignment | No | Must be current for dispatch |
| Live driver GPS | Separate TTL record | Real-time last-known location, not catalogue cache |

If Upstash is unavailable, cache calls fail open and PostgreSQL remains the
source of truth.

## 8. Push-notification flow

```mermaid
sequenceDiagram
    participant Event as Order status event
    participant API as Operations service
    participant DB as Notification deliveries
    participant FCM as Firebase Cloud Messaging
    participant Phone as Android device

    Event->>API: Confirmed preparing ready pickup or delivered
    API->>DB: Create queued delivery record
    API->>FCM: Send push using registered FCM token
    FCM-->>Phone: Deliver notification
    API->>DB: Mark send result and provider message ID
```

Customer lifecycle notifications use the `active-order-tracking` Android
channel. The order ID is the notification tag, so each new order status updates
the existing lock-screen/status-bar card instead of creating many stale cards.

## 9. Commands by task

```bash
# Install all workspace dependencies
pnpm install

# Start API
pnpm dev:api

# Apply local schema changes
pnpm --dir apps/api db:push

# Start admin portal
pnpm dev:admin

# Start mobile Metro
pnpm --dir apps/mobile start --dev-client

# Build and install Android development app
pnpm --dir apps/mobile android

# Build and install iOS development app
pnpm --dir apps/mobile ios

# Backend tests and checks
pnpm --dir apps/api lint
pnpm --dir apps/api exec tsc --noEmit
pnpm --dir apps/api test

# Full project verification
pnpm verify
```

## 10. Debug checklist

| Problem | Check first |
| --- | --- |
| Mobile cannot reach API | API running; phone and Mac same Wi-Fi; `EXPO_PUBLIC_DEV_HOST` correct; restart Metro |
| Driver not visible | Driver active/online; accepted the order; location permission granted; order must be `READY` or `PICKED_UP` |
| Old restaurant/menu data | Verify owner/admin write completed; Redis credentials valid; refresh after invalidation |
| Push shows no token | Use installed development/release app, not Expo Go; allow notifications; verify API LAN URL |
| FCM delivery fails | API Firebase project/service account match `google-services.json`; restart API after environment change |
| Admin cannot sign in | User is active and role is `ADMIN`; use documented bootstrap only for first admin |
