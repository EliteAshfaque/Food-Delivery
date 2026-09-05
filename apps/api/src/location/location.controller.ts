import {
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { LocationService, type DriverCoordinates } from './location.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { schema as RelationsSchema } from '../db/relations';
import * as schema from '../db/schema';
import { OrderStatus, UserRole, type JwtPayload } from '@food-delivery/types';
import type { Request } from 'express';

type AuthRequest = Request & { user: JwtPayload };

@Controller('location')
@UseGuards(JwtAuthGuard)
export class LocationController {
  private readonly logger = new Logger(LocationController.name);

  constructor(
    private locationService: LocationService,
    @Inject('DB') private db: NeonDatabase<typeof RelationsSchema>,
  ) {}

  @Get(':orderId')
  getDriverLocation(
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Req() req: AuthRequest,
  ): Promise<DriverCoordinates | null> {
    return this.getAuthorizedDriverLocation(orderId, req.user);
  }

  private async getAuthorizedDriverLocation(
    orderId: string,
    user: JwtPayload,
  ): Promise<DriverCoordinates | null> {
    const [order] = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId));

    if (!order) throw new NotFoundException('Order not found');

    const isCustomer =
      user.role === UserRole.CUSTOMER && order.customerId === user.sub;
    const isDriver =
      user.role === UserRole.DRIVER && order.driverId === user.sub;
    const isOwner =
      user.role === UserRole.RESTAURANT_OWNER &&
      (await this.ownsRestaurant(user.sub, order.restaurantId));
    if (!isCustomer && !isDriver && !isOwner) {
      throw new NotFoundException('Order not found');
    }

    // Tracking data only exists during the handoff and delivery journey. This
    // also cleans up a legacy/stale Redis value created before terminal-state
    // cleanup was introduced.
    if (
      order.status !== OrderStatus.READY &&
      order.status !== OrderStatus.PICKED_UP
    ) {
      try {
        await this.locationService.deleteDriverLocation(orderId);
      } catch {
        // Location cleanup must not turn a valid order lookup into a 500. The
        // Redis TTL remains a fallback if the cache is temporarily unavailable.
        this.logger.warn('Could not clear expired driver location');
      }

      throw new NotFoundException(
        'Live driver location is not available for this order',
      );
    }

    return this.locationService.getDriverLocation(orderId);
  }

  private async ownsRestaurant(ownerId: string, restaurantId: string) {
    const [restaurant] = await this.db
      .select({ id: schema.restaurants.id })
      .from(schema.restaurants)
      .where(
        and(
          eq(schema.restaurants.id, restaurantId),
          eq(schema.restaurants.ownerId, ownerId),
        ),
      );
    return Boolean(restaurant);
  }
}
