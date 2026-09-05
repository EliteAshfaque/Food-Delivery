import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { DefaultEventsMap, Server, Socket } from 'socket.io';
import { LocationService } from '../location/location.service';
import type { schema as RelationsSchema } from '../db/relations';
import * as schema from '../db/schema';
import { AccountStatus, UserRole, type JwtPayload } from '@food-delivery/types';

const socketCorsOrigins = (process.env.SOCKET_CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export interface DriverLocation {
  driverId: string;
  orderId: string;
  restaurantId: string;
  latitude: number;
  longitude: number;
}

// Socket.io defaults `data` to `any`; supply the fourth generic so
// authorization handlers cannot accidentally trust an untyped value.
type AuthenticatedSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  { user?: JwtPayload }
>;

@WebSocketGateway({
  cors: {
    origin:
      socketCorsOrigins.length > 0
        ? socketCorsOrigins
        : process.env.NODE_ENV === 'production'
          ? false
          : '*',
  },
  namespace: '/orders',
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(OrdersGateway.name);
  private readonly locationThrottleMs = 2_000;
  private readonly lastLocationUpdateAt = new Map<string, number>();

  constructor(
    private locationService: LocationService,
    @Inject('DB') private db: NeonDatabase<typeof RelationsSchema>,
    private jwtService: JwtService,
  ) {}

  @WebSocketServer()
  server!: Server;

  async handleConnection(client: AuthenticatedSocket) {
    const auth = client.handshake.auth as unknown;
    const token =
      typeof auth === 'object' && auth !== null && 'token' in auth
        ? (auth as { token?: unknown }).token
        : undefined;
    if (typeof token !== 'string' || !token) {
      client.disconnect();
      return;
    }

    try {
      const tokenPayload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const [dbUser] = await this.db
        .select({
          id: schema.user.id,
          email: schema.user.email,
          role: schema.user.role,
          accountStatus: schema.user.accountStatus,
        })
        .from(schema.user)
        .where(eq(schema.user.id, tokenPayload.sub));

      if (!dbUser || dbUser.accountStatus !== AccountStatus.ACTIVE) {
        client.disconnect();
        return;
      }

      // Resolve role from the database, not a possibly stale long-lived JWT.
      client.data.user = {
        sub: dbUser.id,
        email: dbUser.email ?? tokenPayload.email,
        role: dbUser.role,
      };
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:order')
  handleJoinOrder(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() orderId: string,
  ) {
    void this.joinOrderIfAuthorized(client, orderId);
  }

  private async joinOrderIfAuthorized(
    client: AuthenticatedSocket,
    orderId: string,
  ) {
    const user = client.data.user;
    if (!user || !this.isUuid(orderId)) return;

    const [order] = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId));
    if (!order) return;

    const isCustomer =
      user.role === UserRole.CUSTOMER && order.customerId === user.sub;
    const isDriver =
      user.role === UserRole.DRIVER && order.driverId === user.sub;
    const isOwner =
      user.role === UserRole.RESTAURANT_OWNER &&
      (await this.ownsRestaurant(user.sub, order.restaurantId));

    if (!isCustomer && !isDriver && !isOwner) return;
    await client.join(`order:${orderId}`);
  }

  @SubscribeMessage('join:restaurant')
  handleJoinRestaurant(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() restaurantId: string,
  ) {
    void this.joinRestaurantIfAuthorized(client, restaurantId);
  }

  private async joinRestaurantIfAuthorized(
    client: AuthenticatedSocket,
    restaurantId: string,
  ) {
    const user = client.data.user;
    if (
      !user ||
      user.role !== UserRole.RESTAURANT_OWNER ||
      !this.isUuid(restaurantId)
    )
      return;
    if (!(await this.ownsRestaurant(user.sub, restaurantId))) return;
    await client.join(`restaurant:${restaurantId}`);
  }

  @SubscribeMessage('join:driver')
  async handleJoinDriver(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() driverId: string,
  ) {
    const user = client.data.user;
    if (!this.isUuid(driverId)) return;
    if (user?.role !== UserRole.DRIVER || user.sub !== driverId) return;
    await client.join(`driver:${driverId}`);
  }

  @SubscribeMessage('driver:location')
  async handleDriverLocation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() location: unknown,
  ) {
    const user = client.data.user;
    if (user?.role !== UserRole.DRIVER) return;
    if (
      !this.isValidDriverLocation(location) ||
      location.driverId !== user.sub
    ) {
      this.emitLocationError(
        client,
        'INVALID_LOCATION',
        'Invalid location update.',
      );
      return;
    }

    const locationKey = `${user.sub}:${location.orderId}`;
    const now = Date.now();
    const lastUpdateAt = this.lastLocationUpdateAt.get(locationKey) ?? 0;
    if (now - lastUpdateAt < this.locationThrottleMs) return;

    try {
      const [order] = await this.db
        .select({
          driverId: schema.orders.driverId,
          restaurantId: schema.orders.restaurantId,
          status: schema.orders.status,
        })
        .from(schema.orders)
        .where(eq(schema.orders.id, location.orderId));

      if (
        !order ||
        order.driverId !== user.sub ||
        (order.status !== 'READY' && order.status !== 'PICKED_UP')
      ) {
        this.emitLocationError(
          client,
          'LOCATION_NOT_ALLOWED',
          'Location sharing is not active for this order.',
        );
        return;
      }

      const verifiedLocation: DriverLocation = {
        driverId: user.sub,
        orderId: location.orderId,
        restaurantId: order.restaurantId,
        latitude: location.latitude,
        longitude: location.longitude,
      };

      this.lastLocationUpdateAt.set(locationKey, now);

      // Persist so late-joining customers see the most recent valid position.
      await this.locationService.saveDriverLocation(
        verifiedLocation.orderId,
        verifiedLocation.latitude,
        verifiedLocation.longitude,
      );

      // Forward only the server-verified values to approved room members.
      this.server
        .to(`order:${verifiedLocation.orderId}`)
        .emit('driver:location', verifiedLocation);
      this.server
        .to(`restaurant:${verifiedLocation.restaurantId}`)
        .emit('driver:location', verifiedLocation);
    } catch (error) {
      this.logger.error(
        `Unable to process location update for driver ${user.sub}`,
        error instanceof Error ? error.stack : undefined,
      );
      this.emitLocationError(
        client,
        'LOCATION_UNAVAILABLE',
        'Could not share your location. Please try again.',
      );
    }
  }

  /** Disconnects a changed/suspended account from its current live rooms. */
  async disconnectUser(userId: string) {
    if (!this.server) return;

    const sockets = await this.server.fetchSockets();
    for (const socket of sockets) {
      const user = (socket.data as { user?: JwtPayload }).user;
      if (user?.sub === userId) {
        socket.disconnect(true);
      }
    }
  }

  private isValidDriverLocation(value: unknown): value is DriverLocation {
    if (typeof value !== 'object' || value === null) return false;

    const location = value as Partial<DriverLocation>;
    return (
      typeof location.driverId === 'string' &&
      this.isUuid(location.driverId) &&
      typeof location.orderId === 'string' &&
      this.isUuid(location.orderId) &&
      typeof location.latitude === 'number' &&
      Number.isFinite(location.latitude) &&
      location.latitude >= -90 &&
      location.latitude <= 90 &&
      typeof location.longitude === 'number' &&
      Number.isFinite(location.longitude) &&
      location.longitude >= -180 &&
      location.longitude <= 180
    );
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private emitLocationError(client: Socket, code: string, message: string) {
    client.emit('driver:location:error', { code, message });
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

  emitDriverAssigned(driverId: string, order: unknown) {
    this.server.to(`driver:${driverId}`).emit('driver:assigned', order);
  }

  emitOrderUpdate(order: {
    id: string;
    restaurantId: string;
    status: string;
    [key: string]: unknown;
  }) {
    this.server.to(`order:${order.id}`).emit('order:updated', order);
    this.server
      .to(`restaurant:${order.restaurantId}`)
      .emit('order:updated', order);
  }
}
