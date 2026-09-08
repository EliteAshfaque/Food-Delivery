# Wasil App Flows and Local Testing

This guide explains the actual business flow and the commands to run it
locally. Use separate test accounts for Customer, Restaurant Owner, Driver,
and Admin.

## Start everything

Open four terminals from repository root:

```bash
# Terminal 1 — API
pnpm dev:api

# Terminal 2 — Admin portal
pnpm dev:admin

# Terminal 3 — Mobile Metro
pnpm --dir apps/mobile start --dev-client

# Terminal 4 — optional: Android build/install after native changes
pnpm --dir apps/mobile android
```

For physical phones, `apps/mobile/.env` must contain the Mac LAN address:

```env
EXPO_PUBLIC_DEV_HOST=192.168.x.x
```

Restart Metro after changing public mobile environment variables.

## Roles

| Role | Main responsibility | Main screen |
| --- | --- | --- |
| Customer | Browse, cart, address, payment, tracking, review | Customer tabs |
| Restaurant owner | Manage restaurant/menu, accept and prepare orders | Owner dashboard |
| Driver | Go online, accept delivery, share location, pick up, deliver | Driver active delivery |
| Admin | Approve accounts/restaurants, intervene in orders, operations | Admin web portal |

## Customer cart and checkout flow

```text
Restaurant list
  → Restaurant detail / menu
  → Add menu items to cart
  → Cart: choose saved address or one-time map pin
  → Validate offer (optional)
  → Review & pay
  → Stripe payment confirmation
  → Order tracking
```

Important rules:

- One cart belongs to one restaurant. Adding from another restaurant requires
  replacing the cart.
- A saved address contains a label, display address, and exact latitude/
  longitude pin.
- At checkout the selected address is copied into the order. Editing a saved
  address later does not alter an already placed order.
- A one-time address is not saved unless the customer chooses to save it.
- The API rechecks restaurant availability, item availability, pricing, offers,
  delivery details, and payment state. Never trust client totals alone.

### Test the cart

1. Sign in to the mobile app as a Customer.
2. Add a delivery address from **Profile → Saved addresses**. Search/select a
   Google place or drop a map pin, then save it.
3. Browse an approved/open restaurant, add item(s), and open Cart.
4. Choose the saved address, or select **Add a new address** and place a pin.
5. Optionally apply a valid offer code.
6. Continue to Review & pay and complete the configured Stripe test payment.
7. Confirm an order detail/tracking screen opens.

## Restaurant order flow

```text
Payment confirmed
  → CONFIRMED
  → Owner starts preparing
  → PREPARING
  → Owner marks ready
  → READY (driver dispatch begins)
```

### Test restaurant processing

1. Sign in as Restaurant Owner on a second mobile app/device.
2. Create a restaurant, set its exact map location, add categories and menu
   items, then make it open after Admin approval.
3. Place the customer order.
4. Refresh/open Owner dashboard and choose **Start preparing**.
5. Choose **Mark ready** only when food is ready for pickup.

Restaurant changes invalidate the public restaurant/menu cache immediately.

## Driver dispatch, pickup, and delivery flow

```text
READY
  → online driver receives offer
  → Driver accepts
  → Driver travels to restaurant / shares GPS
  → Driver confirms pickup
  → PICKED_UP
  → Driver travels to customer map pin
  → Driver marks delivered
  → DELIVERED
```

### Test driver tracking

1. Sign in as Driver on a third mobile app/device.
2. Turn **Online** on in Driver profile/home.
3. Restaurant marks the customer order ready.
4. Accept the driver offer.
5. Start location sharing in the active delivery screen and grant location
   permission.
6. Move the device (or use emulator location simulation). GPS sends roughly
   every 3 seconds / 10 metres; server broadcasts at most every 2 seconds.
7. Customer and owner maps should show a smoothly moving driver marker.
8. Confirm pickup, then mark delivered after handing over the order.

The driver sees restaurant pickup coordinates; the driver sees the exact order
delivery pin and delivery address. Live GPS is kept separately from orders in
short-lived Redis records and is deleted after a terminal order state.

## Customer tracking and push flow

```text
CONFIRMED → PREPARING → READY → PICKED_UP → DELIVERED
```

- The customer tracking stepper follows the order status above.
- Socket.IO updates the screen while the app is open.
- FCM/Expo push updates the app when it is backgrounded.
- Android lifecycle push uses one active-order notification per order, so the
  lock-screen/status-bar card is updated instead of stacking stale cards.

### Test push

1. Install the Wasil Android development build, not Expo Go.
2. Start Metro with `pnpm --dir apps/mobile start --dev-client`.
3. Sign in as the Customer and allow notifications.
4. Confirm Metro prints the registered push-token message.
5. Background/lock the device.
6. Progress the order from owner/driver screens. The customer receives status
   updates and the same notification card changes through the order flow.

## Saved-address flow

```text
Profile → Saved addresses → Add/Edit → label + exact map pin → Save
Cart → choose saved address → order snapshots address + coordinates
```

Use the map result rather than only typing an address. The selected Google
Place Details coordinate, current GPS coordinate, or dropped pin is the source
of truth for driver navigation.

## Admin flow

```text
Admin login
  → approve restaurant/owner if needed
  → monitor orders and drivers
  → intervene: cancel/refund/reassign/add support notes
  → send manual notification when required
```

### Test administration

1. Run `pnpm dev:admin` and open the Vite URL.
2. Sign in using an active ADMIN account.
3. Approve the Restaurant Owner and restaurant before customer discovery.
4. In Driver Operations, confirm the driver is active and online.
5. Use Order Operations only for support intervention; normal order state
   changes should be performed by restaurant/driver roles.

## Resetting test data

Do not delete production data to test a flow. Use a separate development
database. If you need a clean local test database, create a new empty database,
set its `DATABASE_URL`, then run:

```bash
pnpm --dir apps/api db:push
```

Create fresh Customer, Owner, Driver, and Admin test accounts in that database.
