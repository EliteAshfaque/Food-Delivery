import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { restaurants } from './resturent';

/**
 * Stored campaign state. `SCHEDULED` and `EXPIRED` are also derived from the
 * configured dates when an offer is read, so a campaign cannot become usable
 * early simply because a client cached a stale status.
 */
export const offerStatusEnum = pgEnum('offer_status', [
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'PAUSED',
  'EXPIRED',
  'ARCHIVED',
]);

export const offerDiscountTypeEnum = pgEnum('offer_discount_type', [
  'PERCENTAGE',
  'FIXED_AMOUNT',
]);

/**
 * A reservation is created with the pending order. This avoids a limited-use
 * promotion being oversold between checkout and Stripe's asynchronous webhook.
 */
export const offerRedemptionStatusEnum = pgEnum('offer_redemption_status', [
  'RESERVED',
  'REDEEMED',
  'RELEASED',
]);

export const offers = pgTable(
  'offers',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    /** A null code means this is an automatically applied campaign. */
    code: text('code'),
    discountType: offerDiscountTypeEnum('discount_type').notNull(),
    discountValue: numeric('discount_value', {
      precision: 10,
      scale: 2,
    }).notNull(),
    minimumOrderAmount: numeric('minimum_order_amount', {
      precision: 10,
      scale: 2,
    })
      .notNull()
      .default(sql`0`),
    /** Caps a percentage discount. It is deliberately null for fixed offers. */
    maximumDiscountAmount: numeric('maximum_discount_amount', {
      precision: 10,
      scale: 2,
    }),
    usageLimit: integer('usage_limit'),
    usageCount: integer('usage_count').notNull().default(0),
    perCustomerLimit: integer('per_customer_limit').notNull().default(1),
    autoApply: boolean('auto_apply').notNull().default(false),
    /** Reserved for future admin curation; restaurant owners cannot set this. */
    isFeatured: boolean('is_featured').notNull().default(false),
    /** Admin-controlled display order within the featured Hot Offers rail. */
    sortOrder: integer('sort_order').notNull().default(0),
    status: offerStatusEnum('status').notNull().default('DRAFT'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('offers_restaurant_status_idx').on(table.restaurantId, table.status),
    index('offers_public_listing_idx').on(
      table.status,
      table.startsAt,
      table.endsAt,
    ),
    // PostgreSQL unique indexes allow multiple NULL values, which is exactly
    // what we need for code-less automatic offers.
    uniqueIndex('offers_code_lower_unique_idx').on(sql`lower(${table.code})`),
    check('offers_discount_value_positive', sql`${table.discountValue} > 0`),
    check(
      'offers_minimum_order_amount_non_negative',
      sql`${table.minimumOrderAmount} >= 0`,
    ),
    check(
      'offers_maximum_discount_amount_positive',
      sql`${table.maximumDiscountAmount} is null or ${table.maximumDiscountAmount} > 0`,
    ),
    check('offers_valid_date_range', sql`${table.endsAt} > ${table.startsAt}`),
    check(
      'offers_usage_limit_positive',
      sql`${table.usageLimit} is null or ${table.usageLimit} > 0`,
    ),
    check(
      'offers_per_customer_limit_positive',
      sql`${table.perCustomerLimit} > 0`,
    ),
  ],
);

export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;
