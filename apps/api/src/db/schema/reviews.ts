import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user } from './user';
import { restaurants } from './resturent';
import { orders } from './oders';

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => user.id),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    driverId: uuid('driver_id').references(() => user.id),
    restaurantRating: integer('restaurant_rating').notNull(),
    driverRating: integer('driver_rating'),
    comment: text('comment'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    // The service performs a friendly pre-check, but this index closes the
    // concurrent-request race and makes one review per order authoritative.
    uniqueIndex('reviews_order_id_unique_idx').on(table.orderId),
  ],
);

// Type exports
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
