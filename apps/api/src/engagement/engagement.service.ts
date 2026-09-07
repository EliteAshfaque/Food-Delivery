import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { schema } from '../db/relations';
import * as tables from '../db/schema';
import { OrdersService } from '../orders/oder.service';
import { PaymentsService } from '../payments/payment.service';

@Injectable()
export class EngagementService {
  constructor(
    @Inject('DB') private readonly db: NeonDatabase<typeof schema>,
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async listFavorites(customerId: string) {
    return this.db
      .select({
        favorite: tables.customerFavorites,
        restaurant: tables.restaurants,
      })
      .from(tables.customerFavorites)
      .innerJoin(
        tables.restaurants,
        eq(tables.customerFavorites.restaurantId, tables.restaurants.id),
      )
      .where(eq(tables.customerFavorites.customerId, customerId))
      .orderBy(desc(tables.customerFavorites.createdAt));
  }

  async addFavorite(customerId: string, restaurantId: string) {
    const [restaurant] = await this.db
      .select({ id: tables.restaurants.id })
      .from(tables.restaurants)
      .where(eq(tables.restaurants.id, restaurantId));
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    try {
      const [favorite] = await this.db
        .insert(tables.customerFavorites)
        .values({ customerId, restaurantId })
        .returning();
      return favorite;
    } catch {
      throw new ConflictException('Restaurant is already in favorites');
    }
  }

  async removeFavorite(customerId: string, restaurantId: string) {
    await this.db
      .delete(tables.customerFavorites)
      .where(
        and(
          eq(tables.customerFavorites.customerId, customerId),
          eq(tables.customerFavorites.restaurantId, restaurantId),
        ),
      );
    return { removed: true };
  }

  async reorder(customerId: string, orderId: string, deliveryAddress?: string) {
    const [order] = await this.db
      .select()
      .from(tables.orders)
      .where(
        and(
          eq(tables.orders.id, orderId),
          eq(tables.orders.customerId, customerId),
        ),
      );
    if (!order) throw new NotFoundException('Order not found');
    const items = await this.db
      .select()
      .from(tables.orderItems)
      .where(eq(tables.orderItems.orderId, orderId));
    if (!items.length)
      throw new BadRequestException('This order has no items to reorder');
    if (order.deliveryLatitude == null || order.deliveryLongitude == null) {
      throw new BadRequestException(
        'Choose a delivery location before reordering this older order',
      );
    }
    return this.ordersService.create(customerId, {
      restaurantId: order.restaurantId,
      deliveryAddress: deliveryAddress?.trim() || order.deliveryAddress,
      deliveryLatitude: order.deliveryLatitude,
      deliveryLongitude: order.deliveryLongitude,
      items: items.map((item) => ({
        menuItemId: item.menuItemId,
        quantity: Number(item.quantity),
      })),
    });
  }

  async loyalty(customerId: string) {
    const [account] = await this.db
      .select()
      .from(tables.loyaltyAccounts)
      .where(eq(tables.loyaltyAccounts.customerId, customerId));
    if (account)
      return { account, transactions: await this.transactions(customerId) };
    const referralCode = await this.createReferralCode();
    const [created] = await this.db
      .insert(tables.loyaltyAccounts)
      .values({ customerId, referralCode })
      .returning();
    return { account: created, transactions: [] };
  }

  async claimReferral(customerId: string, code: string) {
    const normalized = code.trim().toUpperCase();
    const data = await this.loyalty(customerId);
    if (data.account.referredByCustomerId)
      throw new ConflictException('A referral has already been claimed');
    if (data.account.referralCode === normalized)
      throw new BadRequestException('You cannot use your own referral code');
    const [referrer] = await this.db
      .select()
      .from(tables.loyaltyAccounts)
      .where(eq(tables.loyaltyAccounts.referralCode, normalized));
    if (!referrer) throw new NotFoundException('Referral code not found');
    await this.db.transaction(async (tx) => {
      await tx
        .update(tables.loyaltyAccounts)
        .set({
          referredByCustomerId: referrer.customerId,
          points: data.account.points + 100,
          updatedAt: new Date(),
        })
        .where(eq(tables.loyaltyAccounts.customerId, customerId));
      await tx
        .update(tables.loyaltyAccounts)
        .set({ points: referrer.points + 100, updatedAt: new Date() })
        .where(eq(tables.loyaltyAccounts.customerId, referrer.customerId));
      await tx.insert(tables.loyaltyTransactions).values([
        {
          customerId,
          points: 100,
          type: 'REFERRAL_CLAIMED',
          note: `Referral ${normalized}`,
        },
        {
          customerId: referrer.customerId,
          points: 100,
          type: 'REFERRAL_REWARDED',
          note: 'Referral completed',
        },
      ]);
    });
    return this.loyalty(customerId);
  }

  async paymentMethods(customerId: string) {
    return this.db
      .select({
        id: tables.savedPaymentMethods.id,
        brand: tables.savedPaymentMethods.brand,
        last4: tables.savedPaymentMethods.last4,
        expMonth: tables.savedPaymentMethods.expMonth,
        expYear: tables.savedPaymentMethods.expYear,
        isDefault: tables.savedPaymentMethods.isDefault,
        createdAt: tables.savedPaymentMethods.createdAt,
      })
      .from(tables.savedPaymentMethods)
      .where(eq(tables.savedPaymentMethods.customerId, customerId))
      .orderBy(
        desc(tables.savedPaymentMethods.isDefault),
        desc(tables.savedPaymentMethods.createdAt),
      );
  }

  async createPaymentSetup(customerId: string) {
    const [saved] = await this.db
      .select({ stripeCustomerId: tables.savedPaymentMethods.stripeCustomerId })
      .from(tables.savedPaymentMethods)
      .where(eq(tables.savedPaymentMethods.customerId, customerId))
      .limit(1);
    return this.paymentsService.createSetupIntent(
      customerId,
      saved?.stripeCustomerId,
    );
  }

  async savePaymentMethod(
    customerId: string,
    paymentMethodId: string,
    setupCustomerId?: string,
    makeDefault = false,
  ) {
    const [saved] = await this.db
      .select({ stripeCustomerId: tables.savedPaymentMethods.stripeCustomerId })
      .from(tables.savedPaymentMethods)
      .where(eq(tables.savedPaymentMethods.customerId, customerId))
      .limit(1);
    const stripeCustomerId = saved?.stripeCustomerId ?? setupCustomerId;
    if (!stripeCustomerId) {
      throw new BadRequestException(
        'Start card setup first so Stripe can associate the card securely',
      );
    }
    const method = await this.paymentsService.getReusablePaymentMethod(
      customerId,
      stripeCustomerId,
      paymentMethodId,
    );
    if (makeDefault) {
      await this.db
        .update(tables.savedPaymentMethods)
        .set({ isDefault: false })
        .where(eq(tables.savedPaymentMethods.customerId, customerId));
    }
    const [created] = await this.db
      .insert(tables.savedPaymentMethods)
      .values({ customerId, ...method, isDefault: makeDefault })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      throw new ConflictException('This payment method is already saved');
    }
    return created;
  }

  async removePaymentMethod(customerId: string, id: string) {
    const [removed] = await this.db
      .delete(tables.savedPaymentMethods)
      .where(
        and(
          eq(tables.savedPaymentMethods.id, id),
          eq(tables.savedPaymentMethods.customerId, customerId),
        ),
      )
      .returning({ id: tables.savedPaymentMethods.id });
    if (!removed) throw new NotFoundException('Saved payment method not found');
    return { removed: true };
  }

  private transactions(customerId: string) {
    return this.db
      .select()
      .from(tables.loyaltyTransactions)
      .where(eq(tables.loyaltyTransactions.customerId, customerId))
      .orderBy(desc(tables.loyaltyTransactions.createdAt))
      .limit(100);
  }

  private async createReferralCode() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = `WASIL${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
      const [existing] = await this.db
        .select({ customerId: tables.loyaltyAccounts.customerId })
        .from(tables.loyaltyAccounts)
        .where(eq(tables.loyaltyAccounts.referralCode, code));
      if (!existing) return code;
    }
    throw new ConflictException('Could not create a unique referral code');
  }
}
