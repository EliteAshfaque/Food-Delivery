import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { avg, count, desc, eq } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { OrderStatus } from '@food-delivery/types';
import type { schema as RelationsSchema } from '../db/relations';
import * as schema from '../db/schema';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @Inject('DB') private db: NeonHttpDatabase<typeof RelationsSchema>,
  ) {}

  async create(customerId: string, dto: CreateReviewDto) {
    const [order] = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, dto.orderId));

    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== customerId) {
      throw new ForbiddenException('You can only review your own orders');
    }
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('You can only review delivered orders');
    }

    const [existing] = await this.db
      .select({ id: schema.reviews.id })
      .from(schema.reviews)
      .where(eq(schema.reviews.orderId, dto.orderId));

    if (existing) {
      throw new ConflictException('This order has already been reviewed');
    }

    if (dto.driverRating != null && !order.driverId) {
      throw new BadRequestException('This order had no driver to rate');
    }
    if (order.driverId && dto.driverRating == null) {
      throw new BadRequestException('Please rate your driver for this delivery');
    }

    const [review] = await this.db
      .insert(schema.reviews)
      .values({
        customerId,
        restaurantId: order.restaurantId,
        orderId: order.id,
        driverId: order.driverId,
        restaurantRating: dto.restaurantRating,
        driverRating: dto.driverRating ?? null,
        comment: dto.comment?.trim() || null,
      })
      .returning();

    await this.refreshRestaurantRating(order.restaurantId);

    return review;
  }

  async findByOrder(orderId: string, customerId: string) {
    const [order] = await this.db
      .select({ customerId: schema.orders.customerId })
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId));

    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== customerId) {
      throw new ForbiddenException('Order not found');
    }

    const [review] = await this.db
      .select()
      .from(schema.reviews)
      .where(eq(schema.reviews.orderId, orderId));

    return review ?? null;
  }

  async findByRestaurant(restaurantId: string) {
    const [restaurant] = await this.db
      .select({ id: schema.restaurants.id })
      .from(schema.restaurants)
      .where(eq(schema.restaurants.id, restaurantId));

    if (!restaurant) throw new NotFoundException('Restaurant not found');

    return this.db
      .select({
        id: schema.reviews.id,
        restaurantRating: schema.reviews.restaurantRating,
        driverRating: schema.reviews.driverRating,
        comment: schema.reviews.comment,
        createdAt: schema.reviews.createdAt,
        customerFirstName: schema.user.firstName,
        customerLastName: schema.user.lastName,
      })
      .from(schema.reviews)
      .innerJoin(schema.user, eq(schema.reviews.customerId, schema.user.id))
      .where(eq(schema.reviews.restaurantId, restaurantId))
      .orderBy(desc(schema.reviews.createdAt))
      .limit(20);
  }

  async getDriverRating(driverId: string) {
    const [stats] = await this.db
      .select({
        average: avg(schema.reviews.driverRating),
        totalReviews: count(),
      })
      .from(schema.reviews)
      .where(eq(schema.reviews.driverId, driverId));

    return {
      averageRating: Number(stats?.average ?? 0),
      totalReviews: Number(stats?.totalReviews ?? 0),
    };
  }

  async findByDriver(driverId: string) {
    return this.db
      .select({
        id: schema.reviews.id,
        restaurantRating: schema.reviews.restaurantRating,
        driverRating: schema.reviews.driverRating,
        comment: schema.reviews.comment,
        createdAt: schema.reviews.createdAt,
        customerFirstName: schema.user.firstName,
        customerLastName: schema.user.lastName,
      })
      .from(schema.reviews)
      .innerJoin(schema.user, eq(schema.reviews.customerId, schema.user.id))
      .where(eq(schema.reviews.driverId, driverId))
      .orderBy(desc(schema.reviews.createdAt))
      .limit(20);
  }

  private async refreshRestaurantRating(restaurantId: string) {
    const [result] = await this.db
      .select({
        average: avg(schema.reviews.restaurantRating),
      })
      .from(schema.reviews)
      .where(eq(schema.reviews.restaurantId, restaurantId));

    const average = Number(result?.average ?? 0);

    await this.db
      .update(schema.restaurants)
      .set({ rating: average.toFixed(2) })
      .where(eq(schema.restaurants.id, restaurantId));
  }
}
