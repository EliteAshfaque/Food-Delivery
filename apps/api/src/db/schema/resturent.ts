import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  numeric,
  uuid,
  boolean,
  doublePrecision,
} from 'drizzle-orm/pg-core';
import { user } from './user';
export const restaurants = pgTable('restaurants', {
  id: uuid('id').primaryKey().defaultRandom().notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  address: text('address').notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  cuisineType: text('cuisine_type'),
  isOpen: boolean('is_open').default(false).notNull(),
  rating: numeric('rating', { precision: 10, scale: 2 })
    .notNull()
    .default(sql`0`),
  createdAt: timestamp('created_at').defaultNow().notNull(),

  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export type Restaurant = typeof restaurants.$inferSelect;
export type NewRestaurant = typeof restaurants.$inferInsert;
