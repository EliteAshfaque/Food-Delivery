import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import type { schema as RelationsSchema } from '../db/relations';
import * as schema from '../db/schema';
import { OrderStatus, UserRole } from '@food-delivery/types';
import { OrdersGateway } from '../gateway/orders.gateway';

@Injectable()
export class DriverService {
  constructor(
    @Inject('DB') private db: NeonHttpDatabase<typeof RelationsSchema>,
    private ordersGateway: OrdersGateway,
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

    return orders.map(({ order, restaurant }) => ({
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

  async assignDriver(orderId: string, excludeDriverId?: string) {
    const availableDrivers = await this.findAvailableDrivers(excludeDriverId);

    if (availableDrivers.length === 0) {
      console.log('No available drivers for order:', orderId);
      return null;
    }

    const selected = availableDrivers[0];

    const [updatedOrder] = await this.db
      .update(schema.orders)
      .set({ driverId: selected.id, updatedAt: new Date() })
      .where(eq(schema.orders.id, orderId))
      .returning();

    this.ordersGateway.emitDriverAssigned(selected.id, updatedOrder);
    this.ordersGateway.emitOrderUpdate(updatedOrder);

    return updatedOrder;
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
    const [order] = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId));

    if (!order) throw new NotFoundException('Order not found');
    if (order.driverId !== driverId) {
      throw new NotFoundException('Order not found');
    }

    await this.db
      .update(schema.orders)
      .set({ driverId: null, updatedAt: new Date() })
      .where(eq(schema.orders.id, orderId));

    // Try another online driver (exclude the one who declined)
    await this.assignDriver(orderId, driverId);

    return { message: 'Order declined' };
  }
}
