import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import type {
  NeonDatabase,
  NeonTransaction,
} from 'drizzle-orm/neon-serverless';
import {
  AccountStatus,
  RestaurantModerationStatus,
  UserRole,
} from '@food-delivery/types';
import type { schema as RelationsSchema } from '../db/relations';
import * as schema from '../db/schema';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';

type OfferStatus = (typeof schema.offerStatusEnum.enumValues)[number];
type OfferRecord = typeof schema.offers.$inferSelect;
type OfferDatabase =
  | NeonDatabase<typeof RelationsSchema>
  | NeonTransaction<typeof RelationsSchema>;

const RESERVATION_MINUTES = 30;
const OCCUPYING_REDEMPTION_STATUSES = ['RESERVED', 'REDEEMED'] as const;

export type OfferApplication = {
  offer: OfferRecord;
  subtotalAmount: string;
  discountAmount: string;
  totalAmount: string;
};

function amount(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: number) {
  return roundMoney(value).toFixed(2);
}

function normaliseCode(code?: string | null) {
  const normalised = code?.trim().toUpperCase();
  return normalised || null;
}

function normaliseOptionalText(value?: string | null) {
  const normalised = value?.trim();
  return normalised || null;
}

@Injectable()
export class OffersService {
  constructor(
    @Inject('DB') private readonly db: NeonDatabase<typeof RelationsSchema>,
  ) {}

  async create(ownerId: string, dto: CreateOfferDto) {
    const restaurant = await this.getRestaurantForOwner(ownerId);
    const values = this.normaliseCreateValues(dto);

    this.assertOfferRules(values);
    await this.assertCodeAvailable(values.code);

    const now = new Date();
    const [offer] = await this.db
      .insert(schema.offers)
      .values({
        restaurantId: restaurant.id,
        ...values,
        status: this.getScheduleStatus(values.startsAt, values.endsAt, now),
      })
      .returning();

    return this.withEffectiveStatus(offer, now);
  }

  async findMine(ownerId: string) {
    const restaurant = await this.getRestaurantForOwner(ownerId);
    const now = new Date();
    const rows = await this.db
      .select()
      .from(schema.offers)
      .where(eq(schema.offers.restaurantId, restaurant.id))
      .orderBy(desc(schema.offers.createdAt));

    return rows.map((offer) => this.withEffectiveStatus(offer, now));
  }

  /** Customer-facing campaigns that can be used at this exact moment. */
  async findHotOffers() {
    const now = new Date();
    const rows = await this.db
      .select({
        offer: schema.offers,
        restaurant: {
          id: schema.restaurants.id,
          name: schema.restaurants.name,
          imageUrl: schema.restaurants.imageUrl,
          cuisineType: schema.restaurants.cuisineType,
          rating: schema.restaurants.rating,
        },
      })
      .from(schema.offers)
      .innerJoin(
        schema.restaurants,
        eq(schema.offers.restaurantId, schema.restaurants.id),
      )
      .innerJoin(schema.user, eq(schema.restaurants.ownerId, schema.user.id))
      .where(
        and(
          eq(schema.restaurants.isOpen, true),
          eq(
            schema.restaurants.moderationStatus,
            RestaurantModerationStatus.APPROVED,
          ),
          eq(schema.user.role, UserRole.RESTAURANT_OWNER),
          eq(schema.user.accountStatus, AccountStatus.ACTIVE),
          inArray(schema.offers.status, ['ACTIVE', 'SCHEDULED']),
          lte(schema.offers.startsAt, now),
          gt(schema.offers.endsAt, now),
        ),
      )
      .orderBy(
        desc(schema.offers.isFeatured),
        asc(schema.offers.sortOrder),
        desc(schema.offers.discountValue),
      );

    return rows.map(({ offer, restaurant }) => ({
      ...this.withEffectiveStatus(offer, now),
      restaurant,
    }));
  }

