import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { AccountStatus, OrderStatus, UserRole } from '@food-delivery/types';
import { schema } from '../db/relations';
import * as tables from '../db/schema';
import { OrdersGateway } from '../gateway/orders.gateway';
import {
  AddSupportNoteDto,
  CreateCancellationReasonDto,
  CreateSettlementDto,
  CreateSupportTicketDto,
  ReassignOrderDto,
  ReviewDriverDocumentDto,
  SendNotificationDto,
  UpdateAdminAssignmentDto,
  UpdateSupportTicketDto,
  UpsertDeliveryZoneDto,
  UpsertRestaurantScheduleDto,
} from './dto/operations.dto';

const activeDeliveryStatuses = [OrderStatus.READY, OrderStatus.PICKED_UP];
const pushRetryIntervalMs = 30_000;
const pushRetryBaseDelayMs = 30_000;
const pushRetryMaxDelayMs = 15 * 60_000;
const pushRetryMaxAttempts = 5;
const pushRetryBatchSize = 50;
const pushRequestTimeoutMs = 10_000;

type ExpoPushTicket = {
  status?: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

type ExpoPushResponse = {
  data?: ExpoPushTicket | ExpoPushTicket[];
  errors?: Array<{ code?: string; message?: string }>;
};

class PushDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly unregisterDevice = false,
  ) {
    super(message);
    this.name = 'PushDeliveryError';
  }
}

