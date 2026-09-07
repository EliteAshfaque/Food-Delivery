import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
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

@Injectable()
export class OperationsService {
  constructor(
    @Inject('DB') private readonly db: NeonDatabase<typeof schema>,
    private readonly ordersGateway: OrdersGateway,
  ) {}

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
        ),
      )
      .limit(1);
    if (busy)
      throw new ConflictException(
        'The selected driver already has an active delivery',
      );

    const [updated] = await this.db
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
        ),
      )
      .returning();
    if (!updated)
      throw new ConflictException('Order changed; refresh and try again');
    await this.recordEvent(orderId, actorId, 'ORDER_DRIVER_REASSIGNED', {
      previousDriverId: order.driverId,
      driverId: dto.driverId,
      note: dto.note?.trim() || null,
    });
    this.ordersGateway.emitDriverAssigned(dto.driverId, updated);
    this.ordersGateway.emitOrderUpdate(updated);
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
    // order intervention. A scheduled worker retries QUEUED/RETRYING rows.
    if (recipient.pushToken)
      void this.deliverPush(delivery.id, recipient.pushToken);
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
        body: 'The restaurant has received your order.',
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
      .set({ status: 'RETRYING', lastError: null, updatedAt: new Date() })
      .where(eq(tables.notificationDeliveries.id, id));
    void this.deliverPush(id, recipient.pushToken);
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

  private async deliverPush(deliveryId: string, storedToken: string) {
    const token = storedToken.replace(/^(android|ios):/, '');
    try {
      if (
        !token.startsWith('ExponentPushToken[') &&
        !token.startsWith('ExpoPushToken[')
      ) {
        throw new Error(
          'Registered token requires configured FCM/APNs provider',
        );
      }
      const [delivery] = await this.db
        .select()
        .from(tables.notificationDeliveries)
        .where(eq(tables.notificationDeliveries.id, deliveryId));
      if (!delivery) return;
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
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
        }),
      });
      if (!response.ok)
        throw new Error(`Push provider returned ${response.status}`);
      const result = (await response.json()) as {
        data?: { id?: string; status?: string; message?: string };
      };
      if (result.data?.status === 'error')
        throw new Error(
          result.data.message || 'Push provider rejected notification',
        );
      await this.db
        .update(tables.notificationDeliveries)
        .set({
          status: 'SENT',
          attempts: sql`${tables.notificationDeliveries.attempts} + 1`,
          providerMessageId: result.data?.id ?? null,
          sentAt: new Date(),
          updatedAt: new Date(),
          lastError: null,
        })
        .where(eq(tables.notificationDeliveries.id, deliveryId));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 500)
          : 'Unknown push delivery failure';
      await this.db
        .update(tables.notificationDeliveries)
        .set({
          status: 'FAILED',
          attempts: sql`${tables.notificationDeliveries.attempts} + 1`,
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(tables.notificationDeliveries.id, deliveryId));
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
