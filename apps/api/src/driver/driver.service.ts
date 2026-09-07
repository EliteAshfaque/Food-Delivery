import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import type { schema as RelationsSchema } from '../db/relations';
import * as schema from '../db/schema';
import { AccountStatus, OrderStatus, UserRole } from '@food-delivery/types';
import { OrdersGateway } from '../gateway/orders.gateway';
import { OperationsService } from '../operations/operations.service';

@Injectable()
export class DriverService {
  constructor(
    @Inject('DB') private db: NeonDatabase<typeof RelationsSchema>,
    private ordersGateway: OrdersGateway,
    private operationsService: OperationsService,
  ) {}

  async toggleOnline(driverId: string) {
    const [driver] = await this.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, driverId));

    if (!driver) throw new NotFoundException('Driver not found');

    const [updated] = await this.db
      .update(schema.user)
      .set({ isOnline: !driver.isOnline, updatedAt: new Date() })
      .where(eq(schema.user.id, driverId))
      .returning();

    return { isOnline: updated.isOnline };
  }

  async getStatus(driverId: string) {
    const [driver] = await this.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, driverId));

    if (!driver) throw new NotFoundException('Driver not found');
    return { isOnline: driver.isOnline };
  }

  /** Orders currently assigned to this driver (ready / picked up). */
  async getActiveOrders(driverId: string) {
    const orders = await this.db
      .select({
        order: schema.orders,
        restaurant: schema.restaurants,
      })
      .from(schema.orders)
      .innerJoin(
        schema.restaurants,
        eq(schema.orders.restaurantId, schema.restaurants.id),
      )
      .where(
        and(
          eq(schema.orders.driverId, driverId),
          inArray(schema.orders.status, [
            OrderStatus.READY,
            OrderStatus.PICKED_UP,
          ]),
        ),
      );

    return orders
      .filter(
        ({ order }) =>
          order.status === OrderStatus.PICKED_UP ||
          order.driverAcceptedAt !== null,
      )
      .map(({ order, restaurant }) => ({
        ...order,
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          address: restaurant.address,
          latitude: restaurant.latitude,
          longitude: restaurant.longitude,
          imageUrl: restaurant.imageUrl,
        },
      }));
  }

  /** A driver must accept an offered READY order before it becomes active. */
  async acceptOrder(orderId: string, driverId: string) {
    const [accepted] = await this.db
      .update(schema.orders)
      .set({ driverAcceptedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.orders.id, orderId),
          eq(schema.orders.driverId, driverId),
          eq(schema.orders.status, OrderStatus.READY),
          isNull(schema.orders.driverAcceptedAt),
        ),
      )
      .returning();

    if (!accepted) {
      throw new ConflictException(
        'This delivery is no longer available. Refresh and wait for another offer.',
      );
    }

    await this.db.insert(schema.orderEvents).values({
      orderId,
      actorId: driverId,
      type: 'DRIVER_ACCEPTED',
      metadata: { driverId },
    });
    this.ordersGateway.emitOrderUpdate(accepted);
    void this.operationsService.queueOrderNotification(
      accepted.customerId,
      accepted.id,
      'Rider assigned',
      'Your rider has accepted the delivery and will collect your order shortly.',
    );
    return accepted;
  }

  async assignDriver(orderId: string, excludeDriverId?: string) {
    // Assignment is only meaningful while the restaurant is waiting for a
    // pickup. In particular, never replace the driver once the food has been
    // collected.
    const [currentOrder] = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId));

    if (!currentOrder || currentOrder.status !== OrderStatus.READY) {
      return null;
    }

    // A concurrent assignment already won. Return the current order without
    // emitting a duplicate assignment event.
    if (currentOrder.driverId) {
      return currentOrder;
    }

    const availableDrivers = await this.findAvailableDrivers(excludeDriverId);

    if (availableDrivers.length === 0) {
      return null;
    }

    for (const candidate of availableDrivers) {
      const updatedOrder = await this.claimOrderForDriver(
        orderId,
        candidate.id,
      );

      if (!updatedOrder) continue;

      this.ordersGateway.emitDriverAssigned(candidate.id, updatedOrder);
      this.ordersGateway.emitOrderUpdate(updatedOrder);
      void this.operationsService.queueOrderNotification(
        candidate.id,
        updatedOrder.id,
        'New delivery request',
        'A pickup is ready. Open the app to accept or decline.',
      );
      await this.db.insert(schema.orderEvents).values({
        orderId: updatedOrder.id,
        actorId: candidate.id,
        type: 'DRIVER_ASSIGNED',
        metadata: { driverId: candidate.id, automatic: true },
      });

      return updatedOrder;
    }

    return null;
  }

  async getAvailability() {
    const availableDrivers = await this.findAvailableDrivers();
    return {
      available: availableDrivers.length > 0,
      availableDrivers: availableDrivers.length,
    };
  }

  private async findAvailableDrivers(excludeDriverId?: string) {
    const conditions = [
      eq(schema.user.role, UserRole.DRIVER),
      eq(schema.user.accountStatus, AccountStatus.ACTIVE),
      eq(schema.user.isOnline, true),
    ];

    if (excludeDriverId) {
      conditions.push(ne(schema.user.id, excludeDriverId));
    }

    // Prefer drivers who are not already on an active delivery
    const onlineDrivers = await this.db
      .select()
      .from(schema.user)
      .where(and(...conditions));

    const availableDrivers = [] as typeof onlineDrivers;
    for (const candidate of onlineDrivers) {
      const [busy] = await this.db
        .select()
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.driverId, candidate.id),
            inArray(schema.orders.status, [
              OrderStatus.READY,
              OrderStatus.PICKED_UP,
            ]),
          ),
        )
        .limit(1);

      if (!busy) {
        availableDrivers.push(candidate);
      }
    }

    return availableDrivers;
  }

  async declineOrder(orderId: string, driverId: string) {
    // Conditional update prevents a stale decline request from removing a
    // replacement driver, or from reopening a pickup that has already begun.
    const [declinedOrder] = await this.db
      .update(schema.orders)
      .set({
        driverId: null,
        driverAcceptedAt: null,
        driverDeclineReason: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.orders.id, orderId),
          eq(schema.orders.driverId, driverId),
          eq(schema.orders.status, OrderStatus.READY),
          isNull(schema.orders.driverAcceptedAt),
        ),
      )
      .returning();

    if (!declinedOrder) {
      const [currentOrder] = await this.db
        .select({ id: schema.orders.id, driverId: schema.orders.driverId })
        .from(schema.orders)
        .where(eq(schema.orders.id, orderId));

      if (!currentOrder || currentOrder.driverId !== driverId) {
        throw new NotFoundException('Order not found');
      }

      throw new ConflictException(
        'This delivery can no longer be declined. Refresh and try again.',
      );
    }

    this.ordersGateway.emitOrderUpdate(declinedOrder);
    await this.db.insert(schema.orderEvents).values({
      orderId: declinedOrder.id,
      actorId: driverId,
      type: 'DRIVER_DECLINED',
      metadata: { driverId },
    });

    // Try another online driver (exclude the one who declined)
    await this.assignDriver(orderId, driverId);

    return { message: 'Order declined' };
  }

  /**
   * Serializes selection of a single driver across concurrent READY orders.
   * A conditional order update alone prevents two drivers claiming one order,
   * but it cannot stop one driver being selected for two orders at once. The
   * short PostgreSQL advisory lock is scoped to this driver and is released at
   * the end of the transaction.
   */
  private async claimOrderForDriver(orderId: string, driverId: string) {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`driver-assignment:${driverId}`}))`,
      );

      // Recheck the driver's active/account state after acquiring the lock,
      // because it may have changed since the candidate list was read.
      const [driver] = await tx
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(
          and(
            eq(schema.user.id, driverId),
            eq(schema.user.role, UserRole.DRIVER),
            eq(schema.user.accountStatus, AccountStatus.ACTIVE),
            eq(schema.user.isOnline, true),
          ),
        )
        .limit(1);

      if (!driver) return null;

      const [busy] = await tx
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.driverId, driverId),
            inArray(schema.orders.status, [
              OrderStatus.READY,
              OrderStatus.PICKED_UP,
            ]),
          ),
        )
        .limit(1);

      if (busy) return null;

      const [updatedOrder] = await tx
        .update(schema.orders)
        .set({
          driverId,
          driverAcceptedAt: null,
          driverDeclineReason: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.orders.id, orderId),
            eq(schema.orders.status, OrderStatus.READY),
            isNull(schema.orders.driverId),
          ),
        )
        .returning();

      return updatedOrder ?? null;
    });
  }
}
