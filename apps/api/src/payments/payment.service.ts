import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { OrderStatus } from '@food-delivery/types';
import type { schema as RelationsSchema } from '../db/relations';
import * as schema from '../db/schema';
import { OrdersGateway } from '../gateway/orders.gateway';
import { OffersService } from '../offers/offers.service';
import { LocationService } from '../location/location.service';
import { OperationsService } from '../operations/operations.service';
import Stripe from 'stripe';

type OrderRecord = typeof schema.orders.$inferSelect;

const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);
const THREE_DECIMAL_CURRENCIES = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);

class ExpiredOfferReservationError extends Error {
  constructor() {
    super('Offer reservation is no longer valid');
  }
}

function toStripeAmount(total: string, currency: string) {
  const value = Number(total);
  const exponent = ZERO_DECIMAL_CURRENCIES.has(currency)
    ? 0
    : THREE_DECIMAL_CURRENCIES.has(currency)
      ? 3
      : 2;
  const amount = Math.round(value * 10 ** exponent);

  if (!Number.isFinite(value) || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new BadRequestException('Order total is invalid');
  }

  return amount;
}

@Injectable()
export class PaymentsService {
  private stripe: Stripe;
  private webhookSecret: string;
  private currency: string;

  constructor(
    @Inject('DB') private readonly db: NeonDatabase<typeof RelationsSchema>,
    configService: ConfigService,
    private readonly ordersGateway: OrdersGateway,
    private readonly offersService: OffersService,
    private readonly locationService: LocationService,
    private readonly operationsService: OperationsService,
  ) {
    const stripeSecretKey = configService.get<string>('STRIPE_SECRET_KEY');
    const webhookSecret = configService.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }

    const currency = configService
      .get<string>('PAYMENT_CURRENCY', 'aed')
      .toLowerCase();

    if (!/^[a-z]{3}$/.test(currency)) {
      throw new Error(
        'PAYMENT_CURRENCY must be a three-letter ISO currency code',
      );
    }

