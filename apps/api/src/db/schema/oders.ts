import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  doublePrecision,
  index,
} from 'drizzle-orm/pg-core';
import { menuItems } from './menu';
import { offers, offerRedemptionStatusEnum } from './offers';
import { restaurants } from './resturent';
import { user } from './user';

export const orderStatusEnum = pgEnum('order_status', [
  'PENDING', // placed, waiting for payment
  'CONFIRMED', // payment confirmed by stripe webhook
  'PREPARING', // restaurant accepted and is cooking
  'READY', // ready for driver pickup
  'PICKED_UP', // driver has picked up the order
  'DELIVERED', // order delivered to customer
  'CANCELLED', // cancelled at any stage
]);

// Orders Table
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => user.id),
  restaurantId: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id),
  driverId: uuid('driver_id').references(() => user.id),
  status: orderStatusEnum('status').notNull().default('PENDING'),
  /** Server-calculated menu subtotal before offer discounts. */
  subtotalAmount: numeric('subtotal_amount', { precision: 10, scale: 2 })
    .notNull()
    .default('0'),
  /** Server-calculated promotion discount. Never accepted from the client. */
  discountAmount: numeric('discount_amount', { precision: 10, scale: 2 })
    .notNull()
    .default('0'),
  offerId: uuid('offer_id').references(() => offers.id, {
    onDelete: 'set null',
  }),
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  deliveryAddress: text('delivery_address').notNull(),
  deliveryLatitude: doublePrecision('delivery_latitude'),
  deliveryLongitude: doublePrecision('delivery_longitude'),
  /** A single stable Stripe PaymentIntent prevents duplicate payable attempts. */
  stripePaymentIntentId: text('stripe_payment_intent_id').unique(),
  /** Set as soon as a refund is requested; never create a second refund. */
  stripeRefundId: text('stripe_refund_id').unique(),
  /** Holds normal workflow transitions while cancellation/refund is settling. */
  cancellationRequestedAt: timestamp('cancellation_requested_at'),
  cancellationReason: text('cancellation_reason'),
  cancelledAt: timestamp('cancelled_at'),
  refundedAt: timestamp('refunded_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Order Items Table (junction table for orders and menu items)
export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  menuItemId: uuid('menu_item_id')
    .notNull()
    .references(() => menuItems.id),
  quantity: numeric('quantity').notNull().default('1'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Keeps an auditable connection between an order and the campaign capacity it
 * consumed. `RESERVED` rows protect a limited offer while a payment is pending;
 * webhook success turns them into `REDEEMED` rows and cancellation releases it.
 */
export const offerRedemptions = pgTable(
  'offer_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' })
      .unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => user.id),
    discountAmount: numeric('discount_amount', {
      precision: 10,
      scale: 2,
    }).notNull(),
    status: offerRedemptionStatusEnum('status').notNull().default('RESERVED'),
    /** A pending checkout only holds campaign capacity for a short time. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('offer_redemptions_offer_customer_idx').on(
      table.offerId,
      table.customerId,
      table.status,
    ),
    index('offer_redemptions_expiry_idx').on(table.status, table.expiresAt),
  ],
);

// Type exports
export type OrderStatus = typeof orderStatusEnum.enumValues;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type OfferRedemption = typeof offerRedemptions.$inferSelect;
