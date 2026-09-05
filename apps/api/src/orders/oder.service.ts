import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import type { schema as RelationsSchema } from '../db/relations';
import * as schema from '../db/schema';
import {
  OrderStatus,
  AccountStatus,
  RestaurantModerationStatus,
  UserRole,
  type JwtPayload,
  type OrderStatus as OrderStatusType,
} from '@food-delivery/types';
import { CreateOrderDto } from './dto/create-oder.dto';
import { OrdersGateway } from '../gateway/orders.gateway';
import { DriverService } from '../driver/driver.service';
import { OffersService } from '../offers/offers.service';
import { LocationService } from '../location/location.service';
import { PaymentsService } from '../payments/payment.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject('DB') private db: NeonDatabase<typeof RelationsSchema>,
    private ordersGateway: OrdersGateway,
    @Inject(forwardRef(() => DriverService))
    private driverService: DriverService,
    private offersService: OffersService,
    private locationService: LocationService,
    private paymentsService: PaymentsService,
  ) {}

  async create(customerId: string, dto: CreateOrderDto) {
    if (!dto.deliveryAddress.trim()) {
      throw new BadRequestException('Delivery address is required');
    }

    if (dto.items.length === 0) {
      throw new BadRequestException('An order must contain at least one item');
    }

    const menuItemIds = dto.items.map((i) => i.menuItemId);
    if (new Set(menuItemIds).size !== menuItemIds.length) {
      throw new BadRequestException(
        'Each menu item can only appear once in an order',
      );
    }

    if (
      dto.items.some(
        (item) =>
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > 99,
      )
    ) {
      throw new BadRequestException(
        'Item quantity must be a whole number from 1 to 99',
      );
    }

    return this.db.transaction(async (tx) => {
      // Re-read the restaurant and menu inside the transaction and hold shared
      // locks until the order is recorded. This prevents an order from using a
      // price, availability, or restaurant state that changed during checkout.
      const [restaurant] = await tx
        .select({
          id: schema.restaurants.id,
          isOpen: schema.restaurants.isOpen,
          moderationStatus: schema.restaurants.moderationStatus,
          ownerAccountStatus: schema.user.accountStatus,
          ownerRole: schema.user.role,
        })
        .from(schema.restaurants)
        .innerJoin(schema.user, eq(schema.restaurants.ownerId, schema.user.id))
        .where(eq(schema.restaurants.id, dto.restaurantId))
        .for('share');

      if (
        !restaurant ||
        !restaurant.isOpen ||
        restaurant.moderationStatus !== RestaurantModerationStatus.APPROVED ||
        restaurant.ownerAccountStatus !== AccountStatus.ACTIVE ||
        restaurant.ownerRole !== UserRole.RESTAURANT_OWNER
      ) {
        throw new BadRequestException(
          'This restaurant is not accepting orders',
        );
      }

      const menuItems = await tx
        .select()
        .from(schema.menuItems)
        .where(inArray(schema.menuItems.id, menuItemIds))
        .for('share');

      if (menuItems.length !== dto.items.length) {
        throw new BadRequestException('One or more menu items not found');
      }

      if (menuItems.some((item) => item.restaurantId !== dto.restaurantId)) {
        throw new BadRequestException(
          'All items must belong to the same restaurant',
        );
      }

      if (menuItems.some((item) => !item.isAvailable)) {
        throw new BadRequestException('One or more menu items are unavailable');
      }

      const subtotal = dto.items.reduce((sum, orderItem) => {
        const menuItem = menuItems.find(
          (item) => item.id === orderItem.menuItemId,
        );
        return menuItem
          ? sum + parseFloat(menuItem.price) * orderItem.quantity
          : sum;
      }, 0);
      const roundedSubtotal =
        Math.round((subtotal + Number.EPSILON) * 100) / 100;
      if (
        !Number.isFinite(roundedSubtotal) ||
        roundedSubtotal <= 0 ||
        !Number.isSafeInteger(Math.round(roundedSubtotal * 100))
      ) {
        throw new BadRequestException('Order subtotal is invalid');
      }

      // Recalculate and revalidate an offer inside the order transaction, so
      // the client can never submit a stale discount or oversell a limit.
      const offerApplication = await this.offersService.validateForCheckout(
        customerId,
        dto.restaurantId,
        roundedSubtotal,
        dto.offerCode,
        tx,
      );

      const [order] = await tx
        .insert(schema.orders)
        .values({
          customerId,
          restaurantId: dto.restaurantId,
          deliveryAddress: dto.deliveryAddress.trim(),
          deliveryLatitude: dto.deliveryLatitude,
          deliveryLongitude: dto.deliveryLongitude,
          subtotalAmount:
            offerApplication?.subtotalAmount ?? roundedSubtotal.toFixed(2),
          discountAmount: offerApplication?.discountAmount ?? '0.00',
          offerId: offerApplication?.offer.id ?? null,
          totalAmount:
            offerApplication?.totalAmount ?? roundedSubtotal.toFixed(2),
          status: OrderStatus.PENDING,
        })
        .returning();

      await tx.insert(schema.orderItems).values(
        dto.items.map((item) => {
          const menuItem = menuItems.find((m) => m.id === item.menuItemId)!;
          return {
            orderId: order.id,
            menuItemId: item.menuItemId,
            quantity: String(item.quantity),
            price: menuItem.price,
          };
        }),
      );

      if (offerApplication) {
        await this.offersService.reserveForOrder(
          {
            offerId: offerApplication.offer.id,
            orderId: order.id,
            customerId,
            discountAmount: offerApplication.discountAmount,
          },
          tx,
        );
      }

      return order;
    });
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

    if (
      user.role === UserRole.RESTAURANT_OWNER &&
      newStatus === OrderStatus.READY
    ) {
      const { available } = await this.driverService.getAvailability();
      if (!available) {
        throw new BadRequestException(
          'No delivery driver is available. Keep the order preparing and try again shortly.',
        );
      }
    }

    if (newStatus === OrderStatus.CANCELLED) {
      const cancelled = await this.paymentsService.cancelAndRefundOrder(
        order.id,
        'Cancelled by restaurant owner',
      );
      await this.clearTerminalDriverLocation(cancelled.id);
      return cancelled;
    }

    // Both restaurant owners and drivers operate from an asynchronous UI. Keep
    // the read/validate/write sequence conditional on the state that was
    // validated, so a stale action cannot overwrite a newer transition. The
    // driver condition additionally prevents a just-declined driver from
    // picking up an order that has been reassigned.
    const statusCondition =
      user.role === UserRole.DRIVER
        ? and(
            eq(schema.orders.id, orderId),
            eq(schema.orders.status, order.status),
            eq(schema.orders.driverId, user.sub),
            isNull(schema.orders.cancellationRequestedAt),
          )
        : and(
            eq(schema.orders.id, orderId),
            eq(schema.orders.status, order.status),
            isNull(schema.orders.cancellationRequestedAt),
          );

    const [updated] = await this.db
      .update(schema.orders)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(statusCondition)
      .returning();

    if (!updated) {
      throw new ConflictException(
        'This order changed before your update was applied. Refresh and try again.',
      );
    }

    this.ordersGateway.emitOrderUpdate(updated);

    if (newStatus === OrderStatus.DELIVERED) {
      await this.clearTerminalDriverLocation(updated.id);
    }

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

  async getDriverAvailability() {
    return this.driverService.getAvailability();
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
    return this.findOrdersWithDetails(eq(schema.orders.customerId, customerId));
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
      user.role === UserRole.ADMIN ||
      (user.role === UserRole.CUSTOMER && order.customerId === user.sub) ||
      (user.role === UserRole.RESTAURANT_OWNER &&
        (await this.isOwnerOfRestaurant(user.sub, order.restaurantId))) ||
      (user.role === UserRole.DRIVER && order.driverId === user.sub);

    if (!canView) throw new NotFoundException('Order not found');

    const [enriched] = await this.enrichOrders([order]);
    return enriched;
  }

  private async enrichOrders(orderRows: (typeof schema.orders.$inferSelect)[]) {
    if (orderRows.length === 0) return [];

    const orderIds = orderRows.map((o) => o.id);
    const restaurantIds = [...new Set(orderRows.map((o) => o.restaurantId))];

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

    const restaurantMap = Object.fromEntries(restaurants.map((r) => [r.id, r]));

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
    const ownerTransitions: Partial<
      Record<OrderStatusType, OrderStatusType[]>
    > = {
      [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
      [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
    };

    const driverTransitions: Partial<
      Record<OrderStatusType, OrderStatusType[]>
    > = {
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

  private async clearTerminalDriverLocation(orderId: string) {
    try {
      await this.locationService.deleteDriverLocation(orderId);
    } catch {
      // Redis is a cache for live tracking. Do not report a failed terminal
      // order transition after the database write already succeeded; its TTL
      // is the fallback cleanup mechanism.
      this.logger.warn('Could not clear terminal driver location');
    }
  }
}
