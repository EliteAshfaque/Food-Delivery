import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import type { schema as RelationsSchema } from '../db/relations';
import * as schema from '../db/schema';
import { AccountStatus, OrderStatus, UserRole } from '@food-delivery/types';
import { OrdersGateway } from '../gateway/orders.gateway';
import { OperationsService } from '../operations/operations.service';

@Injectable()
export class DriverService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DriverService.name);
  private readonly offerLeaseMs = this.resolveOfferLeaseMs();
  private offerExpiryTimer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject('DB') private db: NeonDatabase<typeof RelationsSchema>,
    private ordersGateway: OrdersGateway,
    private operationsService: OperationsService,
  ) {}

  onModuleInit() {
    // An app can be killed without ever sending an "offline" update. A short
    // bounded offer lease guarantees that an unanswered request returns to the
    // dispatch queue instead of blocking delivery forever. The conditional DB
    // update makes this safe when more than one API instance is running.
    const runSweep = () => {
      void this.expireStaleOffers().catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Could not expire stale driver offers: ${message}`);
      });
    };
    runSweep();
    this.offerExpiryTimer = setInterval(runSweep, 15_000);
    this.offerExpiryTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.offerExpiryTimer) clearInterval(this.offerExpiryTimer);
  }

  async toggleOnline(driverId: string) {
    const [driver] = await this.db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, driverId));

    if (!driver) throw new NotFoundException('Driver not found');
    if (driver.accountStatus !== AccountStatus.ACTIVE) {
      throw new ConflictException(
        'Your driver account must be active before you can go online',
      );
    }

    const [updated] = await this.db
      .update(schema.user)
      .set({ isOnline: !driver.isOnline, updatedAt: new Date() })
      .where(eq(schema.user.id, driverId))
      .returning();

    // A restaurant may have marked an order ready while this driver was
    // offline. Dispatch it as soon as the driver becomes available.
    if (updated.isOnline) {
      await this.assignNextQueuedOrder(driverId);
    } else {
      // An unanswered offer must not reserve a driver who deliberately went
      // offline. Release it atomically, notify the driver UI, then let another
      // online driver claim it without making the offline toggle appear to fail
      // if dispatch is temporarily unavailable.
      const releasedOffers =
        await this.releasePendingOffersForOfflineDriver(driverId);
      for (const order of releasedOffers) {
        this.ordersGateway.emitDriverOfferRevoked(
          driverId,
          order.id,
          'This pickup offer was released because you went offline.',
        );
        this.ordersGateway.emitOrderUpdate(order);
      }
      if (releasedOffers.length > 0) {
        void this.assignNextQueuedOrder().catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(
            `Could not redispatch offers released by offline driver: ${message}`,
          );
        });
      }
    }

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

  /** Releases only offers that have not yet become an accepted delivery. */
  private async releasePendingOffersForOfflineDriver(driverId: string) {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const releasedOffers = await tx
        .update(schema.orders)
        .set({
          driverId: null,
          driverAcceptedAt: null,
          driverDeclineReason: 'Driver went offline before accepting',
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.orders.driverId, driverId),
            eq(schema.orders.status, OrderStatus.READY),
            isNull(schema.orders.driverAcceptedAt),
            isNull(schema.orders.cancellationRequestedAt),
          ),
        )
        .returning();

      if (releasedOffers.length > 0) {
        await tx.insert(schema.orderEvents).values(
          releasedOffers.map((order) => ({
            orderId: order.id,
            actorId: driverId,
            type: 'DRIVER_OFFER_RELEASED',
            metadata: { driverId, reason: 'DRIVER_WENT_OFFLINE' },
          })),
        );
      }

      return releasedOffers;
    });
  }

  /**
   * Releases offers whose lease elapsed without an acceptance. A rider may
   * lose connectivity without toggling offline, so this is intentionally not
   * tied only to the app's presence signal.
   */
  private async expireStaleOffers() {
    const cutoff = new Date(Date.now() - this.offerLeaseMs);
    const expiredOffers = await this.db.transaction(async (tx) => {
      const staleOffers = await tx
        .select({
          id: schema.orders.id,
          driverId: schema.orders.driverId,
        })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.status, OrderStatus.READY),
            isNotNull(schema.orders.driverId),
            isNull(schema.orders.driverAcceptedAt),
            isNull(schema.orders.cancellationRequestedAt),
            lt(schema.orders.updatedAt, cutoff),
          ),
        )
        .for('update');

      const released = [] as Array<{
        previousDriverId: string;
        order: typeof schema.orders.$inferSelect;
      }>;

      for (const staleOffer of staleOffers) {
        if (!staleOffer.driverId) continue;
        const [order] = await tx
          .update(schema.orders)
          .set({
            driverId: null,
            driverAcceptedAt: null,
            driverDeclineReason: 'Pickup offer expired',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.orders.id, staleOffer.id),
              eq(schema.orders.driverId, staleOffer.driverId),
              eq(schema.orders.status, OrderStatus.READY),
              isNull(schema.orders.driverAcceptedAt),
              isNull(schema.orders.cancellationRequestedAt),
              lt(schema.orders.updatedAt, cutoff),
            ),
          )
          .returning();

        if (!order) continue;

        await tx.insert(schema.orderEvents).values({
          orderId: order.id,
          actorId: null,
          type: 'DRIVER_OFFER_EXPIRED',
          metadata: {
            driverId: staleOffer.driverId,
            leaseSeconds: this.offerLeaseMs / 1000,
          },
        });
        released.push({ previousDriverId: staleOffer.driverId, order });
      }

      return released;
    });

    for (const expired of expiredOffers) {
      this.ordersGateway.emitDriverOfferRevoked(
        expired.previousDriverId,
        expired.order.id,
        'This pickup offer timed out and was offered to another rider.',
      );
      this.ordersGateway.emitOrderUpdate(expired.order);
      try {
        // Prefer a different rider after a timeout. When this is the only
        // available rider, issue a fresh offer so a reconnecting app can
        // recover without waiting for another order event.
        const reassigned = await this.assignDriver(
          expired.order.id,
          expired.previousDriverId,
          true,
        );
        if (!reassigned) {
          await this.assignDriver(expired.order.id, undefined, true);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Could not redispatch expired offer ${expired.order.id}: ${message}`,
        );
      }
    }

    return expiredOffers.length;
  }

  /** Accepted orders currently being delivered by this driver. */
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
          isNull(schema.orders.cancellationRequestedAt),
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

  /**
   * READY orders offered to this driver but not accepted yet. Socket events are
   * transient; this endpoint lets a driver recover an offer after reopening
   * the app, losing network, or missing the original push notification.
   */
  async getPendingOffers(driverId: string) {
    const offers = await this.db
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
          eq(schema.orders.status, OrderStatus.READY),
          isNull(schema.orders.driverAcceptedAt),
          isNull(schema.orders.cancellationRequestedAt),
        ),
      )
      .orderBy(schema.orders.createdAt);

    return offers.map(({ order, restaurant }) => ({
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
    const accepted = await this.db.transaction(async (tx) => {
      const [nextOrder] = await tx
        .update(schema.orders)
        .set({ driverAcceptedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(schema.orders.id, orderId),
            eq(schema.orders.driverId, driverId),
            eq(schema.orders.status, OrderStatus.READY),
            isNull(schema.orders.driverAcceptedAt),
            isNull(schema.orders.cancellationRequestedAt),
          ),
        )
        .returning();

      if (!nextOrder) return null;

      await tx.insert(schema.orderEvents).values({
        orderId,
        actorId: driverId,
        type: 'DRIVER_ACCEPTED',
        metadata: { driverId },
      });

      return nextOrder;
    });

    if (!accepted) {
      throw new ConflictException(
        'This delivery is no longer available. Refresh and wait for another offer.',
      );
    }

    this.ordersGateway.emitOrderUpdate(accepted);
    void this.operationsService.queueOrderNotification(
      accepted.customerId,
      accepted.id,
      'Rider assigned',
      'Your rider has accepted the delivery and will collect your order shortly.',
    );
    return accepted;
  }

  async assignDriver(
    orderId: string,
    excludeDriverId?: string,
    skipOfferExpirySweep = false,
  ) {
    if (!skipOfferExpirySweep) {
      await this.expireStaleOffers();
    }
    // Assignment is only meaningful while the restaurant is waiting for a
    // pickup. In particular, never replace the driver once the food has been
    // collected.
    const [currentOrder] = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId));

    if (
      !currentOrder ||
      currentOrder.status !== OrderStatus.READY ||
      currentOrder.cancellationRequestedAt
    ) {
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

      this.completeAssignment(candidate.id, updatedOrder);

      return updatedOrder;
    }

    return null;
  }

  /** Offers the oldest waiting READY order whenever delivery capacity opens. */
  async assignNextQueuedOrder(preferredDriverId?: string) {
    await this.expireStaleOffers();
    const queuedOrders = await this.db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.status, OrderStatus.READY),
          isNull(schema.orders.driverId),
          isNull(schema.orders.cancellationRequestedAt),
        ),
      )
      .orderBy(schema.orders.createdAt)
      .limit(10);

    for (const queuedOrder of queuedOrders) {
      if (preferredDriverId) {
        const claimed = await this.claimOrderForDriver(
          queuedOrder.id,
          preferredDriverId,
        );
        if (claimed) {
          this.completeAssignment(preferredDriverId, claimed);
          return claimed;
        }
      }

      const assigned = await this.assignDriver(queuedOrder.id);
      if (assigned?.driverId) return assigned;
    }

    return null;
  }

  async getAvailability() {
    const onlineDrivers = await this.db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(
        and(
          eq(schema.user.role, UserRole.DRIVER),
          eq(schema.user.accountStatus, AccountStatus.ACTIVE),
          eq(schema.user.isOnline, true),
        ),
      );

    if (onlineDrivers.length === 0) {
      return {
        available: false,
        availableDrivers: 0,
        onlineDrivers: 0,
        busyDrivers: 0,
        pendingOfferDrivers: 0,
      };
    }

    const onlineDriverIds = onlineDrivers.map((driver) => driver.id);
    const activeAssignments = await this.db
      .select({
        driverId: schema.orders.driverId,
        status: schema.orders.status,
        driverAcceptedAt: schema.orders.driverAcceptedAt,
      })
      .from(schema.orders)
      .where(
        and(
          inArray(schema.orders.driverId, onlineDriverIds),
          isNotNull(schema.orders.driverId),
          inArray(schema.orders.status, [
            OrderStatus.READY,
            OrderStatus.PICKED_UP,
          ]),
          isNull(schema.orders.cancellationRequestedAt),
        ),
      );
    const busyDriverIds = new Set(
      activeAssignments.flatMap((assignment) =>
        assignment.driverId ? [assignment.driverId] : [],
      ),
    );
    const pendingOfferDriverIds = new Set(
      activeAssignments.flatMap((assignment) =>
        assignment.status === OrderStatus.READY &&
        assignment.driverAcceptedAt === null &&
        assignment.driverId
          ? [assignment.driverId]
          : [],
      ),
    );
    const availableDrivers = onlineDrivers.filter(
      (driver) => !busyDriverIds.has(driver.id),
    );

    return {
      available: availableDrivers.length > 0,
      availableDrivers: availableDrivers.length,
      onlineDrivers: onlineDrivers.length,
      busyDrivers: busyDriverIds.size,
      pendingOfferDrivers: pendingOfferDriverIds.size,
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
            isNull(schema.orders.cancellationRequestedAt),
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
    const declinedOrder = await this.db.transaction(async (tx) => {
      const [nextOrder] = await tx
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
            isNull(schema.orders.cancellationRequestedAt),
          ),
        )
        .returning();

      if (!nextOrder) return null;

      await tx.insert(schema.orderEvents).values({
        orderId: nextOrder.id,
        actorId: driverId,
        type: 'DRIVER_DECLINED',
        metadata: { driverId },
      });

      return nextOrder;
    });

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

    // Try another online driver (exclude the one who declined)
    await this.assignDriver(orderId, driverId);

    return { message: 'Order declined' };
  }

  private completeAssignment(
    driverId: string,
    order: typeof schema.orders.$inferSelect,
  ) {
    this.ordersGateway.emitDriverAssigned(driverId, order);
    this.ordersGateway.emitOrderUpdate(order);
    void this.operationsService.queueOrderNotification(
      driverId,
      order.id,
      'New delivery request',
      'A pickup is ready. Open the app to accept or decline.',
    );
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
            isNull(schema.orders.cancellationRequestedAt),
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
            isNull(schema.orders.cancellationRequestedAt),
          ),
        )
        .returning();

      if (updatedOrder) {
        // Automatic matching is performed by the dispatch system; attributing
        // it to the rider before they accept would make the intervention
        // timeline misleading.
        await tx.insert(schema.orderEvents).values({
          orderId: updatedOrder.id,
          actorId: null,
          type: 'DRIVER_ASSIGNED',
          metadata: { driverId, automatic: true },
        });
      }

      return updatedOrder ?? null;
    });
  }

  private resolveOfferLeaseMs() {
    const configuredSeconds = Number(
      process.env.DRIVER_OFFER_LEASE_SECONDS ?? 90,
    );
    const seconds =
      Number.isFinite(configuredSeconds) && configuredSeconds >= 30
        ? configuredSeconds
        : 90;
    return seconds * 1_000;
  }
}
