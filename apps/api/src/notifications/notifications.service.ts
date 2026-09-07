import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { schema } from '../db/relations';
import * as tables from '../db/schema';

@Injectable()
export class NotificationsService {
  constructor(@Inject('DB') private readonly db: NeonDatabase<typeof schema>) {}

  async listMine(userId: string) {
    return this.db
      .select({
        id: tables.notificationDeliveries.id,
        orderId: tables.notificationDeliveries.orderId,
        title: tables.notificationDeliveries.title,
        body: tables.notificationDeliveries.body,
        status: tables.notificationDeliveries.status,
        readAt: tables.notificationDeliveries.readAt,
        createdAt: tables.notificationDeliveries.createdAt,
      })
      .from(tables.notificationDeliveries)
      .where(eq(tables.notificationDeliveries.recipientId, userId))
      .orderBy(desc(tables.notificationDeliveries.createdAt))
      .limit(100);
  }

  async markRead(userId: string, notificationId: string) {
    const [updated] = await this.db
      .update(tables.notificationDeliveries)
      .set({ readAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(tables.notificationDeliveries.id, notificationId),
          eq(tables.notificationDeliveries.recipientId, userId),
        ),
      )
      .returning({
        id: tables.notificationDeliveries.id,
        readAt: tables.notificationDeliveries.readAt,
      });
    if (!updated) throw new NotFoundException('Notification not found');
    return updated;
  }

  async markAllRead(userId: string) {
    await this.db
      .update(tables.notificationDeliveries)
      .set({ readAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(tables.notificationDeliveries.recipientId, userId),
          isNull(tables.notificationDeliveries.readAt),
        ),
      );
    return { updated: true };
  }
}
