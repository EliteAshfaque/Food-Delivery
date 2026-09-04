import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  doublePrecision,
} from 'drizzle-orm/pg-core';
import { menuItems } from './menu';
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
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  deliveryAddress: text('delivery_address').notNull(),
  deliveryLatitude: doublePrecision('delivery_latitude'),
  deliveryLongitude: doublePrecision('delivery_longitude'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
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

// Type exports
export type OrderStatus = typeof orderStatusEnum.enumValues;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;

export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