  async findByRestaurant(restaurantId: string) {
    const [restaurant] = await this.db
      .select({
        id: schema.restaurants.id,
        isOpen: schema.restaurants.isOpen,
        moderationStatus: schema.restaurants.moderationStatus,
        ownerAccountStatus: schema.user.accountStatus,
        ownerRole: schema.user.role,
      })
      .from(schema.restaurants)
      .innerJoin(schema.user, eq(schema.restaurants.ownerId, schema.user.id))
      .where(eq(schema.restaurants.id, restaurantId));

    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (
      !restaurant.isOpen ||
      restaurant.moderationStatus !== RestaurantModerationStatus.APPROVED ||
      restaurant.ownerAccountStatus !== AccountStatus.ACTIVE ||
      restaurant.ownerRole !== UserRole.RESTAURANT_OWNER
    ) {
      return [];
    }

    const now = new Date();
    const rows = await this.db
      .select()
      .from(schema.offers)
      .where(
        and(
          eq(schema.offers.restaurantId, restaurantId),
          inArray(schema.offers.status, ['ACTIVE', 'SCHEDULED']),
          lte(schema.offers.startsAt, now),
          gt(schema.offers.endsAt, now),
        ),
      )
      .orderBy(
        desc(schema.offers.isFeatured),
        asc(schema.offers.sortOrder),
        desc(schema.offers.discountValue),
      );

    return rows.map((offer) => this.withEffectiveStatus(offer, now));
  }

  async update(ownerId: string, offerId: string, dto: UpdateOfferDto) {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException(
        'Provide at least one offer field to update',
      );
    }

    const offer = await this.getOfferForOwner(ownerId, offerId);
    const values = this.normaliseUpdateValues(offer, dto);

    this.assertOfferRules(values);
    await this.assertCodeAvailable(values.code, offer.id);

    const now = new Date();
    const status =
      offer.status === 'PAUSED' ||
      offer.status === 'ARCHIVED' ||
      offer.status === 'DRAFT'
        ? offer.status
        : this.getScheduleStatus(values.startsAt, values.endsAt, now);

    const [updated] = await this.db
      .update(schema.offers)
      .set({
        ...values,
        status,
        updatedAt: now,
      })
      .where(eq(schema.offers.id, offer.id))
      .returning();

