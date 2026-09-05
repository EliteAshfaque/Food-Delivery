import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  numeric,
  pgEnum,
  uuid,
  boolean,
  doublePrecision,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user } from './user';

export const restaurantModerationStatusEnum = pgEnum(
  'restaurant_moderation_status',
  ['PENDING_APPROVAL', 'APPROVED', 'SUSPENDED', 'REJECTED'],
);

export const restaurants = pgTable(
  'restaurants',
  {
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
    // APPROVED is the migration-safe default for existing restaurants. New
    // restaurants explicitly start in PENDING_APPROVAL in RestaurantsService.
    moderationStatus: restaurantModerationStatusEnum('moderation_status')
      .notNull()
      .default('APPROVED'),
    moderationNote: text('moderation_note'),
    moderatedAt: timestamp('moderated_at'),
    moderatedBy: uuid('moderated_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    rating: numeric('rating', { precision: 10, scale: 2 })
      .notNull()
      .default(sql`0`),
    createdAt: timestamp('created_at').defaultNow().notNull(),

    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // All owner-facing services resolve one restaurant by owner ID. Enforcing
    // the same invariant in PostgreSQL prevents ambiguous ownership on races.
    uniqueIndex('restaurants_owner_id_unique_idx').on(table.ownerId),
  ],
);
export type Restaurant = typeof restaurants.$inferSelect;
export type NewRestaurant = typeof restaurants.$inferInsert;
