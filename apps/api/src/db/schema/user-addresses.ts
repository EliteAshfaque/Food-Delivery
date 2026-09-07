import {
  boolean,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './user';

/**
 * Saved delivery destinations for customers (Amazon/Noon-style address book).
 * Orders still store a snapshot of the chosen address on the order row.
 */
export const userAddresses = pgTable(
  'user_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Short label such as Home, Work, or Other. */
    label: text('label').notNull(),
    addressLine: text('address_line').notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('user_addresses_user_id_idx').on(table.userId),
  ],
);

export type UserAddress = typeof userAddresses.$inferSelect;
export type NewUserAddress = typeof userAddresses.$inferInsert;