    this.stripe = new Stripe(stripeSecretKey);
    this.webhookSecret = webhookSecret;
    this.currency = currency;
  }

  async createPaymentIntent(orderId: string, customerId: string) {
    const order = await this.getOrder(orderId);

    // Do not reveal another customer's order or allow a payment against it.
    if (order.customerId !== customerId) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.PENDING || order.cancellationRequestedAt) {
      throw new ConflictException('This order is no longer awaiting payment');
    }

    // Never replace an existing payable PaymentIntent. A Stripe idempotency key
    // expires eventually, but this stored mapping remains authoritative.
    if (order.stripePaymentIntentId) {
      return this.getClientSecretForExistingIntent(order);
    }

    await this.offersService.ensureReservationIsValidForOrder(order.id);
    const amount = toStripeAmount(order.totalAmount, this.currency);
    const paymentIntent = await this.stripe.paymentIntents.create(
      {
        amount,
        currency: this.currency,
        metadata: { orderId: order.id },
      },
      { idempotencyKey: `order-payment-${order.id}` },
    );

    // Only the still-pending order that has no prior attempt can claim this
    // intent. If a cancellation won the race, cancel this new unused intent.
    const [mappedOrder] = await this.db
      .update(schema.orders)
      .set({ stripePaymentIntentId: paymentIntent.id, updatedAt: new Date() })
      .where(
        and(
          eq(schema.orders.id, order.id),
          eq(schema.orders.status, OrderStatus.PENDING),
          isNull(schema.orders.cancellationRequestedAt),
          isNull(schema.orders.stripePaymentIntentId),
        ),
      )
      .returning();

    if (!mappedOrder) {
      await this.cancelIntentIfPossible(paymentIntent.id);
      throw new ConflictException('This order is no longer awaiting payment');
    }

    if (!paymentIntent.client_secret) {
      throw new BadRequestException('Could not prepare secure payment');
    }

    return { clientSecret: paymentIntent.client_secret };
  }

  /** Starts Stripe's PCI-hosted reusable-card setup flow. */
  async createSetupIntent(customerId: string, stripeCustomerId?: string) {
    const customer = stripeCustomerId
      ? await this.stripe.customers.retrieve(stripeCustomerId)
      : await this.stripe.customers.create({ metadata: { customerId } });
    if (customer.deleted) {
      throw new BadRequestException(
        'Saved payment customer is no longer available',
      );
    }
    const setupIntent = await this.stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: { customerId },
    });
    if (!setupIntent.client_secret) {
      throw new BadRequestException('Could not prepare secure card setup');
    }
    return {
      clientSecret: setupIntent.client_secret,
      stripeCustomerId: customer.id,
    };
  }

  async getReusablePaymentMethod(
    customerId: string,
    stripeCustomerId: string,
    paymentMethodId: string,
  ) {
    const customer = await this.stripe.customers.retrieve(stripeCustomerId);
    if (customer.deleted || customer.metadata.customerId !== customerId) {
      throw new BadRequestException(
        'This payment customer does not belong to the signed-in account',
      );
    }
    const method = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    if (
      method.customer !== stripeCustomerId ||
      method.type !== 'card' ||
      !method.card
    ) {
      throw new BadRequestException(
        'This payment method does not belong to the signed-in customer',
      );
    }
    return {
      stripeCustomerId,
      stripePaymentMethodId: method.id,
      brand: method.card.brand,
      last4: method.card.last4,
      expMonth: method.card.exp_month,
      expYear: method.card.exp_year,
    };
  }

  /**
   * Called only after the actor has been authorised to cancel the order. It
   * locks ordinary workflow changes, cancels an uncaptured intent or refunds a
   * captured intent, and only then marks the order cancelled.
   */
  async cancelAndRefundOrder(orderId: string, reason: string) {
    const now = new Date();
    let order: OrderRecord;

    const [claimed] = await this.db
      .update(schema.orders)
      .set({
        cancellationRequestedAt: now,
        cancellationReason: reason.trim() || null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.orders.id, orderId),
          ne(schema.orders.status, OrderStatus.DELIVERED),
          ne(schema.orders.status, OrderStatus.CANCELLED),
          isNull(schema.orders.cancellationRequestedAt),
        ),
      )
      .returning();

    if (claimed) {
      order = claimed;
    } else {
      const current = await this.getOrder(orderId);
      if (current.status === OrderStatus.CANCELLED) return current;
      if (current.status === OrderStatus.DELIVERED) {
        throw new BadRequestException('A delivered order cannot be cancelled');
      }

      // A retry resumes a payment/refund operation safely because both Stripe
      // requests use stable idempotency keys and the stored IDs are retained.
      if (!current.cancellationRequestedAt) {
        throw new ConflictException('The order changed. Refresh and try again');
      }
      order = current;
    }

    await this.settlePaymentForCancellation(order);
    return this.finalizeCancellation(order.id);
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid webhook signature';
      throw new BadRequestException(message);
    }

    if (event.type === 'payment_intent.succeeded') {
      await this.handlePaymentIntentSucceeded(event.data.object);
    }

    if (event.type === 'payment_intent.canceled') {
      await this.handlePaymentIntentCancelled(event.data.object);
    }

    // Stripe's current refund lifecycle event is `refund.updated`.  We also
    // accept `refund.created` (which may already be succeeded) and the legacy
    // charge-scoped event so webhook configurations can be migrated without
    // leaving a paid cancellation unfinished.
    if (
      event.type === 'refund.created' ||
      event.type === 'refund.updated' ||
      event.type === 'charge.refund.updated'
    ) {
      await this.handleRefundUpdated(event.data.object);
    }

    return { received: true };
  }

  private async getClientSecretForExistingIntent(order: OrderRecord) {
    const paymentIntent = await this.stripe.paymentIntents.retrieve(
      order.stripePaymentIntentId!,
    );

    if (paymentIntent.status === 'canceled') {
      await this.cancelPendingOrderAfterIntentCancellation(order);
      throw new ConflictException(
        'The previous payment was cancelled. Please place a new order.',
      );
    }
    if (paymentIntent.status === 'succeeded') {
      throw new ConflictException(
        'Payment was received. Your order confirmation is being processed.',
      );
    }
    if (!paymentIntent.client_secret) {
      throw new BadRequestException('Could not reopen secure payment');
    }

    return { clientSecret: paymentIntent.client_secret };
  }

  private async handlePaymentIntentSucceeded(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const [order] = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.stripePaymentIntentId, paymentIntent.id));
    if (!order) return;

    this.assertPaymentMatchesOrder(paymentIntent, order);

    if (order.status === OrderStatus.CANCELLED) {
      // A delayed Stripe event can arrive after an intent cancellation race.
      // The order is already terminal, but the successful charge must still
      // be refunded rather than merely acknowledged.
      await this.refundSucceededPayment(order);
      return;
    }

    if (order.cancellationRequestedAt) {
      // Never leave a late successful charge on an order being cancelled.
      await this.cancelAndRefundOrder(
        order.id,
        order.cancellationReason ??
          'Order was cancelled before payment settled',
      );
      return;
    }

    if (order.status !== OrderStatus.PENDING) return;

    try {
      const result = await this.db.transaction(async (tx) => {
        const [freshOrder] = await tx
          .select()
          .from(schema.orders)
          .where(
            and(
              eq(schema.orders.id, order.id),
              eq(schema.orders.stripePaymentIntentId, paymentIntent.id),
            ),
          );

        if (
          !freshOrder ||
          freshOrder.status !== OrderStatus.PENDING ||
          freshOrder.cancellationRequestedAt
        ) {
          return null;
        }

        const [confirmed] = await tx
          .update(schema.orders)
          .set({ status: OrderStatus.CONFIRMED, updatedAt: new Date() })
          .where(
            and(
              eq(schema.orders.id, freshOrder.id),
              eq(schema.orders.status, OrderStatus.PENDING),
              isNull(schema.orders.cancellationRequestedAt),
              eq(schema.orders.stripePaymentIntentId, paymentIntent.id),
            ),
          )
          .returning();
        if (!confirmed) return null;

        if (freshOrder.offerId) {
          const reservation =
            await this.offersService.confirmReservationForOrder(
              freshOrder.id,
              tx,
            );
          if (reservation === 'INVALID' || reservation === 'NO_RESERVATION') {
            // Throwing rolls back the order confirmation as well as any offer
            // mutation, so a late capture cannot fulfil an expired discount.
            throw new ExpiredOfferReservationError();
          }
        }

        return confirmed;
      });

      if (result) {
        await this.db.insert(schema.orderEvents).values({
          orderId: result.id,
          type: 'PAYMENT_CONFIRMED',
          metadata: { status: OrderStatus.CONFIRMED },
        });
        this.ordersGateway.emitOrderUpdate(result);
        void this.operationsService.queueCustomerStatusNotification(result);
        void this.operationsService.queueRestaurantOwnerNewOrderNotification(
          result,
        );
        return;
      }
    } catch (error) {
      if (error instanceof ExpiredOfferReservationError) {
        await this.cancelAndRefundOrder(
          order.id,
          'Offer reservation expired before payment confirmation',
        );
        return;
      }
      throw error;
    }

    // An authorised cancellation or another state transition won the CAS race.
    // Re-read it; a captured payment must still be refunded if it cannot be
    // confirmed into a pending order.
    const current = await this.getOrder(order.id);
    if (
      current.status === OrderStatus.CANCELLED ||
      current.cancellationRequestedAt
    ) {
      await this.cancelAndRefundOrder(
        current.id,
        current.cancellationReason ??
          'Order was cancelled before payment settled',
      );
    }
  }

  private async handlePaymentIntentCancelled(
    paymentIntent: Stripe.PaymentIntent,
  ) {
    const [order] = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.stripePaymentIntentId, paymentIntent.id));
    if (!order || order.status !== OrderStatus.PENDING) return;

    if (order.cancellationRequestedAt) {
      await this.finalizeCancellation(order.id);
      return;
    }

    await this.cancelPendingOrderAfterIntentCancellation(order);
  }

  private async handleRefundUpdated(refund: Stripe.Refund) {
    const [order] = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.stripeRefundId, refund.id));
    if (!order) return;

    if (refund.status === 'succeeded') {
      await this.db
        .update(schema.orders)
        .set({ refundedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.orders.id, order.id));
      if (order.cancellationRequestedAt) {
        await this.finalizeCancellation(order.id);
      }
    }
  }

  private async settlePaymentForCancellation(order: OrderRecord) {
    if (!order.stripePaymentIntentId) return;

    let paymentIntent = await this.stripe.paymentIntents.retrieve(
      order.stripePaymentIntentId,
    );
    if (paymentIntent.status === 'succeeded') {
      await this.refundSucceededPayment(order);
      return;
    }
    if (paymentIntent.status === 'canceled') return;

    try {
      paymentIntent = await this.stripe.paymentIntents.cancel(
        paymentIntent.id,
        { cancellation_reason: 'requested_by_customer' },
        { idempotencyKey: `order-payment-cancel-${order.id}` },
      );
    } catch {
      // A capture can win between retrieve and cancel. Re-read before deciding
      // whether a refund is necessary; never assume an external failure means
      // the customer was not charged.
      paymentIntent = await this.stripe.paymentIntents.retrieve(
        order.stripePaymentIntentId,
      );
    }

    if (paymentIntent.status === 'succeeded') {
      await this.refundSucceededPayment(order);
      return;
    }
    if (paymentIntent.status !== 'canceled') {
      throw new ConflictException(
        'Payment cancellation is still processing. Please try again shortly.',
      );
    }
  }

  private async refundSucceededPayment(order: OrderRecord) {
    if (!order.stripePaymentIntentId) return;

    let refund: Stripe.Refund;
    if (order.stripeRefundId) {
      refund = await this.stripe.refunds.retrieve(order.stripeRefundId);
    } else {
      refund = await this.stripe.refunds.create(
        {
          payment_intent: order.stripePaymentIntentId,
          reason: 'requested_by_customer',
        },
        { idempotencyKey: `order-refund-${order.id}` },
      );

      const [mapped] = await this.db
        .update(schema.orders)
        .set({ stripeRefundId: refund.id, updatedAt: new Date() })
        .where(
          and(
            eq(schema.orders.id, order.id),
            isNull(schema.orders.stripeRefundId),
          ),
        )
        .returning();

      if (!mapped && refund.id) {
        const current = await this.getOrder(order.id);
        if (current.stripeRefundId && current.stripeRefundId !== refund.id) {
          refund = await this.stripe.refunds.retrieve(current.stripeRefundId);
        }
      }
    }

    if (refund.status === 'succeeded') {
      await this.db
        .update(schema.orders)
        .set({ refundedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.orders.id, order.id));
      return;
    }

    throw new ConflictException(
      'Refund is processing. The order will be cancelled once Stripe confirms it.',
    );
  }

  private async finalizeCancellation(orderId: string) {
    const now = new Date();
    const [cancelled] = await this.db
      .update(schema.orders)
      .set({
        status: OrderStatus.CANCELLED,
        cancelledAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.orders.id, orderId),
          ne(schema.orders.status, OrderStatus.DELIVERED),
          ne(schema.orders.status, OrderStatus.CANCELLED),
          isNotNull(schema.orders.cancellationRequestedAt),
        ),
      )
      .returning();

    if (!cancelled) {
      const current = await this.getOrder(orderId);
      if (current.status === OrderStatus.CANCELLED) return current;
      throw new ConflictException(
        'The order changed while cancellation was settling',
      );
    }

    await this.offersService.releaseReservationForOrder(cancelled.id, {
      includeRedeemed: true,
    });
    await this.clearTerminalDriverLocation(cancelled.id);
    await this.db.insert(schema.orderEvents).values({
      orderId: cancelled.id,
      type: 'ORDER_CANCELLED',
      metadata: { reason: cancelled.cancellationReason },
    });
    this.ordersGateway.emitOrderUpdate(cancelled);
    void this.operationsService.queueCustomerStatusNotification(cancelled);
    return cancelled;
  }

  private async cancelPendingOrderAfterIntentCancellation(order: OrderRecord) {
    const [cancelled] = await this.db
      .update(schema.orders)
      .set({
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.orders.id, order.id),
          eq(schema.orders.status, OrderStatus.PENDING),
          eq(schema.orders.stripePaymentIntentId, order.stripePaymentIntentId!),
          isNull(schema.orders.cancellationRequestedAt),
        ),
      )
      .returning();

    if (cancelled) {
      await this.offersService.releaseReservationForOrder(cancelled.id);
      await this.clearTerminalDriverLocation(cancelled.id);
      await this.db.insert(schema.orderEvents).values({
        orderId: cancelled.id,
        type: 'ORDER_CANCELLED',
        metadata: { reason: 'Payment intent cancelled' },
      });
      this.ordersGateway.emitOrderUpdate(cancelled);
      void this.operationsService.queueCustomerStatusNotification(cancelled);
    }
  }

  private async cancelIntentIfPossible(paymentIntentId: string) {
    try {
      const paymentIntent =
        await this.stripe.paymentIntents.retrieve(paymentIntentId);
      if (!['succeeded', 'canceled'].includes(paymentIntent.status)) {
        await this.stripe.paymentIntents.cancel(paymentIntentId, undefined, {
          idempotencyKey: `orphan-payment-intent-${paymentIntentId}`,
        });
      }
    } catch {
      // This is cleanup after the order lost a DB race. The authoritative
      // order never stores this intent, and Stripe's own idempotency prevents
      // a second payment attempt. Do not mask the useful conflict response.
    }
  }

  private assertPaymentMatchesOrder(
    paymentIntent: Stripe.PaymentIntent,
    order: OrderRecord,
  ) {
    const expectedAmount = toStripeAmount(order.totalAmount, this.currency);
    if (
      paymentIntent.amount !== expectedAmount ||
      paymentIntent.currency.toLowerCase() !== this.currency
    ) {
      throw new BadRequestException(
        'Payment amount or currency does not match the order',
      );
    }
  }

  private async getOrder(orderId: string) {
    const [order] = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId));
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async clearTerminalDriverLocation(orderId: string) {
    try {
      await this.locationService.deleteDriverLocation(orderId);
    } catch {
      // Redis is only a live-location cache. A failed cleanup must not leave a
      // paid/refunded order in an inconsistent payment state; the TTL and the
      // location endpoint's terminal-state gate are backstops.
    }
  }
}