    return this.withEffectiveStatus(updated, now);
  }

  async changeStatus(
    ownerId: string,
    offerId: string,
    requestedStatus: 'PAUSED' | 'ACTIVE' | 'ARCHIVED',
  ) {
    const offer = await this.getOfferForOwner(ownerId, offerId);
    const now = new Date();

    if (requestedStatus === 'ACTIVE' && offer.endsAt <= now) {
      throw new BadRequestException('An expired offer cannot be resumed');
    }

    const status: OfferStatus =
      requestedStatus === 'ACTIVE'
        ? this.getScheduleStatus(offer.startsAt, offer.endsAt, now)
        : requestedStatus;

    const [updated] = await this.db
      .update(schema.offers)
      .set({ status, updatedAt: now })
      .where(eq(schema.offers.id, offer.id))
      .returning();

    return this.withEffectiveStatus(updated, now);
  }

  /**
   * Returns a server-calculated quote. This is deliberately reused by order
   * creation; clients cannot submit a discount amount or trust a UI quote.
   */
  async validateForCheckout(
    customerId: string,
    restaurantId: string,
    subtotal: number,
    code?: string,
    database: OfferDatabase = this.db,
  ): Promise<OfferApplication | null> {
    if (!Number.isFinite(subtotal) || subtotal <= 0) {
      throw new BadRequestException('Order subtotal must be greater than zero');
    }

    const [restaurant] = await database
      .select({
        id: schema.restaurants.id,
        isOpen: schema.restaurants.isOpen,
        moderationStatus: schema.restaurants.moderationStatus,
        ownerAccountStatus: schema.user.accountStatus,
        ownerRole: schema.user.role,
      })
      .from(schema.restaurants)
      .innerJoin(schema.user, eq(schema.restaurants.ownerId, schema.user.id))
      .where(eq(schema.restaurants.id, restaurantId));
    if (
      !restaurant ||
      !restaurant.isOpen ||
      restaurant.moderationStatus !== RestaurantModerationStatus.APPROVED ||
      restaurant.ownerAccountStatus !== AccountStatus.ACTIVE ||
      restaurant.ownerRole !== UserRole.RESTAURANT_OWNER
    ) {
      throw new BadRequestException('This restaurant is not accepting orders');
    }

    await this.releaseExpiredReservations(database);

    const normalisedCode = normaliseCode(code);
    if (normalisedCode) {
      const [offer] = await database
        .select()
        .from(schema.offers)
        // ILIKE treats _ and % as wildcards. Promotion codes permit _, so an
        // exact case-folded comparison is required here.
        .where(
          sql`lower(${schema.offers.code}) = ${normalisedCode.toLowerCase()}`,
        );

      if (!offer || offer.restaurantId !== restaurantId) {
        throw new BadRequestException(
          'Offer code is invalid for this restaurant',
        );
      }

      await this.assertEligibleForCustomer(
        offer,
        customerId,
        subtotal,
        database,
      );
      return this.applyOffer(offer, subtotal);
    }

    const now = new Date();
    const candidates = await database
      .select()
      .from(schema.offers)
      .where(
        and(
          eq(schema.offers.restaurantId, restaurantId),
          eq(schema.offers.autoApply, true),
          inArray(schema.offers.status, ['ACTIVE', 'SCHEDULED']),
          lte(schema.offers.startsAt, now),
          gt(schema.offers.endsAt, now),
        ),
      );

    const eligible: OfferApplication[] = [];
    for (const offer of candidates) {
      try {
        await this.assertEligibleForCustomer(
          offer,
          customerId,
          subtotal,
          database,
        );
        eligible.push(this.applyOffer(offer, subtotal));
      } catch (error) {
        // An automatic campaign that does not meet a customer's threshold is
        // simply skipped. Explicit codes return their useful validation error.
        if (!(error instanceof BadRequestException)) throw error;
      }
    }

    eligible.sort(
      (a, b) => amount(b.discountAmount) - amount(a.discountAmount),
    );
    return eligible[0] ?? null;
  }

  /**
   * Atomically reserves a campaign slot while the order is still pending. It
   * must run in the same database transaction that inserts the order.
   */
  async reserveForOrder(
    input: {
      offerId: string;
      orderId: string;
      customerId: string;
      discountAmount: string;
    },
    database: OfferDatabase = this.db,
  ) {
    await this.releaseExpiredReservations(database);

    // This method is called from the order transaction. Serialising checks for
    // a single offer/customer pair closes the read-count-insert race that
    // otherwise allows two concurrent checkouts to exceed perCustomerLimit.
    await database.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${input.offerId}:${input.customerId}`}))`,
    );

    const [offer] = await database
      .select()
      .from(schema.offers)
      .where(eq(schema.offers.id, input.offerId));

    if (!offer || !this.isCurrentlyUsable(offer, new Date())) {
      throw new BadRequestException('This offer is no longer available');
    }

    const customerUsage = await this.getCustomerUsage(
      offer.id,
      input.customerId,
      database,
    );
    if (customerUsage >= offer.perCustomerLimit) {
      throw new BadRequestException(
        'You have already used this offer the maximum number of times',
      );
    }

    const now = new Date();
    const [reservedOffer] = await database
      .update(schema.offers)
      .set({
        usageCount: sql`${schema.offers.usageCount} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.offers.id, offer.id),
          or(
            isNull(schema.offers.usageLimit),
            lt(schema.offers.usageCount, schema.offers.usageLimit),
          ),
        ),
      )
      .returning();

    if (!reservedOffer) {
      throw new BadRequestException('This offer has reached its usage limit');
    }

    const expiresAt = new Date(now.getTime() + RESERVATION_MINUTES * 60_000);
    await database.insert(schema.offerRedemptions).values({
      offerId: offer.id,
      orderId: input.orderId,
      customerId: input.customerId,
      discountAmount: input.discountAmount,
      status: 'RESERVED',
      expiresAt,
    });

    return reservedOffer;
  }

  /**
   * Claims an offer reservation during payment confirmation. `INVALID` means
   * it was released or expired, so the payment must be refunded rather than
   * confirming a discounted order.
   */
  async confirmReservationForOrder(
    orderId: string,
    database: OfferDatabase = this.db,
  ): Promise<'NO_RESERVATION' | 'REDEEMED' | 'ALREADY_REDEEMED' | 'INVALID'> {
    const now = new Date();
    const [redemption] = await database
      .select()
      .from(schema.offerRedemptions)
      .where(eq(schema.offerRedemptions.orderId, orderId));

    if (!redemption) return 'NO_RESERVATION';
    if (redemption.status === 'REDEEMED') return 'ALREADY_REDEEMED';
    if (redemption.status === 'RELEASED' || redemption.expiresAt <= now) {
      return 'INVALID';
    }

    const [updated] = await database
      .update(schema.offerRedemptions)
      .set({
        status: 'REDEEMED',
        redeemedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.offerRedemptions.id, redemption.id),
          eq(schema.offerRedemptions.status, 'RESERVED'),
          gt(schema.offerRedemptions.expiresAt, now),
        ),
      )
      .returning();

    return updated ? 'REDEEMED' : 'INVALID';
  }

  /** Prevents a customer from paying with an offer reservation that has expired. */
  async ensureReservationIsValidForOrder(orderId: string) {
    await this.releaseExpiredReservations();

    const [redemption] = await this.db
      .select({
        status: schema.offerRedemptions.status,
        expiresAt: schema.offerRedemptions.expiresAt,
      })
      .from(schema.offerRedemptions)
      .where(eq(schema.offerRedemptions.orderId, orderId));

    if (
      redemption?.status === 'RELEASED' ||
      (redemption?.status === 'RESERVED' && redemption.expiresAt <= new Date())
    ) {
      throw new BadRequestException(
        'Your offer reservation expired. Please place the order again to refresh the total.',
      );
    }
  }

  /** Releases campaign capacity when an unpaid or refunded order is cancelled. */
  async releaseReservationForOrder(
    orderId: string,
    options: { includeRedeemed?: boolean } = {},
  ) {
    return this.releaseReservationForOrderUsing(
      this.db,
      orderId,
      options.includeRedeemed ?? false,
    );
  }

  /** Opportunistic cleanup keeps abandoned, unpaid checkouts from consuming capacity forever. */
  async releaseExpiredReservations(database: OfferDatabase = this.db) {
    const now = new Date();
    const expired = await database
      .select({
        id: schema.offerRedemptions.id,
        orderId: schema.offerRedemptions.orderId,
      })
      .from(schema.offerRedemptions)
      .where(
        and(
          eq(schema.offerRedemptions.status, 'RESERVED'),
          lt(schema.offerRedemptions.expiresAt, now),
        ),
      )
      .limit(100);

    let released = 0;
    for (const redemption of expired) {
      if (
        await this.releaseReservationForOrderUsing(database, redemption.orderId)
      ) {
        released += 1;
      }
    }
    return released;
  }

  private async releaseReservationForOrderUsing(
    database: OfferDatabase,
    orderId: string,
    includeRedeemed = false,
  ) {
    const [redemption] = await database
      .select()
      .from(schema.offerRedemptions)
      .where(eq(schema.offerRedemptions.orderId, orderId));

    const releasableStatuses: Array<'RESERVED' | 'REDEEMED'> = includeRedeemed
      ? ['RESERVED', 'REDEEMED']
      : ['RESERVED'];
    if (
      !redemption ||
      (redemption.status !== 'RESERVED' &&
        (!includeRedeemed || redemption.status !== 'REDEEMED'))
    ) {
      return false;
    }

    const now = new Date();
    const [released] = await database
      .update(schema.offerRedemptions)
      .set({
        status: 'RELEASED',
        releasedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.offerRedemptions.id, redemption.id),
          inArray(schema.offerRedemptions.status, releasableStatuses),
        ),
      )
      .returning();

    if (!released) return false;

    await database
      .update(schema.offers)
      .set({
        usageCount: sql`greatest(${schema.offers.usageCount} - 1, 0)`,
        updatedAt: now,
      })
      .where(eq(schema.offers.id, released.offerId));

    return true;
  }

  private async getRestaurantForOwner(ownerId: string) {
    const [restaurant] = await this.db
      .select()
      .from(schema.restaurants)
      .where(eq(schema.restaurants.ownerId, ownerId));

    if (!restaurant) throw new NotFoundException('Create a restaurant first');
    return restaurant;
  }

  private async getOfferForOwner(ownerId: string, offerId: string) {
    const offer = await this.getOfferById(offerId);
    const restaurant = await this.getRestaurantForOwner(ownerId);

    if (offer.restaurantId !== restaurant.id) {
      // Keep the resource opaque to another owner.
      throw new NotFoundException('Offer not found');
    }
    return offer;
  }

  private async getOfferById(offerId: string) {
    const [offer] = await this.db
      .select()
      .from(schema.offers)
      .where(eq(schema.offers.id, offerId));
    if (!offer) throw new NotFoundException('Offer not found');
    return offer;
  }

  private normaliseCreateValues(dto: CreateOfferDto) {
    return {
      title: dto.title.trim(),
      description: normaliseOptionalText(dto.description),
      imageUrl: normaliseOptionalText(dto.imageUrl),
      code: normaliseCode(dto.code),
      discountType: dto.discountType,
      discountValue: money(dto.discountValue),
      minimumOrderAmount: money(dto.minimumOrderAmount ?? 0),
      maximumDiscountAmount:
        dto.maximumDiscountAmount == null
          ? null
          : money(dto.maximumDiscountAmount),
      usageLimit: dto.usageLimit ?? null,
      perCustomerLimit: dto.perCustomerLimit ?? 1,
      autoApply: dto.autoApply ?? false,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
    };
  }

  private normaliseUpdateValues(offer: OfferRecord, dto: UpdateOfferDto) {
    return {
      title: dto.title === undefined ? offer.title : dto.title.trim(),
      description:
        dto.description === undefined
          ? offer.description
          : normaliseOptionalText(dto.description),
      imageUrl:
        dto.imageUrl === undefined
          ? offer.imageUrl
          : normaliseOptionalText(dto.imageUrl),
      code: dto.code === undefined ? offer.code : normaliseCode(dto.code),
      discountType: dto.discountType ?? offer.discountType,
      discountValue:
        dto.discountValue === undefined
          ? offer.discountValue
          : money(dto.discountValue),
      minimumOrderAmount:
        dto.minimumOrderAmount === undefined
          ? offer.minimumOrderAmount
          : money(dto.minimumOrderAmount),
      maximumDiscountAmount:
        dto.maximumDiscountAmount === undefined
          ? offer.maximumDiscountAmount
          : dto.maximumDiscountAmount === null
            ? null
            : money(dto.maximumDiscountAmount),
      usageLimit:
        dto.usageLimit === undefined ? offer.usageLimit : dto.usageLimit,
      perCustomerLimit: dto.perCustomerLimit ?? offer.perCustomerLimit,
      autoApply: dto.autoApply ?? offer.autoApply,
      startsAt: dto.startsAt ?? offer.startsAt,
      endsAt: dto.endsAt ?? offer.endsAt,
    };
  }

  private assertOfferRules(values: {
    title: string;
    code: string | null;
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
    discountValue: string;
    minimumOrderAmount: string;
    maximumDiscountAmount: string | null;
    usageLimit: number | null;
    perCustomerLimit: number;
    autoApply: boolean;
    startsAt: Date;
    endsAt: Date;
  }) {
    if (!values.title) throw new BadRequestException('Offer title is required');
    if (
      !(values.startsAt instanceof Date) ||
      Number.isNaN(values.startsAt.getTime())
    ) {
      throw new BadRequestException('Offer start date is invalid');
    }
    if (
      !(values.endsAt instanceof Date) ||
      Number.isNaN(values.endsAt.getTime())
    ) {
      throw new BadRequestException('Offer end date is invalid');
    }
    if (values.endsAt <= values.startsAt) {
      throw new BadRequestException(
        'Offer end time must be after its start time',
      );
    }
    if (
      values.discountType === 'PERCENTAGE' &&
      amount(values.discountValue) > 100
    ) {
      throw new BadRequestException('Percentage discount cannot exceed 100%');
    }
    if (
      values.discountType === 'FIXED_AMOUNT' &&
      values.maximumDiscountAmount !== null
    ) {
      throw new BadRequestException(
        'A maximum discount amount is only valid for percentage offers',
      );
    }
    if (!values.code && !values.autoApply) {
      throw new BadRequestException(
        'An offer must have a code or be configured for automatic application',
      );
    }
    if (values.code && values.autoApply) {
      throw new BadRequestException(
        'Code offers cannot also be configured for automatic application',
      );
    }
  }

  private async assertCodeAvailable(
    code: string | null,
    currentOfferId?: string,
  ) {
    if (!code) return;

    const [existing] = await this.db
      .select({ id: schema.offers.id })
      .from(schema.offers)
      .where(sql`lower(${schema.offers.code}) = ${code.toLowerCase()}`);

    if (existing && existing.id !== currentOfferId) {
      throw new ConflictException('This offer code is already in use');
    }
  }

  private getScheduleStatus(
    startsAt: Date,
    endsAt: Date,
    now: Date,
  ): OfferStatus {
    if (endsAt <= now) return 'EXPIRED';
    if (startsAt > now) return 'SCHEDULED';
    return 'ACTIVE';
  }

  private getEffectiveStatus(offer: OfferRecord, now: Date): OfferStatus {
    if (
      offer.status === 'PAUSED' ||
      offer.status === 'ARCHIVED' ||
      offer.status === 'DRAFT'
    ) {
      return offer.status;
    }
    return this.getScheduleStatus(offer.startsAt, offer.endsAt, now);
  }

  private withEffectiveStatus(offer: OfferRecord, now: Date) {
    return {
      ...offer,
      effectiveStatus: this.getEffectiveStatus(offer, now),
    };
  }

  private isCurrentlyUsable(offer: OfferRecord, now: Date) {
    return this.getEffectiveStatus(offer, now) === 'ACTIVE';
  }

  private async assertEligibleForCustomer(
    offer: OfferRecord,
    customerId: string,
    subtotal: number,
    database: OfferDatabase,
  ) {
    if (!this.isCurrentlyUsable(offer, new Date())) {
      throw new BadRequestException('This offer is not currently active');
    }
    if (subtotal < amount(offer.minimumOrderAmount)) {
      throw new BadRequestException(
        `This offer requires a minimum order of ${money(amount(offer.minimumOrderAmount))}`,
      );
    }
    if (offer.usageLimit !== null && offer.usageCount >= offer.usageLimit) {
      throw new BadRequestException('This offer has reached its usage limit');
    }

    const customerUsage = await this.getCustomerUsage(
      offer.id,
      customerId,
      database,
    );
    if (customerUsage >= offer.perCustomerLimit) {
      throw new BadRequestException(
        'You have already used this offer the maximum number of times',
      );
    }
  }

  private async getCustomerUsage(
    offerId: string,
    customerId: string,
    database: OfferDatabase,
  ) {
    const [result] = await database
      .select({ total: count() })
      .from(schema.offerRedemptions)
      .where(
        and(
          eq(schema.offerRedemptions.offerId, offerId),
          eq(schema.offerRedemptions.customerId, customerId),
          inArray(
            schema.offerRedemptions.status,
            OCCUPYING_REDEMPTION_STATUSES,
          ),
        ),
      );
    return Number(result?.total ?? 0);
  }

  private applyOffer(offer: OfferRecord, subtotal: number): OfferApplication {
    let discount =
      offer.discountType === 'PERCENTAGE'
        ? (subtotal * amount(offer.discountValue)) / 100
        : amount(offer.discountValue);

    if (offer.maximumDiscountAmount !== null) {
      discount = Math.min(discount, amount(offer.maximumDiscountAmount));
    }

    discount = roundMoney(Math.min(discount, subtotal));
    const total = roundMoney(subtotal - discount);

    // Stripe cannot create a zero-value PaymentIntent. Complimentary orders
    // need a separate fulfilment/payment flow before 100%-off offers ship.
    if (total <= 0) {
      throw new BadRequestException(
        'This offer cannot be used because complimentary orders are not supported yet',
      );
    }

    return {
      offer,
      subtotalAmount: money(subtotal),
      discountAmount: money(discount),
      totalAmount: money(total),
    };
  }
}
