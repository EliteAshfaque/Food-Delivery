import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import type { schema as RelationsSchema } from '../db/relations';
import * as schema from '../db/schema';
import Stripe from 'stripe';

@Injectable()
export class PaymentsService {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(
    @Inject('DB') private db: NeonHttpDatabase<typeof RelationsSchema>,
    configService: ConfigService,
  ) {
    const stripeSecretKey = configService.get<string>('STRIPE_SECRET_KEY');
    const webhookSecret = configService.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }

    this.stripe = new Stripe(stripeSecretKey);
    this.webhookSecret = webhookSecret;
  }

    async createPaymentIntent(orderId: string) {
        const [order] = await this.db
            .select()
            .from(schema.orders)
            .where(eq(schema.orders.id, orderId));

        if (!order) throw new NotFoundException('Order not found');

        // create payment intent - amount must be in smallest currency unit (cents)
        const paymentIntent = await this.stripe.paymentIntents.create({
            amount: Math.round(parseFloat(order.totalAmount) * 100), // e.g. $8.99 -> 899 cents
            currency: 'usd',
            metadata: {
                orderId: order.id, // attach orderId so we can find it in the webhook
            }
        });

        // save paymentIntentId to order so webhook can match it
        await this.db
            .update(schema.orders)
            .set({ stripePaymentIntentId: paymentIntent.id })
            .where(eq(schema.orders.id, orderId));

        return { clientSecret: paymentIntent.client_secret };
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
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      const [order] = await this.db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.stripePaymentIntentId, paymentIntent.id));

      if (!order) return { received: true };

      if (order.status === 'CONFIRMED') return { received: true };

      await this.db
        .update(schema.orders)
        .set({ status: 'CONFIRMED', updatedAt: new Date() })
        .where(eq(schema.orders.id, order.id));

      return { received: true };
    }

    return { received: true };
  }
}