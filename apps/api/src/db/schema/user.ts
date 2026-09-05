import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const userRoleEnum = pgEnum('user_role', [
  'CUSTOMER',
  'RESTAURANT_OWNER',
  'DRIVER',
  'ADMIN',
]);

export const accountStatusEnum = pgEnum('account_status', [
  'ACTIVE',
  'PENDING_APPROVAL',
  'SUSPENDED',
  'REJECTED',
]);

export const user = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    firstName: text('first_name').notNull(),

    lastName: text('last_name').notNull(),

    email: text('email').unique(),

    // Password is optional for accounts created through a verified identity
    // provider, such as Google Sign-In.
    password: text('password'),

    // Google's `sub` is a stable provider-issued identifier. Do not use an
    // email address as the provider identity because users can change emails.
    googleSubject: text('google_subject').unique(),

    role: userRoleEnum('role').notNull().default('CUSTOMER'),

    // Drivers and restaurant owners are created in PENDING_APPROVAL. Only an
    // administrator can activate, suspend, or reject an account.
    accountStatus: accountStatusEnum('account_status')
      .notNull()
      .default('ACTIVE'),
    accountStatusReason: text('account_status_reason'),
    accountStatusUpdatedAt: timestamp('account_status_updated_at')
      .defaultNow()
      .notNull(),

    pushToken: text('push_token'),

    isOnline: boolean('is_online').default(false).notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),

    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // SQL unique constraints on text are case-sensitive. This closes a race
    // where Foo@Example.com and foo@example.com could otherwise coexist.
    uniqueIndex('users_email_lower_unique_idx').on(sql`lower(${table.email})`),
  ],
);

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
