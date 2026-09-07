import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { orders } from './oders';
import { restaurants } from './resturent';
import { user } from './user';

export const supportTicketStatusEnum = pgEnum('support_ticket_status', [
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
]);
export const driverDocumentStatusEnum = pgEnum('driver_document_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
]);
export const notificationDeliveryStatusEnum = pgEnum(
  'notification_delivery_status',
  ['QUEUED', 'SENT', 'FAILED', 'RETRYING'],
);
export const settlementStatusEnum = pgEnum('settlement_status', [
  'DRAFT',
  'APPROVED',
  'PAID',
  'VOID',
]);

/** Operational driver identity, vehicle and verification lifecycle. */
export const driverProfiles = pgTable('driver_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  vehicleType: text('vehicle_type'),
  vehiclePlate: text('vehicle_plate'),
  verifiedAt: timestamp('verified_at'),
  verifiedBy: uuid('verified_by').references(() => user.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const driverDocuments = pgTable(
  'driver_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    documentUrl: text('document_url').notNull(),
    expiresAt: timestamp('expires_at'),
    status: driverDocumentStatusEnum('status').notNull().default('PENDING'),
    reviewNote: text('review_note'),
    reviewedAt: timestamp('reviewed_at'),
    reviewedBy: uuid('reviewed_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('driver_documents_driver_idx').on(t.driverId, t.status)],
);

export const deliveryZones = pgTable('delivery_zones', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  polygon: jsonb('polygon')
    .$type<Array<{ latitude: number; longitude: number }>>()
    .notNull(),
  baseFee: numeric('base_fee', { precision: 10, scale: 2 })
    .notNull()
    .default('0'),
  feePerKm: numeric('fee_per_km', { precision: 10, scale: 2 })
    .notNull()
    .default('0'),
  minimumOrder: numeric('minimum_order', { precision: 10, scale: 2 })
    .notNull()
    .default('0'),
  etaMinutes: integer('eta_minutes').notNull().default(35),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const orderEvents = pgTable(
  'order_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('order_events_order_created_idx').on(t.orderId, t.createdAt)],
);

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id, {
    onDelete: 'set null',
  }),
  customerId: uuid('customer_id').references(() => user.id, {
    onDelete: 'set null',
  }),
  assignedAdminId: uuid('assigned_admin_id').references(() => user.id, {
    onDelete: 'set null',
  }),
  subject: text('subject').notNull(),
  status: supportTicketStatusEnum('status').notNull().default('OPEN'),
  priority: text('priority').notNull().default('NORMAL'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const supportTicketNotes = pgTable('support_ticket_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id')
    .notNull()
    .references(() => supportTickets.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => user.id),
  body: text('body').notNull(),
  isInternal: boolean('is_internal').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const customerFavorites = pgTable(
  'customer_favorites',
  {
    customerId: uuid('customer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.customerId, t.restaurantId] }),
    index('customer_favorites_customer_idx').on(t.customerId),
  ],
);

/** Per-day opening windows. A missing record means the restaurant is closed. */
export const restaurantSchedules = pgTable(
  'restaurant_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    opensAt: text('opens_at').notNull(),
    closesAt: text('closes_at').notNull(),
    isClosed: boolean('is_closed').notNull().default(false),
    prepMinutes: integer('prep_minutes').notNull().default(20),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('restaurant_schedules_day_unique_idx').on(
      t.restaurantId,
      t.dayOfWeek,
    ),
  ],
);

/** Normalized reasons keep cancellation and refund reporting consistent. */
export const cancellationReasons = pgTable(
  'cancellation_reasons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    label: text('label').notNull(),
    appliesTo: text('applies_to').notNull().default('ALL'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('cancellation_reasons_code_unique_idx').on(t.code)],
);

export const orderCancellations = pgTable('order_cancellations', {
  orderId: uuid('order_id')
    .primaryKey()
    .references(() => orders.id, { onDelete: 'cascade' }),
  reasonId: uuid('reason_id').references(() => cancellationReasons.id, {
    onDelete: 'set null',
  }),
  actorId: uuid('actor_id').references(() => user.id, { onDelete: 'set null' }),
  note: text('note'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/** Stored only as Stripe references; never stores card PAN/CVC data. */
export const savedPaymentMethods = pgTable(
  'saved_payment_methods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    stripeCustomerId: text('stripe_customer_id').notNull(),
    stripePaymentMethodId: text('stripe_payment_method_id').notNull(),
    brand: text('brand'),
    last4: text('last4'),
    expMonth: integer('exp_month'),
    expYear: integer('exp_year'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('saved_payment_methods_stripe_unique_idx').on(
      t.stripePaymentMethodId,
    ),
  ],
);

export const notificationTemplates = pgTable(
  'notification_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    titleTemplate: text('title_template').notNull(),
    bodyTemplate: text('body_template').notNull(),
    dataTemplate: jsonb('data_template').$type<Record<string, unknown>>(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('notification_templates_key_unique_idx').on(t.key)],
);

/** One row per delivery attempt for admin visibility and safe retry. */
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientId: uuid('recipient_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    orderId: uuid('order_id').references(() => orders.id, {
      onDelete: 'set null',
    }),
    channel: text('channel').notNull().default('PUSH'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    provider: text('provider').notNull().default('EXPO'),
    providerMessageId: text('provider_message_id'),
    status: notificationDeliveryStatusEnum('status')
      .notNull()
      .default('QUEUED'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at'),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('notification_deliveries_recipient_idx').on(
      t.recipientId,
      t.createdAt,
    ),
    index('notification_deliveries_status_idx').on(t.status, t.createdAt),
  ],
);

/** Finance keeps calculated settlements separate from payment-provider state. */
export const restaurantSettlements = pgTable(
  'restaurant_settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    grossAmount: numeric('gross_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    commissionRate: numeric('commission_rate', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    commissionAmount: numeric('commission_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    vatAmount: numeric('vat_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    netAmount: numeric('net_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    status: settlementStatusEnum('status').notNull().default('DRAFT'),
    paidAt: timestamp('paid_at'),
    reference: text('reference'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('restaurant_settlements_restaurant_idx').on(
      t.restaurantId,
      t.periodStart,
    ),
  ],
);

/** Account-scoped permissions allow Operations, Support, Finance and Marketing. */
export const adminAssignments = pgTable('admin_assignments', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('OPERATIONS'),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  updatedBy: uuid('updated_by').references(() => user.id, {
    onDelete: 'set null',
  }),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const loyaltyAccounts = pgTable(
  'loyalty_accounts',
  {
    customerId: uuid('customer_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    points: integer('points').notNull().default(0),
    referralCode: text('referral_code').notNull(),
    referredByCustomerId: uuid('referred_by_customer_id').references(
      () => user.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('loyalty_accounts_referral_code_unique_idx').on(t.referralCode),
  ],
);

export const loyaltyTransactions = pgTable(
  'loyalty_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').references(() => orders.id, {
      onDelete: 'set null',
    }),
    points: integer('points').notNull(),
    type: text('type').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('loyalty_transactions_customer_idx').on(t.customerId, t.createdAt),
  ],
);