@Injectable()
export class OperationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OperationsService.name);
  private readonly pushDeliveriesInFlight = new Set<string>();
  private pushRetryTimer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject('DB') private readonly db: NeonDatabase<typeof schema>,
    private readonly ordersGateway: OrdersGateway,
  ) {}

  onModuleInit() {
    const runRetrySweep = () => {
      void this.retryPendingPushDeliveries().catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Unknown retry worker error';
        this.logger.warn(`Could not retry queued push deliveries: ${message}`);
      });
    };

    // Recover rows left QUEUED/RETRYING by a process restart, then keep the
    // bounded retry loop running without blocking order or admin operations.
    runRetrySweep();
    this.pushRetryTimer = setInterval(runRetrySweep, pushRetryIntervalMs);
    this.pushRetryTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.pushRetryTimer) clearInterval(this.pushRetryTimer);
  }

  async listDrivers() {
    const drivers = await this.db
      .select({
        id: tables.user.id,
        firstName: tables.user.firstName,
        lastName: tables.user.lastName,
        email: tables.user.email,
        imageUrl: tables.user.imageUrl,
        isOnline: tables.user.isOnline,
        accountStatus: tables.user.accountStatus,
        vehicleType: tables.driverProfiles.vehicleType,
        vehiclePlate: tables.driverProfiles.vehiclePlate,
        verifiedAt: tables.driverProfiles.verifiedAt,
      })
      .from(tables.user)
      .leftJoin(
        tables.driverProfiles,
        eq(tables.driverProfiles.userId, tables.user.id),
      )
      .where(eq(tables.user.role, UserRole.DRIVER))
      .orderBy(desc(tables.user.isOnline), asc(tables.user.firstName));

    const active = await this.db
      .select({
        driverId: tables.orders.driverId,
        orderId: tables.orders.id,
        status: tables.orders.status,
      })
      .from(tables.orders)
      .where(
        and(
          inArray(tables.orders.status, activeDeliveryStatuses),
          sql`${tables.orders.driverId} is not null`,
          isNull(tables.orders.cancellationRequestedAt),
        ),
      );
    const byDriver = new Map(active.map((order) => [order.driverId!, order]));
    return drivers.map((driver) => ({
      ...driver,
      activeOrder: byDriver.get(driver.id) ?? null,
    }));
  }

  async listDriverDocuments(driverId: string) {
    await this.requireDriver(driverId);
    return this.db
      .select()
      .from(tables.driverDocuments)
      .where(eq(tables.driverDocuments.driverId, driverId))
      .orderBy(desc(tables.driverDocuments.createdAt));
  }

  async reviewDriverDocument(
    documentId: string,
    actorId: string,
    dto: ReviewDriverDocumentDto,
  ) {
    const [document] = await this.db
      .select()
      .from(tables.driverDocuments)
      .where(eq(tables.driverDocuments.id, documentId));
    if (!document) throw new NotFoundException('Driver document not found');
    const [updated] = await this.db
      .update(tables.driverDocuments)
      .set({
        status: dto.status,
        reviewNote: dto.reviewNote?.trim() || null,
        reviewedAt: new Date(),
        reviewedBy: actorId,
      })
      .where(eq(tables.driverDocuments.id, documentId))
      .returning();
    await this.recordEvent(null, actorId, 'DRIVER_DOCUMENT_REVIEWED', {
      documentId,
      status: dto.status,
    });
    return updated;
  }

  async reassignOrder(orderId: string, actorId: string, dto: ReassignOrderDto) {
    const [order] = await this.db
      .select()
      .from(tables.orders)
      .where(eq(tables.orders.id, orderId));
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.READY) {
      throw new BadRequestException(
        'Only ready-for-pickup orders can be reassigned',
      );
    }
    if (order.cancellationRequestedAt) {
      throw new ConflictException(
        'This order is being cancelled and cannot be reassigned',
      );
    }
    const driver = await this.requireDriver(dto.driverId);
    if (!driver.isOnline || driver.accountStatus !== AccountStatus.ACTIVE) {
      throw new BadRequestException(
        'The selected driver is not currently available',
      );
    }
    const [busy] = await this.db
      .select({ id: tables.orders.id })
      .from(tables.orders)
      .where(
        and(
          eq(tables.orders.driverId, dto.driverId),
          inArray(tables.orders.status, activeDeliveryStatuses),
          isNull(tables.orders.cancellationRequestedAt),
        ),
      )
      .limit(1);
    if (busy)
      throw new ConflictException(
        'The selected driver already has an active delivery',
      );

    // Reassignment is an intervention, but it must not overwrite a driver
    // acceptance or a previous reassignment that happened after the order was
    // read above. Compare the full prior assignment state in the write itself.
    const expectedDriverCondition = order.driverId
      ? eq(tables.orders.driverId, order.driverId)
      : isNull(tables.orders.driverId);
    const expectedAcceptanceCondition = order.driverAcceptedAt
      ? eq(tables.orders.driverAcceptedAt, order.driverAcceptedAt)
      : isNull(tables.orders.driverAcceptedAt);

    const updated = await this.db.transaction(async (tx) => {
      const [nextOrder] = await tx
        .update(tables.orders)
        .set({
          driverId: dto.driverId,
          driverAcceptedAt: null,
          driverDeclineReason: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tables.orders.id, orderId),
            eq(tables.orders.status, OrderStatus.READY),
            expectedDriverCondition,
            expectedAcceptanceCondition,
            isNull(tables.orders.cancellationRequestedAt),
          ),
        )
        .returning();
      if (!nextOrder) return null;

      await tx.insert(tables.orderEvents).values({
        orderId,
        actorId,
        type: 'ORDER_DRIVER_REASSIGNED',
        metadata: {
          previousDriverId: order.driverId,
          driverId: dto.driverId,
          note: dto.note?.trim() || null,
        },
      });
      return nextOrder;
    });
    if (!updated)
      throw new ConflictException('Order changed; refresh and try again');
    this.ordersGateway.emitDriverAssigned(dto.driverId, updated);
    this.ordersGateway.emitOrderUpdate(updated);
    void this.queueOrderNotification(
      dto.driverId,
      updated.id,
      'Delivery reassigned',
      'A ready pickup has been assigned to you. Open the app to accept or decline.',
    );
    if (order.driverId && order.driverId !== dto.driverId) {
      this.ordersGateway.emitDriverOfferRevoked(
        order.driverId,
        updated.id,
        order.driverAcceptedAt
          ? 'This delivery was reassigned by operations.'
          : 'This pickup offer was reassigned by operations.',
      );
      void this.queueOrderNotification(
        order.driverId,
        updated.id,
        'Delivery reassigned',
        'This delivery is no longer assigned to you.',
      );
    }
    return updated;
  }

  async getOrderTimeline(orderId: string) {
    const [order] = await this.db
      .select({ id: tables.orders.id })
      .from(tables.orders)
      .where(eq(tables.orders.id, orderId));
    if (!order) throw new NotFoundException('Order not found');
    return this.db
      .select({
        event: tables.orderEvents,
        actor: {
          id: tables.user.id,
          firstName: tables.user.firstName,
          lastName: tables.user.lastName,
        },
      })
      .from(tables.orderEvents)
      .leftJoin(tables.user, eq(tables.orderEvents.actorId, tables.user.id))
      .where(eq(tables.orderEvents.orderId, orderId))
      .orderBy(desc(tables.orderEvents.createdAt));
  }

  async listZones() {
    return this.db
      .select()
      .from(tables.deliveryZones)
      .orderBy(asc(tables.deliveryZones.name));
  }

  async createZone(dto: UpsertDeliveryZoneDto) {
    this.validateZone(dto);
    const [zone] = await this.db
      .insert(tables.deliveryZones)
      .values(this.zoneValues(dto))
      .returning();
    return zone;
  }

  async updateZone(id: string, dto: UpsertDeliveryZoneDto) {
    this.validateZone(dto);
    const [updated] = await this.db
      .update(tables.deliveryZones)
      .set({ ...this.zoneValues(dto), updatedAt: new Date() })
      .where(eq(tables.deliveryZones.id, id))
      .returning();
    if (!updated) throw new NotFoundException('Delivery zone not found');
    return updated;
  }

  async listSchedules(restaurantId: string) {
    await this.requireRestaurant(restaurantId);
    return this.db
      .select()
      .from(tables.restaurantSchedules)
      .where(eq(tables.restaurantSchedules.restaurantId, restaurantId))
      .orderBy(asc(tables.restaurantSchedules.dayOfWeek));
  }

  async upsertSchedule(restaurantId: string, dto: UpsertRestaurantScheduleDto) {
    await this.requireRestaurant(restaurantId);
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.opensAt) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(dto.closesAt)
    ) {
      throw new BadRequestException(
        'Opening times must use 24-hour HH:mm format',
      );
    }
    const values = {
      restaurantId,
      dayOfWeek: dto.dayOfWeek,
      opensAt: dto.opensAt,
      closesAt: dto.closesAt,
      isClosed: dto.isClosed ?? false,
      prepMinutes: dto.prepMinutes ?? 20,
      updatedAt: new Date(),
    };
    const [existing] = await this.db
      .select({ id: tables.restaurantSchedules.id })
      .from(tables.restaurantSchedules)
      .where(
        and(
          eq(tables.restaurantSchedules.restaurantId, restaurantId),
          eq(tables.restaurantSchedules.dayOfWeek, dto.dayOfWeek),
        ),
      );
    if (existing) {
      const [updated] = await this.db
        .update(tables.restaurantSchedules)
        .set(values)
        .where(eq(tables.restaurantSchedules.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await this.db
      .insert(tables.restaurantSchedules)
      .values(values)
      .returning();
    return created;
  }

  async listSupportTickets() {
    return this.db
      .select({
        ticket: tables.supportTickets,
        customer: {
          id: tables.user.id,
          firstName: tables.user.firstName,
          lastName: tables.user.lastName,
          email: tables.user.email,
        },
      })
      .from(tables.supportTickets)
      .leftJoin(
        tables.user,
        eq(tables.supportTickets.customerId, tables.user.id),
      )
      .orderBy(desc(tables.supportTickets.updatedAt))
      .limit(200);
  }

  async createSupportTicket(dto: CreateSupportTicketDto) {
    const [ticket] = await this.db
      .insert(tables.supportTickets)
      .values({
        orderId: dto.orderId,
        customerId: dto.customerId,
        subject: dto.subject.trim(),
        priority: dto.priority?.trim().toUpperCase() || 'NORMAL',
      })
      .returning();
    return ticket;
  }

  async updateSupportTicket(id: string, dto: UpdateSupportTicketDto) {
    const [updated] = await this.db
      .update(tables.supportTickets)
      .set({
        status: dto.status,
        assignedAdminId: dto.assignedAdminId,
        priority: dto.priority?.trim().toUpperCase(),
        updatedAt: new Date(),
      })
      .where(eq(tables.supportTickets.id, id))
      .returning();
    if (!updated) throw new NotFoundException('Support ticket not found');
    return updated;
  }

  async addSupportNote(
    ticketId: string,
    actorId: string,
    dto: AddSupportNoteDto,
  ) {
    const [ticket] = await this.db
      .select({ id: tables.supportTickets.id })
      .from(tables.supportTickets)
      .where(eq(tables.supportTickets.id, ticketId));
    if (!ticket) throw new NotFoundException('Support ticket not found');
    const [note] = await this.db
      .insert(tables.supportTicketNotes)
      .values({
        ticketId,
        authorId: actorId,
        body: dto.body.trim(),
        isInternal: dto.isInternal ?? true,
      })
      .returning();
    await this.db
      .update(tables.supportTickets)
      .set({ updatedAt: new Date() })
      .where(eq(tables.supportTickets.id, ticketId));
    return note;
  }

  async listCancellationReasons() {
    return this.db
      .select()
      .from(tables.cancellationReasons)
      .orderBy(
        asc(tables.cancellationReasons.sortOrder),
        asc(tables.cancellationReasons.label),
      );
  }

  async createCancellationReason(dto: CreateCancellationReasonDto) {
    const code = dto.code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_');
    try {
      const [reason] = await this.db
        .insert(tables.cancellationReasons)
        .values({
          code,
          label: dto.label.trim(),
          appliesTo: dto.appliesTo?.trim().toUpperCase() || 'ALL',
        })
        .returning();
      return reason;
    } catch {
      throw new ConflictException('Cancellation reason code already exists');
    }
  }

  async sendNotification(dto: SendNotificationDto) {
    const [recipient] = await this.db
      .select({ id: tables.user.id, pushToken: tables.user.pushToken })
      .from(tables.user)
      .where(eq(tables.user.id, dto.recipientId));
    if (!recipient) throw new NotFoundException('Recipient not found');
    const [delivery] = await this.db
      .insert(tables.notificationDeliveries)
      .values({
        recipientId: recipient.id,
        orderId: dto.orderId,
        title: dto.title.trim(),
        body: dto.body.trim(),
        payload: dto.payload ?? {},
        status: recipient.pushToken ? 'QUEUED' : 'FAILED',
        attempts: recipient.pushToken ? 0 : 1,
        lastError: recipient.pushToken ? null : 'No registered push token',
      })
      .returning();
    // Sending is intentionally asynchronous: a provider outage never blocks an
    // order intervention. The retry worker recovers QUEUED/RETRYING rows.
    if (recipient.pushToken) this.queuePushDelivery(delivery.id);
    return delivery;
  }

  /** Queues a transactional order update without exposing the admin API path. */
  async queueOrderNotification(
    recipientId: string,
    orderId: string,
    title: string,
    body: string,
  ) {
    return this.sendNotification({
      recipientId,
      orderId,
      title,
      body,
      payload: { orderId, type: 'ORDER_UPDATE' },
    });
  }

  async queueCustomerStatusNotification(order: {
    id: string;
    customerId: string;
    status: string;
  }) {
    const messages: Record<string, { title: string; body: string }> = {
      CONFIRMED: {
        title: 'Order confirmed',
        body: 'Your payment is confirmed. The restaurant will begin preparing shortly.',
      },
      PREPARING: {
        title: 'Your food is being prepared',
        body: 'The kitchen has started preparing your order.',
      },
      READY: {
        title: 'Ready for pickup',
        body: 'We are finding a rider for your order.',
      },
      PICKED_UP: {
        title: 'Your rider is on the way',
        body: 'Your order has left the restaurant.',
      },
      DELIVERED: {
        title: 'Order delivered',
        body: 'Enjoy your meal. You can rate your order in the app.',
      },
      CANCELLED: {
        title: 'Order cancelled',
        body: 'Your order was cancelled. Any eligible refund is being processed.',
      },
    };
    const message = messages[order.status];
    if (!message) return null;
    return this.queueOrderNotification(
      order.customerId,
      order.id,
      message.title,
      message.body,
    );
  }

  async queueRestaurantOwnerNewOrderNotification(order: {
    id: string;
    restaurantId: string;
  }) {
    const [restaurant] = await this.db
      .select({
        ownerId: tables.restaurants.ownerId,
        name: tables.restaurants.name,
      })
      .from(tables.restaurants)
      .where(eq(tables.restaurants.id, order.restaurantId));
    if (!restaurant) return null;
    return this.queueOrderNotification(
      restaurant.ownerId,
      order.id,
      'New paid order',
      `A new order is ready for ${restaurant.name}. Open your dashboard to start preparing.`,
    );
  }

  async listNotifications(recipientId?: string) {
    return this.db
      .select()
      .from(tables.notificationDeliveries)
      .where(
        recipientId
          ? eq(tables.notificationDeliveries.recipientId, recipientId)
          : undefined,
      )
      .orderBy(desc(tables.notificationDeliveries.createdAt))
      .limit(200);
  }

  async retryNotification(id: string) {
    const [delivery] = await this.db
      .select()
      .from(tables.notificationDeliveries)
      .where(eq(tables.notificationDeliveries.id, id));
    if (!delivery)
      throw new NotFoundException('Notification delivery not found');
    const [recipient] = delivery.recipientId
      ? await this.db
          .select({ pushToken: tables.user.pushToken })
          .from(tables.user)
          .where(eq(tables.user.id, delivery.recipientId))
      : [];
    if (!recipient?.pushToken)
      throw new BadRequestException('Recipient has no registered push token');
    await this.db
      .update(tables.notificationDeliveries)
      .set({
        status: 'RETRYING',
        // An explicit operations retry starts a fresh, bounded retry sequence.
        attempts: 0,
        lastError: null,
        providerMessageId: null,
        updatedAt: new Date(),
      })
      .where(eq(tables.notificationDeliveries.id, id));
    this.queuePushDelivery(id, true);
    return { queued: true };
  }

  async createSettlement(dto: CreateSettlementDto) {
    const start = new Date(dto.periodStart);
    const end = new Date(dto.periodEnd);
    if (!(start < end))
      throw new BadRequestException(
        'Settlement period end must be after its start',
      );
    await this.requireRestaurant(dto.restaurantId);
    const [revenue] = await this.db
      .select({
        total: sql<string>`coalesce(sum(${tables.orders.totalAmount}), 0)`,
      })
      .from(tables.orders)
      .where(
        and(
          eq(tables.orders.restaurantId, dto.restaurantId),
          eq(tables.orders.status, OrderStatus.DELIVERED),
          sql`${tables.orders.createdAt} >= ${start} and ${tables.orders.createdAt} < ${end}`,
        ),
      );
    const gross = Number(revenue?.total ?? 0);
    const rate = Number(dto.commissionRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100)
      throw new BadRequestException(
        'Commission rate must be between 0 and 100',
      );
    const commission = Number(((gross * rate) / 100).toFixed(2));
    const [settlement] = await this.db
      .insert(tables.restaurantSettlements)
      .values({
        restaurantId: dto.restaurantId,
        periodStart: start,
        periodEnd: end,
        grossAmount: gross.toFixed(2),
        commissionRate: rate.toFixed(2),
        commissionAmount: commission.toFixed(2),
        vatAmount: '0',
        netAmount: (gross - commission).toFixed(2),
      })
      .returning();
    return settlement;
  }

  async listSettlements() {
    return this.db
      .select({
        settlement: tables.restaurantSettlements,
        restaurant: {
          id: tables.restaurants.id,
          name: tables.restaurants.name,
        },
      })
      .from(tables.restaurantSettlements)
      .innerJoin(
        tables.restaurants,
        eq(tables.restaurantSettlements.restaurantId, tables.restaurants.id),
      )
      .orderBy(desc(tables.restaurantSettlements.periodEnd))
      .limit(200);
  }

  async setAdminAssignment(
    userId: string,
    actorId: string,
    dto: UpdateAdminAssignmentDto,
  ) {
    const [target] = await this.db
      .select({ id: tables.user.id, role: tables.user.role })
      .from(tables.user)
      .where(eq(tables.user.id, userId));
    if (!target || target.role !== UserRole.ADMIN)
      throw new BadRequestException(
        'Only an Admin account can receive an admin assignment',
      );
    const [existing] = await this.db
      .select({ userId: tables.adminAssignments.userId })
      .from(tables.adminAssignments)
      .where(eq(tables.adminAssignments.userId, userId));
    if (existing) {
      const [updated] = await this.db
        .update(tables.adminAssignments)
        .set({
          role: dto.role,
          permissions: [...new Set(dto.permissions)],
          updatedBy: actorId,
          updatedAt: new Date(),
        })
        .where(eq(tables.adminAssignments.userId, userId))
        .returning();
      return updated;
    }
    const [created] = await this.db
      .insert(tables.adminAssignments)
      .values({
        userId,
        role: dto.role,
        permissions: [...new Set(dto.permissions)],
        updatedBy: actorId,
      })
      .returning();
    return created;
  }

  async exportOrdersCsv() {
    const rows = await this.db
      .select({
        id: tables.orders.id,
        status: tables.orders.status,
        total: tables.orders.totalAmount,
        createdAt: tables.orders.createdAt,
        restaurant: tables.restaurants.name,
      })
      .from(tables.orders)
      .innerJoin(
        tables.restaurants,
        eq(tables.orders.restaurantId, tables.restaurants.id),
      )
      .orderBy(desc(tables.orders.createdAt))
      .limit(10_000);
    return this.toCsv(
      ['order_id', 'status', 'restaurant', 'total_aed', 'created_at'],
      rows.map((row) => [
        row.id,
        row.status,
        row.restaurant,
        row.total,
        row.createdAt.toISOString(),
      ]),
    );
  }

  /**
   * Sends one pending delivery. A database status transition acts as a short
   * lease so multiple API instances do not send the same queued row together.
   */
  private queuePushDelivery(deliveryId: string, force = false) {
    void this.deliverPush(deliveryId, force).catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Unknown push delivery error';
      this.logger.warn(
        `Could not process push delivery ${deliveryId}: ${message}`,
      );
    });
  }

  private async deliverPush(deliveryId: string, force = false) {
    if (this.pushDeliveriesInFlight.has(deliveryId)) return;
    this.pushDeliveriesInFlight.add(deliveryId);

    let storedToken: string | null = null;
    let claimed: typeof tables.notificationDeliveries.$inferSelect | undefined;

    try {
      const [delivery] = await this.db
        .select()
        .from(tables.notificationDeliveries)
        .where(eq(tables.notificationDeliveries.id, deliveryId));
      if (!delivery || !this.isPendingPushDelivery(delivery.status)) return;

      if (delivery.attempts >= pushRetryMaxAttempts && !force) {
        await this.markPushRetryLimitReached(deliveryId);
        return;
      }

      if (!force && !this.isPushRetryDue(delivery)) return;

      claimed = await this.claimPushDelivery(delivery, force);
      if (!claimed) return;

      storedToken = await this.getRecipientPushToken(claimed.recipientId);
      if (!storedToken) {
        throw new PushDeliveryError('No registered push token', false);
      }

      const { token, platform } = this.parseStoredPushToken(storedToken);
      const ticket = await this.sendExpoPush(claimed, token, platform);

      await this.db
        .update(tables.notificationDeliveries)
        .set({
          // SENT means Expo accepted the message. A provider receipt is still
          // required before it can be considered device-delivered.
          status: 'SENT',
          attempts: claimed.attempts + 1,
          providerMessageId: ticket.id ?? null,
          sentAt: new Date(),
          updatedAt: new Date(),
          lastError: null,
        })
        .where(
          and(
            eq(tables.notificationDeliveries.id, deliveryId),
            eq(tables.notificationDeliveries.status, 'RETRYING'),
          ),
        );
    } catch (error) {
      const pushError = this.toPushDeliveryError(error);
      await this.markPushDeliveryFailure(
        deliveryId,
        claimed,
        pushError,
        storedToken,
      );
    } finally {
      this.pushDeliveriesInFlight.delete(deliveryId);
    }
  }

  private async retryPendingPushDeliveries() {
    const pending = await this.db
      .select({
        id: tables.notificationDeliveries.id,
        status: tables.notificationDeliveries.status,
        attempts: tables.notificationDeliveries.attempts,
        updatedAt: tables.notificationDeliveries.updatedAt,
      })
      .from(tables.notificationDeliveries)
      .where(
        inArray(tables.notificationDeliveries.status, ['QUEUED', 'RETRYING']),
      )
      .orderBy(asc(tables.notificationDeliveries.updatedAt))
      .limit(pushRetryBatchSize);

    for (const delivery of pending) {
      if (delivery.attempts >= pushRetryMaxAttempts) {
        await this.markPushRetryLimitReached(delivery.id);
        continue;
      }
      if (!this.isPushRetryDue(delivery)) continue;
      await this.deliverPush(delivery.id);
    }
  }

  private isPendingPushDelivery(status: string) {
    return status === 'QUEUED' || status === 'RETRYING';
  }

  private isPushRetryDue(delivery: {
    status: string;
    attempts: number;
    updatedAt: Date;
  }) {
    if (delivery.status === 'QUEUED') return true;
    const exponent = Math.max(delivery.attempts - 1, 0);
    const delay = Math.min(
      pushRetryBaseDelayMs * 2 ** exponent,
      pushRetryMaxDelayMs,
    );
    return delivery.updatedAt.getTime() + delay <= Date.now();
  }

  private async claimPushDelivery(
    delivery: typeof tables.notificationDeliveries.$inferSelect,
    force: boolean,
  ) {
    const retryCondition = force
      ? inArray(tables.notificationDeliveries.status, ['QUEUED', 'RETRYING'])
      : delivery.status === 'QUEUED'
        ? eq(tables.notificationDeliveries.status, 'QUEUED')
        : and(
            eq(tables.notificationDeliveries.status, 'RETRYING'),
            lte(
              tables.notificationDeliveries.updatedAt,
              new Date(
                Date.now() -
                  Math.min(
                    pushRetryBaseDelayMs *
                      2 ** Math.max(delivery.attempts - 1, 0),
                    pushRetryMaxDelayMs,
                  ),
              ),
            ),
          );

    const [claimed] = await this.db
      .update(tables.notificationDeliveries)
      .set({ status: 'RETRYING', updatedAt: new Date() })
      .where(
        and(eq(tables.notificationDeliveries.id, delivery.id), retryCondition),
      )
      .returning();
    return claimed;
  }

  private async getRecipientPushToken(recipientId: string | null) {
    if (!recipientId) return null;
    const [recipient] = await this.db
      .select({ pushToken: tables.user.pushToken })
      .from(tables.user)
      .where(eq(tables.user.id, recipientId));
    return recipient?.pushToken ?? null;
  }

  private parseStoredPushToken(storedToken: string): {
    token: string;
    platform: 'android' | 'ios';
  } {
    const platform = storedToken.startsWith('ios:') ? 'ios' : 'android';
    const token = storedToken.replace(/^(android|ios):/, '');
    if (
      !token.startsWith('ExponentPushToken[') &&
      !token.startsWith('ExpoPushToken[')
    ) {
      throw new PushDeliveryError(
        'Registered token requires configured FCM/APNs provider',
        false,
      );
    }
    return { token, platform };
  }

  private async sendExpoPush(
    delivery: typeof tables.notificationDeliveries.$inferSelect,
    token: string,
    platform: 'android' | 'ios',
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), pushRequestTimeoutMs);
    try {
      let response: Response;
      try {
        response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: token,
            title: delivery.title,
            body: delivery.body,
            data: delivery.payload ?? {},
            sound: 'default',
            ...(platform === 'android'
              ? { channelId: 'active-order-tracking' }
              : {}),
          }),
          signal: controller.signal,
        });
      } catch (error) {
        const message =
          error instanceof Error && error.name === 'AbortError'
            ? 'Expo push provider timed out'
            : 'Could not reach Expo push provider';
        throw new PushDeliveryError(message, true);
      }

      if (!response.ok) {
        throw new PushDeliveryError(
          `Expo push provider returned ${response.status}`,
          response.status === 429 || response.status >= 500,
        );
      }

      let result: ExpoPushResponse;
      try {
        result = (await response.json()) as ExpoPushResponse;
      } catch {
        throw new PushDeliveryError(
          'Expo push provider returned invalid JSON',
          true,
        );
      }

      // Expo accepts a single message object and may return either a single
      // ticket or an array. Normalize both forms before deciding the outcome.
      const ticket = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!ticket) {
        throw new PushDeliveryError(
          'Expo push provider returned no delivery ticket',
          true,
        );
      }
      if (ticket.status !== 'ok') {
        const code = ticket.details?.error;
        throw new PushDeliveryError(
          code
            ? `Expo push ticket rejected (${code})`
            : 'Expo push ticket rejected',
          this.isTransientExpoError(code),
          code === 'DeviceNotRegistered',
        );
      }
      return ticket;
    } finally {
      clearTimeout(timeout);
    }
  }

  private isTransientExpoError(code: string | undefined) {
    return (
      code === 'MessageRateExceeded' ||
      code === 'InternalServerError' ||
      code === 'ServiceUnavailable'
    );
  }

  private toPushDeliveryError(error: unknown) {
    if (error instanceof PushDeliveryError) return error;
    const message =
      error instanceof Error
        ? error.message.slice(0, 500)
        : 'Unknown push delivery failure';
    // Database/network failures are usually transient; the bounded retry loop
    // prevents an unavailable provider from turning into an infinite job.
    return new PushDeliveryError(message, true);
  }

  private async markPushRetryLimitReached(deliveryId: string) {
    await this.db
      .update(tables.notificationDeliveries)
      .set({
        status: 'FAILED',
        lastError: 'Push retry limit reached',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tables.notificationDeliveries.id, deliveryId),
          inArray(tables.notificationDeliveries.status, ['QUEUED', 'RETRYING']),
        ),
      );
  }

  private async markPushDeliveryFailure(
    deliveryId: string,
    claimed: typeof tables.notificationDeliveries.$inferSelect | undefined,
    error: PushDeliveryError,
    storedToken: string | null,
  ) {
    // If the row was not claimed (for example, another API instance won the
    // lease), it must not be changed by this worker.
    if (!claimed) return;

    const attempts = claimed.attempts + 1;
    const shouldRetry = error.retryable && attempts < pushRetryMaxAttempts;
    await this.db
      .update(tables.notificationDeliveries)
      .set({
        status: shouldRetry ? 'RETRYING' : 'FAILED',
        attempts,
        providerMessageId: null,
        lastError: error.message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tables.notificationDeliveries.id, deliveryId),
          eq(tables.notificationDeliveries.status, 'RETRYING'),
        ),
      );

    if (error.unregisterDevice && claimed.recipientId && storedToken) {
      // Do not erase a fresh token registered by the user while this older
      // request was in flight.
      await this.db
        .update(tables.user)
        .set({ pushToken: null, updatedAt: new Date() })
        .where(
          and(
            eq(tables.user.id, claimed.recipientId),
            eq(tables.user.pushToken, storedToken),
          ),
        );
    }
  }

  private zoneValues(dto: UpsertDeliveryZoneDto) {
    return {
      name: dto.name.trim(),
      polygon: dto.polygon,
      baseFee: dto.baseFee,
      feePerKm: dto.feePerKm,
      minimumOrder: dto.minimumOrder,
      etaMinutes: dto.etaMinutes,
      isActive: dto.isActive ?? true,
    };
  }

  private validateZone(dto: UpsertDeliveryZoneDto) {
    if (dto.polygon.length < 3)
      throw new BadRequestException(
        'A delivery zone needs at least three boundary points',
      );
    for (const value of [dto.baseFee, dto.feePerKm, dto.minimumOrder]) {
      if (!Number.isFinite(Number(value)) || Number(value) < 0)
        throw new BadRequestException('Zone fees must be non-negative numbers');
    }
  }

  private async requireDriver(id: string) {
    const [driver] = await this.db
      .select()
      .from(tables.user)
      .where(
        and(eq(tables.user.id, id), eq(tables.user.role, UserRole.DRIVER)),
      );
    if (!driver) throw new NotFoundException('Driver not found');
    return driver;
  }

  private async requireRestaurant(id: string) {
    const [restaurant] = await this.db
      .select({ id: tables.restaurants.id })
      .from(tables.restaurants)
      .where(eq(tables.restaurants.id, id));
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return restaurant;
  }

  private async recordEvent(
    orderId: string | null,
    actorId: string,
    type: string,
    metadata: Record<string, unknown>,
  ) {
    if (!orderId) return;
    await this.db
      .insert(tables.orderEvents)
      .values({ orderId, actorId, type, metadata });
  }

  private toCsv(headers: string[], rows: Array<Array<string | number>>) {
    const escape = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`;
    return [
      headers.map(escape).join(','),
      ...rows.map((row) => row.map(escape).join(',')),
    ].join('\n');
  }
}
