import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
 import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import type { schema as RelationsSchema } from '../db/relations';
import * as schema from '../db/schema';
import { OrderStatus, UserRole, type JwtPayload, type OrderStatus as OrderStatusType } from '@food-delivery/types';
import { CreateOrderDto } from './dto/create-oder.dto';
import { OrdersGateway } from '../gateway/orders.gateway';
import { DriverService } from '../driver/driver.service';

@Injectable()
export class OrdersService {
  constructor(
    @Inject('DB') private db: NeonHttpDatabase<typeof RelationsSchema>,
    private ordersGateway: OrdersGateway,
    @Inject(forwardRef(() => DriverService))
    private driverService: DriverService,
  ) {}

  async create(customerId: string, dto: CreateOrderDto) {
    const menuItemIds = dto.items.map((i) => i.menuItemId);

    const menuItems = await this.db
      .select()
      .from(schema.menuItems)
      .where(inArray(schema.menuItems.id, menuItemIds));

    if (menuItems.length !== dto.items.length) {
      throw new BadRequestException('One or more menu items not found');
    }

    const allBelongToRestaurant = menuItems.every(
      (item) => item.restaurantId === dto.restaurantId,
    );

    if (!allBelongToRestaurant) {
      throw new BadRequestException(
        'All items must belong to the same restaurant',
      );
    }

    const total = dto.items.reduce((sum, orderItem) => {
      const menuItem = menuItems.find((m) => m.id === orderItem.menuItemId);
      if (!menuItem) return sum;
      return sum + parseFloat(menuItem.price) * parseFloat(orderItem.quantity);
    }, 0);

    const [order] = await this.db
      .insert(schema.orders)
      .values({
        customerId,
        restaurantId: dto.restaurantId,
        deliveryAddress: dto.deliveryAddress,
        deliveryLatitude: dto.deliveryLatitude,
        deliveryLongitude: dto.deliveryLongitude,
        totalAmount: total.toFixed(2),
        status: OrderStatus.PENDING,
      })
      .returning();

    await this.db.insert(schema.orderItems).values(
      dto.items.map((item) => {
        const menuItem = menuItems.find((m) => m.id === item.menuItemId)!;
        return {
          orderId: order.id,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          price: menuItem.price,
        };
      }),
    );

    return order;
  }

  async updateStatus(
    orderId: string,
    newStatus: OrderStatusType,
    user: JwtPayload,
  ) {
    const [order] = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId));

    if (!order) throw new NotFoundException('Order not found');

    if (user.role === UserRole.RESTAURANT_OWNER) {
      const isOwner = await this.isOwnerOfRestaurant(
        user.sub,
        order.restaurantId,
      );
      if (!isOwner) throw new NotFoundException('Order not found');
    }

    if (user.role === UserRole.DRIVER && order.driverId !== user.sub) {
      throw new NotFoundException('Order not found');
    }

    this.validateTransition(order.status, newStatus, user.role);

    const [updated] = await this.db
      .update(schema.orders)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, orderId))
      .returning();

    this.ordersGateway.emitOrderUpdate(updated);

    // When food is ready, auto-assign an online driver and notify their app
    if (newStatus === OrderStatus.READY) {
      const assigned = await this.driverService.assignDriver(orderId);
      return assigned ?? updated;
    }

    return updated;
  }

  async findByRestaurant(restaurantId: string, ownerId: string) {
    const isOwner = await this.isOwnerOfRestaurant(ownerId, restaurantId);
    if (!isOwner) throw new NotFoundException('Restaurant not found');

    return this.findOrdersWithDetails(
      eq(schema.orders.restaurantId, restaurantId),
    );
  }

  /** Owner helper: resolve restaurant from owner, then return enriched orders. */
  async findByOwner(ownerId: string) {
    const [restaurant] = await this.db
      .select()
      .from(schema.restaurants)
      .where(eq(schema.restaurants.ownerId, ownerId));

    if (!restaurant) throw new NotFoundException('Restaurant not found');

    return this.findOrdersWithDetails(
      eq(schema.orders.restaurantId, restaurant.id),
    );
  }

  async findByCustomer(customerId: string) {
    return this.findOrdersWithDetails(
      eq(schema.orders.customerId, customerId),
    );
  }

  async findByDriver(driverId: string) {
    return this.findOrdersWithDetails(eq(schema.orders.driverId, driverId));
  }

  async findMyOrders(userId: string, role: string) {
    if (role === UserRole.DRIVER) {
      return this.findByDriver(userId);
    }
    return this.findByCustomer(userId);
  }

  async findById(id: string, user: JwtPayload) {
    const [order] = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, id));

    if (!order) throw new NotFoundException('Order not found');

    const canView =
      (user.role === UserRole.CUSTOMER && order.customerId === user.sub) ||
      (user.role === UserRole.RESTAURANT_OWNER &&
        (await this.isOwnerOfRestaurant(user.sub, order.restaurantId))) ||
      (user.role === UserRole.DRIVER && order.driverId === user.sub);

    if (!canView) throw new NotFoundException('Order not found');

    const [enriched] = await this.enrichOrders([order]);
    return enriched;
  }

  private async enrichOrders(
    orderRows: (typeof schema.orders.$inferSelect)[],
  ) {
    if (orderRows.length === 0) return [];

    const orderIds = orderRows.map((o) => o.id);
    const restaurantIds = [
      ...new Set(orderRows.map((o) => o.restaurantId)),
    ];

    const restaurants = await this.db
      .select({
        id: schema.restaurants.id,
        name: schema.restaurants.name,
      })
      .from(schema.restaurants)
      .where(inArray(schema.restaurants.id, restaurantIds));

    const items = await this.db
      .select()
      .from(schema.orderItems)
      .where(inArray(schema.orderItems.orderId, orderIds));

    const restaurantMap = Object.fromEntries(
      restaurants.map((r) => [r.id, r]),
    );

    return orderRows.map((order) => ({
      ...order,
      restaurant: restaurantMap[order.restaurantId],
      items: items.filter((i) => i.orderId === order.id),
    }));
  }

  private async findOrdersWithDetails(where: SQL) {
    const orderRows = await this.db
      .select()
      .from(schema.orders)
      .where(where)
      .orderBy(desc(schema.orders.createdAt));

    return this.enrichOrders(orderRows);
  }

  private validateTransition(
    currentStatus: OrderStatusType,
    newStatus: OrderStatusType,
    role: UserRole,
  ) {
    const ownerTransitions: Partial<Record<OrderStatusType, OrderStatusType[]>> = {
      [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
      [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
    };

    const driverTransitions: Partial<Record<OrderStatusType, OrderStatusType[]>> = {
      [OrderStatus.READY]: [OrderStatus.PICKED_UP],
      [OrderStatus.PICKED_UP]: [OrderStatus.DELIVERED],
    };

    const allowed =
      role === UserRole.RESTAURANT_OWNER
        ? (ownerTransitions[currentStatus] ?? [])
        : role === UserRole.DRIVER
          ? (driverTransitions[currentStatus] ?? [])
          : [];

    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }

  private async isOwnerOfRestaurant(ownerId: string, restaurantId: string) {
    const [restaurant] = await this.db
      .select()
      .from(schema.restaurants)
      .where(
        and(
          eq(schema.restaurants.ownerId, ownerId),
          eq(schema.restaurants.id, restaurantId),
        ),
      );

    return !!restaurant;
  }

  
}
