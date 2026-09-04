import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', [
  'CUSTOMER',
  'RESTAURANT_OWNER',
  'DRIVER',
]);

export const user = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),

  firstName: text('first_name').notNull(),

  lastName: text('last_name').notNull(),

  email: text('email').unique(),

  password: text('password').notNull(),

  role: userRoleEnum('role').notNull().default('CUSTOMER'),

  pushToken: text('push_token'),

  isOnline: boolean('is_online').default(false).notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),

  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
