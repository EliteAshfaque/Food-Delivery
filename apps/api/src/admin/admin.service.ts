import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import {
  AccountStatus,
  OrderStatus,
  RestaurantModerationStatus,
  UserRole,
} from '@food-delivery/types';
import { schema } from '../db/relations';
import * as tables from '../db/schema';
import { isPostgresUniqueViolation } from '../db/is-unique-violation';
import { DriverService } from '../driver/driver.service';
import { OrdersGateway } from '../gateway/orders.gateway';
import { OffersService } from '../offers/offers.service';
import { PaymentsService } from '../payments/payment.service';
import { CreateAdminCategoryDto } from './dto/create-admin-category.dto';
import { CreateAdminMenuItemDto } from './dto/create-admin-menu-item.dto';
import { CreateAdminOfferDto } from './dto/create-admin-offer.dto';
import { CreateAdminRestaurantDto } from './dto/create-admin-restaurant.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ListAdminOffersQueryDto } from './dto/list-admin-offers-query.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { ListRestaurantsQueryDto } from './dto/list-restaurants-query.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { UpdateAdminCategoryDto } from './dto/update-admin-category.dto';
import { UpdateAdminMenuItemDto } from './dto/update-admin-menu-item.dto';
import { UpdateAdminOrderStatusDto } from './dto/update-admin-order-status.dto';
import { UpdateAdminOfferDto } from './dto/update-admin-offer.dto';
import { UpdateAdminRestaurantDto } from './dto/update-admin-restaurant.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdateRestaurantModerationDto } from './dto/update-restaurant-moderation.dto';

type Pagination = Pick<PaginationQueryDto, 'page' | 'pageSize'>;

@Injectable()
export class AdminService {
  constructor(
    @Inject('DB') private readonly db: NeonDatabase<typeof schema>,
    private readonly ordersGateway: OrdersGateway,
    private readonly offersService: OffersService,
    private readonly driverService: DriverService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async getDashboard() {
    const [
      usersByRole,
      usersByAccountStatus,
      restaurantsByStatus,
      ordersByStatus,
      completedRevenue,
      pendingUsers,
      pendingRestaurants,
    ] = await Promise.all([
      this.db
        .select({
          role: tables.user.role,
          total: sql<number>`count(*)::int`,
        })
        .from(tables.user)
        .groupBy(tables.user.role),
      this.db
        .select({
          status: tables.user.accountStatus,
          total: sql<number>`count(*)::int`,
        })
        .from(tables.user)
        .groupBy(tables.user.accountStatus),
      this.db
        .select({
          status: tables.restaurants.moderationStatus,
          total: sql<number>`count(*)::int`,
        })
        .from(tables.restaurants)
        .groupBy(tables.restaurants.moderationStatus),
      this.db
        .select({
          status: tables.orders.status,
          total: sql<number>`count(*)::int`,
        })
        .from(tables.orders)
        .groupBy(tables.orders.status),
      this.db
        .select({
          total: sql<string>`coalesce(sum(${tables.orders.totalAmount}), 0)`,
        })
        .from(tables.orders)
        .where(eq(tables.orders.status, OrderStatus.DELIVERED)),
      this.countRows(
        tables.user,
        eq(tables.user.accountStatus, AccountStatus.PENDING_APPROVAL),
      ),
      this.countRows(
        tables.restaurants,
        eq(
          tables.restaurants.moderationStatus,
          RestaurantModerationStatus.PENDING_APPROVAL,
        ),
      ),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      users: {
        byRole: this.toCountMap(usersByRole, 'role'),
        byAccountStatus: this.toCountMap(usersByAccountStatus, 'status'),
        pendingApproval: pendingUsers,
      },
      restaurants: {
        byModerationStatus: this.toCountMap(restaurantsByStatus, 'status'),
        pendingApproval: pendingRestaurants,
      },
      orders: {
        byStatus: this.toCountMap(ordersByStatus, 'status'),
        completedRevenue: completedRevenue[0]?.total ?? '0',
      },
    };
  }

  async listUsers(query: ListUsersQueryDto) {
    const conditions: SQL[] = [];
    if (query.role) conditions.push(eq(tables.user.role, query.role));
    if (query.accountStatus) {
      conditions.push(eq(tables.user.accountStatus, query.accountStatus));
    }
    if (query.search?.trim()) {
      const search = `%${this.escapeLike(query.search.trim())}%`;
      conditions.push(
        or(
          ilike(tables.user.firstName, search),
          ilike(tables.user.lastName, search),
          ilike(tables.user.email, search),
        )!,
      );
    }

    const where = this.andConditions(conditions);
    const [items, total] = await Promise.all([
      this.db
        .select({
          id: tables.user.id,
          firstName: tables.user.firstName,
          lastName: tables.user.lastName,
          email: tables.user.email,
          role: tables.user.role,
          accountStatus: tables.user.accountStatus,
          accountStatusReason: tables.user.accountStatusReason,
          accountStatusUpdatedAt: tables.user.accountStatusUpdatedAt,
          isOnline: tables.user.isOnline,
          // Administrators need to know whether a recipient can receive a
          // mobile push, but must never receive the token value itself.
          hasPushToken: sql<boolean>`${tables.user.pushToken} is not null`,
          createdAt: tables.user.createdAt,
          updatedAt: tables.user.updatedAt,
        })
        .from(tables.user)
        .where(where)
        .orderBy(desc(tables.user.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.countRows(tables.user, where),
    ]);

    return this.paginated(items, query, total);
  }

  async createUser(actorId: string, dto: CreateAdminUserDto) {
    const email = dto.email.trim().toLowerCase();
    const [existing] = await this.db
      .select({ id: tables.user.id })
      .from(tables.user)
      .where(sql`lower(${tables.user.email}) = ${email}`);
    if (existing) throw new ConflictException('Email already exists');

    const activateImmediately = dto.activateImmediately === true;
    const accountStatus =
      dto.accountStatus ??
      (activateImmediately || dto.role === UserRole.CUSTOMER
        ? AccountStatus.ACTIVE
        : dto.role === UserRole.ADMIN
          ? AccountStatus.ACTIVE
          : AccountStatus.PENDING_APPROVAL);

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    let created: typeof tables.user.$inferSelect;
    try {
      [created] = await this.db
        .insert(tables.user)
        .values({
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          email,
          password: hashedPassword,
          role: dto.role,
          accountStatus,
          accountStatusReason: activateImmediately
            ? 'Created and activated by administrator'
            : null,
          accountStatusUpdatedAt: new Date(),
          isOnline: false,
        })
        .returning();
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException('Email already exists');
      }
      throw error;
    }

    await this.recordAudit(actorId, 'USER_CREATED', 'USER', created.id, {
      role: created.role,
      accountStatus: created.accountStatus,
      email: created.email,
    });

    const {
      password: _password,
      googleSubject: _g,
      pushToken: _p,
      ...safe
    } = created;
    void _password;
    void _g;
    void _p;
    return safe;
  }

  async createRestaurant(actorId: string, dto: CreateAdminRestaurantDto) {
    if ((dto.latitude == null) !== (dto.longitude == null)) {
      throw new BadRequestException(
        'Provide both latitude and longitude, or neither',
      );
    }

    const [owner] = await this.db
      .select()
      .from(tables.user)
      .where(eq(tables.user.id, dto.ownerId));
    if (!owner) throw new NotFoundException('Owner account not found');
    if (owner.role !== UserRole.RESTAURANT_OWNER) {
      throw new BadRequestException(
        'Restaurants can only be attached to restaurant owner accounts',
      );
    }
    if (owner.accountStatus !== AccountStatus.ACTIVE) {
      throw new BadRequestException(
        'Activate the restaurant owner account before creating their restaurant',
      );
    }

    const [existing] = await this.db
      .select({ id: tables.restaurants.id })
      .from(tables.restaurants)
      .where(eq(tables.restaurants.ownerId, dto.ownerId))
      .limit(1);
    if (existing) {
      throw new ConflictException('This owner already has a restaurant');
    }

    const approveImmediately = dto.approveImmediately !== false;
    const now = new Date();
    let restaurant: typeof tables.restaurants.$inferSelect;
    try {
      [restaurant] = await this.db
        .insert(tables.restaurants)
        .values({
          ownerId: dto.ownerId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          address: dto.address.trim(),
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          cuisineType: dto.cuisineType.trim(),
          imageUrl: dto.imageUrl?.trim() || null,
          moderationStatus: approveImmediately
            ? RestaurantModerationStatus.APPROVED
            : RestaurantModerationStatus.PENDING_APPROVAL,
          moderationNote: approveImmediately
            ? 'Created and approved by administrator'
            : null,
          moderatedAt: approveImmediately ? now : null,
          moderatedBy: approveImmediately ? actorId : null,
          isOpen: false,
        })
        .returning();
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException('This owner already has a restaurant');
      }
      throw error;
    }

    await this.recordAudit(
      actorId,
      'RESTAURANT_CREATED',
      'RESTAURANT',
      restaurant.id,
      {
        ownerId: restaurant.ownerId,
        moderationStatus: restaurant.moderationStatus,
        name: restaurant.name,
      },
    );

    return restaurant;
  }

  async updateRestaurant(
    restaurantId: string,
    actorId: string,
    dto: UpdateAdminRestaurantDto,
  ) {
    const [existing] = await this.db
      .select()
      .from(tables.restaurants)
      .where(eq(tables.restaurants.id, restaurantId));
    if (!existing) throw new NotFoundException('Restaurant not found');

    if (
      (dto.latitude !== undefined && dto.longitude === undefined) ||
      (dto.longitude !== undefined && dto.latitude === undefined)
    ) {
      throw new BadRequestException(
        'Provide both latitude and longitude together',
      );
    }

    const [restaurant] = await this.db
      .update(tables.restaurants)
      .set({
        name: dto.name?.trim() ?? existing.name,
        description:
          dto.description === undefined
            ? existing.description
            : dto.description?.trim() || null,
        address: dto.address?.trim() ?? existing.address,
        latitude: dto.latitude === undefined ? existing.latitude : dto.latitude,
        longitude:
          dto.longitude === undefined ? existing.longitude : dto.longitude,
        cuisineType: dto.cuisineType?.trim() ?? existing.cuisineType,
        imageUrl:
          dto.imageUrl === undefined
            ? existing.imageUrl
            : dto.imageUrl?.trim() || null,
        isOpen: dto.isOpen ?? existing.isOpen,
        updatedAt: new Date(),
      })
      .where(eq(tables.restaurants.id, restaurantId))
      .returning();

    await this.recordAudit(
      actorId,
      'RESTAURANT_UPDATED',
      'RESTAURANT',
      restaurantId,
      { fields: Object.keys(dto) },
    );

    return restaurant;
  }

  async listRestaurantCategories(restaurantId: string) {
    await this.requireRestaurant(restaurantId);
    return this.db
      .select()
      .from(tables.menuCategories)
      .where(eq(tables.menuCategories.restaurantId, restaurantId))
      .orderBy(asc(tables.menuCategories.name));
  }

  async createRestaurantCategory(
    restaurantId: string,
    actorId: string,
    dto: CreateAdminCategoryDto,
  ) {
    await this.requireRestaurant(restaurantId);

    const [existing] = await this.db
      .select({ id: tables.menuCategories.id })
      .from(tables.menuCategories)
      .where(
        and(
          eq(tables.menuCategories.restaurantId, restaurantId),
          sql`lower(${tables.menuCategories.name}) = ${dto.name.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (existing) {
      throw new ConflictException('A category with this name already exists');
    }

    let category: typeof tables.menuCategories.$inferSelect;
    try {
      [category] = await this.db
        .insert(tables.menuCategories)
        .values({ restaurantId, name: dto.name })
        .returning();
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException('A category with this name already exists');
      }
      throw error;
    }

    await this.recordAudit(
      actorId,
      'MENU_CATEGORY_CREATED',
      'MENU_CATEGORY',
      category.id,
      { restaurantId, name: category.name },
    );

    return category;
  }

  async updateRestaurantCategory(
    restaurantId: string,
    categoryId: string,
    actorId: string,
    dto: UpdateAdminCategoryDto,
  ) {
    const category = await this.requireCategoryForRestaurant(
      restaurantId,
      categoryId,
    );

    const [duplicate] = await this.db
      .select({ id: tables.menuCategories.id })
      .from(tables.menuCategories)
      .where(
        and(
          eq(tables.menuCategories.restaurantId, restaurantId),
          sql`lower(${tables.menuCategories.name}) = ${dto.name.toLowerCase()}`,
          ne(tables.menuCategories.id, categoryId),
        ),
      )
      .limit(1);
    if (duplicate) {
      throw new ConflictException('A category with this name already exists');
    }

    let updated: typeof tables.menuCategories.$inferSelect;
    try {
      [updated] = await this.db
        .update(tables.menuCategories)
        .set({ name: dto.name })
        .where(eq(tables.menuCategories.id, categoryId))
        .returning();
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException('A category with this name already exists');
      }
      throw error;
    }

    await this.recordAudit(
      actorId,
      'MENU_CATEGORY_UPDATED',
      'MENU_CATEGORY',
      categoryId,
      { restaurantId, from: category.name, to: updated.name },
    );

    return updated;
  }

  async deleteRestaurantCategory(
    restaurantId: string,
    categoryId: string,
    actorId: string,
  ) {
    const category = await this.requireCategoryForRestaurant(
      restaurantId,
      categoryId,
    );

    const [item] = await this.db
      .select({ id: tables.menuItems.id })
      .from(tables.menuItems)
      .where(eq(tables.menuItems.categoryId, categoryId))
      .limit(1);
    if (item) {
      throw new ConflictException(
        'This category still has menu items. Move or remove them first.',
      );
    }

    await this.db
      .delete(tables.menuCategories)
      .where(eq(tables.menuCategories.id, categoryId));

    await this.recordAudit(
      actorId,
      'MENU_CATEGORY_DELETED',
      'MENU_CATEGORY',
      categoryId,
      { restaurantId, name: category.name },
    );

    return { message: 'Category deleted successfully' };
  }

  async listRestaurantMenuItems(restaurantId: string) {
    await this.requireRestaurant(restaurantId);
    return this.db
      .select()
      .from(tables.menuItems)
      .where(eq(tables.menuItems.restaurantId, restaurantId))
      .orderBy(asc(tables.menuItems.name));
  }

  async createRestaurantMenuItem(
    restaurantId: string,
    actorId: string,
    dto: CreateAdminMenuItemDto,
  ) {
    await this.requireCategoryForRestaurant(restaurantId, dto.categoryId);
    this.assertPositiveMenuPrice(dto.price);

    const [item] = await this.db
      .insert(tables.menuItems)
      .values({
        restaurantId,
        categoryId: dto.categoryId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        price: dto.price,
        imageUrl: dto.imageUrl?.trim() || null,
      })
      .returning();

    await this.recordAudit(actorId, 'MENU_ITEM_CREATED', 'MENU_ITEM', item.id, {
      restaurantId,
      categoryId: item.categoryId,
      name: item.name,
    });

    return item;
  }

  async updateRestaurantMenuItem(
    restaurantId: string,
    itemId: string,
    actorId: string,
    dto: UpdateAdminMenuItemDto,
  ) {
    const existing = await this.requireMenuItemForRestaurant(
      restaurantId,
      itemId,
    );

    if (
      dto.categoryId === undefined &&
      dto.name === undefined &&
      dto.description === undefined &&
      dto.price === undefined &&
      dto.imageUrl === undefined &&
      dto.isAvailable === undefined
    ) {
      throw new BadRequestException(
        'Provide at least one item field to update',
      );
    }

    if (dto.categoryId) {
      await this.requireCategoryForRestaurant(restaurantId, dto.categoryId);
    }
    if (dto.price !== undefined) this.assertPositiveMenuPrice(dto.price);

    const [updated] = await this.db
      .update(tables.menuItems)
      .set({
        categoryId: dto.categoryId ?? existing.categoryId,
        name: dto.name?.trim() ?? existing.name,
        description:
          dto.description === undefined
            ? existing.description
            : dto.description?.trim() || null,
        price: dto.price ?? existing.price,
        imageUrl:
          dto.imageUrl === undefined
            ? existing.imageUrl
            : dto.imageUrl?.trim() || null,
        isAvailable: dto.isAvailable ?? existing.isAvailable,
        updatedAt: new Date(),
      })
      .where(eq(tables.menuItems.id, itemId))
      .returning();

    await this.recordAudit(actorId, 'MENU_ITEM_UPDATED', 'MENU_ITEM', itemId, {
      restaurantId,
      fields: Object.keys(dto),
    });

    return updated;
  }

  async deleteRestaurantMenuItem(
    restaurantId: string,
    itemId: string,
    actorId: string,
  ) {
    const existing = await this.requireMenuItemForRestaurant(
      restaurantId,
      itemId,
    );

    const [orderedItem] = await this.db
      .select({ id: tables.orderItems.id })
      .from(tables.orderItems)
      .where(eq(tables.orderItems.menuItemId, itemId))
      .limit(1);
    if (orderedItem) {
      throw new ConflictException(
        'This menu item appears in an order. Mark it unavailable instead.',
      );
    }

    await this.db
      .delete(tables.menuItems)
      .where(eq(tables.menuItems.id, itemId));

    await this.recordAudit(actorId, 'MENU_ITEM_DELETED', 'MENU_ITEM', itemId, {
      restaurantId,
      name: existing.name,
    });

    return { message: 'Item deleted' };
  }

  async createOffer(actorId: string, dto: CreateAdminOfferDto) {
    const [restaurant] = await this.db
      .select({
        id: tables.restaurants.id,
        moderationStatus: tables.restaurants.moderationStatus,
      })
      .from(tables.restaurants)
      .where(eq(tables.restaurants.id, dto.restaurantId));
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    if (restaurant.moderationStatus !== RestaurantModerationStatus.APPROVED) {
      throw new BadRequestException(
        'Approve the restaurant before creating offers for it',
      );
    }

    const { restaurantId, isFeatured, sortOrder, ...offerFields } = dto;
    const offer = await this.offersService.createForRestaurant(
      restaurantId,
      offerFields,
      { isFeatured, sortOrder },
    );

    await this.recordAudit(actorId, 'OFFER_CREATED', 'OFFER', offer.id, {
      restaurantId,
      title: offer.title,
      isFeatured: offer.isFeatured,
    });

    return offer;
  }

  async listOfferRedemptions(offerId: string, query: PaginationQueryDto) {
    const [offer] = await this.db
      .select({ id: tables.offers.id, title: tables.offers.title })
      .from(tables.offers)
      .where(eq(tables.offers.id, offerId));
    if (!offer) throw new NotFoundException('Offer not found');

    const where = eq(tables.offerRedemptions.offerId, offerId);
    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          id: tables.offerRedemptions.id,
          orderId: tables.offerRedemptions.orderId,
          discountAmount: tables.offerRedemptions.discountAmount,
          status: tables.offerRedemptions.status,
          expiresAt: tables.offerRedemptions.expiresAt,
          redeemedAt: tables.offerRedemptions.redeemedAt,
          releasedAt: tables.offerRedemptions.releasedAt,
          createdAt: tables.offerRedemptions.createdAt,
          customer: {
            id: tables.user.id,
            firstName: tables.user.firstName,
            lastName: tables.user.lastName,
            email: tables.user.email,
          },
        })
        .from(tables.offerRedemptions)
        .innerJoin(
          tables.user,
          eq(tables.offerRedemptions.customerId, tables.user.id),
        )
        .where(where)
        .orderBy(desc(tables.offerRedemptions.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(tables.offerRedemptions)
        .where(where),
    ]);

    return {
      offer,
      ...this.paginated(rows, query, Number(countResult[0]?.total ?? 0)),
    };
  }

  async updateUser(
    targetUserId: string,
    actorId: string,
    dto: UpdateAdminUserDto,
  ) {
    if (
      !dto.role &&
      !dto.accountStatus &&
      dto.accountStatusReason === undefined
    ) {
      throw new BadRequestException(
        'Provide a role, account status, or status reason',
      );
    }

    if (targetUserId === actorId) {
      throw new BadRequestException(
        'Administrators cannot change their own role or account status',
      );
    }

    const [target] = await this.db
      .select()
      .from(tables.user)
      .where(eq(tables.user.id, targetUserId));
    if (!target) throw new NotFoundException('User not found');

    const changedStatus =
      dto.accountStatus !== undefined &&
      dto.accountStatus !== target.accountStatus;
    const changedRole = dto.role !== undefined && dto.role !== target.role;
    const nextRole = dto.role ?? target.role;
    const nextStatus = dto.accountStatus ?? target.accountStatus;
    // Keep a decision reason while an account remains suspended/rejected, but
    // clear an old rejection/suspension note once the account is restored.
    // This prevents stale, alarming messages from being shown after approval.
    const nextAccountStatusReason =
      dto.accountStatusReason === undefined
        ? changedStatus
          ? null
          : target.accountStatusReason
        : dto.accountStatusReason.trim() || null;

    if (
      (nextStatus === AccountStatus.SUSPENDED ||
        nextStatus === AccountStatus.REJECTED) &&
      !nextAccountStatusReason
    ) {
      throw new BadRequestException(
        'A status reason is required when suspending or rejecting an account',
      );
    }

    const shouldGoOffline =
      nextStatus !== AccountStatus.ACTIVE || nextRole !== UserRole.DRIVER;
    const removesDriverAccess =
      target.role === UserRole.DRIVER &&
      (nextStatus !== AccountStatus.ACTIVE || nextRole !== UserRole.DRIVER);
    const removesOwnerAccess =
      target.role === UserRole.RESTAURANT_OWNER &&
      (nextStatus !== AccountStatus.ACTIVE ||
        nextRole !== UserRole.RESTAURANT_OWNER);

    const removesLastActiveAdmin =
      target.role === UserRole.ADMIN &&
      target.accountStatus === AccountStatus.ACTIVE &&
      (nextRole !== UserRole.ADMIN || nextStatus !== AccountStatus.ACTIVE);
    const activeDriverOrders = removesDriverAccess
      ? await this.db
          .select({
            id: tables.orders.id,
            status: tables.orders.status,
            driverAcceptedAt: tables.orders.driverAcceptedAt,
          })
          .from(tables.orders)
          .where(
            and(
              eq(tables.orders.driverId, targetUserId),
              inArray(tables.orders.status, [
                OrderStatus.READY,
                OrderStatus.PICKED_UP,
              ]),
              isNull(tables.orders.cancellationRequestedAt),
            ),
          )
      : [];

    if (
      activeDriverOrders.some((order) => order.status === OrderStatus.PICKED_UP)
    ) {
      throw new BadRequestException(
        'This driver has a picked-up order. Resolve that delivery before changing the driver account.',
      );
    }

    if (removesOwnerAccess) {
      const ownedRestaurants = await this.db
        .select({ id: tables.restaurants.id })
        .from(tables.restaurants)
        .where(eq(tables.restaurants.ownerId, targetUserId));
      const restaurantIds = ownedRestaurants.map((restaurant) => restaurant.id);
      if (restaurantIds.length > 0) {
        const [activeOrder] = await this.db
          .select({ id: tables.orders.id })
          .from(tables.orders)
          .where(
            and(
              inArray(tables.orders.restaurantId, restaurantIds),
              inArray(tables.orders.status, [
                OrderStatus.PENDING,
                OrderStatus.CONFIRMED,
                OrderStatus.PREPARING,
                OrderStatus.READY,
                OrderStatus.PICKED_UP,
              ]),
            ),
          )
          .limit(1);
        if (activeOrder) {
          throw new BadRequestException(
            'Resolve this owner’s active orders before changing their account access.',
          );
        }
      }
    }

    const updateValues = {
      role: nextRole,
      accountStatus: nextStatus,
      accountStatusReason: nextAccountStatusReason,
      accountStatusUpdatedAt:
        changedStatus || changedRole || dto.accountStatusReason !== undefined
          ? new Date()
          : target.accountStatusUpdatedAt,
      isOnline: shouldGoOffline ? false : target.isOnline,
      updatedAt: new Date(),
    };
    const returningFields = {
      id: tables.user.id,
      firstName: tables.user.firstName,
      lastName: tables.user.lastName,
      email: tables.user.email,
      role: tables.user.role,
      accountStatus: tables.user.accountStatus,
      accountStatusReason: tables.user.accountStatusReason,
      accountStatusUpdatedAt: tables.user.accountStatusUpdatedAt,
      isOnline: tables.user.isOnline,
      createdAt: tables.user.createdAt,
      updatedAt: tables.user.updatedAt,
    };
    // Do not apply a stale administrator decision over a newer role/status
    // change. This also closes the promotion-then-suspension variant of the
    // last-admin race guarded below.
    const targetStateCondition = and(
      eq(tables.user.id, targetUserId),
      eq(tables.user.role, target.role),
      eq(tables.user.accountStatus, target.accountStatus),
    );

    // Serialise only the destructive "last admin" path. A simple count then
    // update is racy: two administrators could each see a count of two and
    // concurrently demote one another. PostgreSQL releases this transaction
    // advisory lock automatically even if the request fails.
    const updatedRows = removesLastActiveAdmin
      ? await this.db.transaction(async (tx) => {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext('active-admin-account-guard'))`,
          );
          const [activeAdmin] = await tx
            .select({ total: sql<number>`count(*)::int` })
            .from(tables.user)
            .where(
              and(
                eq(tables.user.role, UserRole.ADMIN),
                eq(tables.user.accountStatus, AccountStatus.ACTIVE),
              ),
            );
          if (Number(activeAdmin?.total ?? 0) <= 1) {
            throw new BadRequestException(
              'At least one active administrator must remain',
            );
          }

          return tx
            .update(tables.user)
            .set(updateValues)
            .where(targetStateCondition)
            .returning(returningFields);
        })
      : await this.db
          .update(tables.user)
          .set(updateValues)
          .where(targetStateCondition)
          .returning(returningFields);
    const [updated] = updatedRows;

    if (!updated) {
      throw new ConflictException(
        'This account changed. Refresh and try again',
      );
    }

    const reassignedOrderIds: string[] = [];
    const unassignedOrderIds: string[] = [];
    let closedRestaurantIds: string[] = [];
    if (removesOwnerAccess) {
      // Closing is deliberate rather than silently changing moderation state:
      // after a valid reactivation, the owner can reopen the already-approved
      // restaurant. Public reads and checkout also require an ACTIVE owner.
      const closedRestaurants = await this.db
        .update(tables.restaurants)
        .set({ isOpen: false, updatedAt: new Date() })
        .where(
          and(
            eq(tables.restaurants.ownerId, targetUserId),
            eq(tables.restaurants.isOpen, true),
          ),
        )
        .returning({ id: tables.restaurants.id });
      closedRestaurantIds = closedRestaurants.map(
        (restaurant) => restaurant.id,
      );
    }
    for (const activeOrder of activeDriverOrders) {
      // Include the old driver and READY state in the update condition to avoid
      // unassigning an order that changed state during this admin action.
      const unassignedOrder = await this.db.transaction(async (tx) => {
        const [nextOrder] = await tx
          .update(tables.orders)
          .set({
            driverId: null,
            driverAcceptedAt: null,
            driverDeclineReason: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(tables.orders.id, activeOrder.id),
              eq(tables.orders.driverId, targetUserId),
              eq(tables.orders.status, OrderStatus.READY),
              isNull(tables.orders.cancellationRequestedAt),
            ),
          )
          .returning();
        if (!nextOrder) return null;

        await tx.insert(tables.orderEvents).values({
          orderId: nextOrder.id,
          actorId,
          type: 'ORDER_DRIVER_UNASSIGNED',
          metadata: {
            previousDriverId: targetUserId,
            reason: 'DRIVER_ACCOUNT_UNAVAILABLE',
          },
        });
        return nextOrder;
      });

      if (!unassignedOrder) continue;

      this.ordersGateway.emitDriverOfferRevoked(
        targetUserId,
        unassignedOrder.id,
        activeOrder.driverAcceptedAt
          ? 'This delivery was released because your driver account is unavailable.'
          : 'This pickup offer was released because your driver account is unavailable.',
      );

      const reassigned = await this.driverService.assignDriver(
        activeOrder.id,
        targetUserId,
      );
      if (reassigned) {
        reassignedOrderIds.push(activeOrder.id);
      } else {
        unassignedOrderIds.push(activeOrder.id);
        this.ordersGateway.emitOrderUpdate(unassignedOrder);
      }
    }

    await this.recordAudit(actorId, 'USER_UPDATED', 'USER', targetUserId, {
      previousRole: target.role,
      role: updated.role,
      previousAccountStatus: target.accountStatus,
      accountStatus: updated.accountStatus,
      reason: updated.accountStatusReason,
      closedRestaurantIds,
      reassignedReadyOrderIds: reassignedOrderIds,
      unassignedReadyOrderIds: unassignedOrderIds,
    });

    if (changedStatus || changedRole) {
      await this.ordersGateway.disconnectUser(targetUserId);
    }

    return updated;
  }

  async listRestaurants(query: ListRestaurantsQueryDto) {
    const conditions: SQL[] = [];
    if (query.moderationStatus) {
      conditions.push(
        eq(tables.restaurants.moderationStatus, query.moderationStatus),
      );
    }
    if (query.search?.trim()) {
      const search = `%${this.escapeLike(query.search.trim())}%`;
      conditions.push(
        or(
          ilike(tables.restaurants.name, search),
          ilike(tables.restaurants.cuisineType, search),
          ilike(tables.restaurants.address, search),
        )!,
      );
    }

    const where = this.andConditions(conditions);
    const [items, total] = await Promise.all([
      this.db
        .select({
          restaurant: tables.restaurants,
          owner: {
            id: tables.user.id,
            firstName: tables.user.firstName,
            lastName: tables.user.lastName,
            email: tables.user.email,
            role: tables.user.role,
            accountStatus: tables.user.accountStatus,
          },
        })
        .from(tables.restaurants)
        .innerJoin(tables.user, eq(tables.restaurants.ownerId, tables.user.id))
        .where(where)
        .orderBy(desc(tables.restaurants.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.countRows(tables.restaurants, where),
    ]);

    return this.paginated(items, query, total);
  }

  async updateRestaurantModeration(
    restaurantId: string,
    actorId: string,
    dto: UpdateRestaurantModerationDto,
  ) {
    const [restaurant] = await this.db
      .select()
      .from(tables.restaurants)
      .where(eq(tables.restaurants.id, restaurantId));
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    const moderationStatusChanged =
      dto.moderationStatus !== restaurant.moderationStatus;
    // A rejection/suspension explanation remains attached to that decision,
    // but is not carried forward after the restaurant is approved or returned
    // to review.
    const nextModerationNote =
      dto.moderationNote === undefined
        ? moderationStatusChanged
          ? null
          : restaurant.moderationNote
        : dto.moderationNote.trim() || null;

    if (
      (dto.moderationStatus === RestaurantModerationStatus.SUSPENDED ||
        dto.moderationStatus === RestaurantModerationStatus.REJECTED) &&
      !nextModerationNote
    ) {
      throw new BadRequestException(
        'A moderation note is required when suspending or rejecting a restaurant',
      );
    }

    if (
      moderationStatusChanged &&
      dto.moderationStatus === RestaurantModerationStatus.APPROVED
    ) {
      const [owner] = await this.db
        .select({
          role: tables.user.role,
          accountStatus: tables.user.accountStatus,
        })
        .from(tables.user)
        .where(eq(tables.user.id, restaurant.ownerId));

      if (
        !owner ||
        owner.role !== UserRole.RESTAURANT_OWNER ||
        owner.accountStatus !== AccountStatus.ACTIVE
      ) {
        throw new BadRequestException(
          'Activate the restaurant owner before approving this restaurant',
        );
      }
    }

    const [updated] = await this.db
      .update(tables.restaurants)
      .set({
        moderationStatus: dto.moderationStatus,
        moderationNote: nextModerationNote,
        moderatedAt: new Date(),
        moderatedBy: actorId,
        // A suspended/rejected/pending restaurant cannot be opened through an
        // old owner session. Approval preserves the owner's prior open state.
        isOpen:
          dto.moderationStatus === RestaurantModerationStatus.APPROVED
            ? restaurant.isOpen
            : false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tables.restaurants.id, restaurantId),
          eq(tables.restaurants.moderationStatus, restaurant.moderationStatus),
        ),
      )
      .returning();

    if (!updated) {
      throw new ConflictException(
        'This restaurant changed. Refresh and try again',
      );
    }

    await this.recordAudit(
      actorId,
      'RESTAURANT_MODERATION_UPDATED',
      'RESTAURANT',
      restaurantId,
      {
        previousStatus: restaurant.moderationStatus,
        moderationStatus: updated.moderationStatus,
        moderationNote: updated.moderationNote,
      },
    );

    return updated;
  }

  async listOrders(query: ListOrdersQueryDto) {
    const conditions: SQL[] = [];
    if (query.status) conditions.push(eq(tables.orders.status, query.status));
    if (query.customerId) {
      conditions.push(eq(tables.orders.customerId, query.customerId));
    }
    if (query.restaurantId) {
      conditions.push(eq(tables.orders.restaurantId, query.restaurantId));
    }
    if (query.driverId) {
      conditions.push(eq(tables.orders.driverId, query.driverId));
    }

    const where = this.andConditions(conditions);
    const [orderRows, total] = await Promise.all([
      this.db
        .select()
        .from(tables.orders)
        .where(where)
        .orderBy(desc(tables.orders.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.countRows(tables.orders, where),
    ]);

    if (orderRows.length === 0) return this.paginated([], query, total);

    const restaurantIds = [
      ...new Set(orderRows.map((order) => order.restaurantId)),
    ];
    const userIds = [
      ...new Set(
        orderRows.flatMap((order) =>
          [order.customerId, order.driverId].filter((id): id is string =>
            Boolean(id),
          ),
        ),
      ),
    ];

    const [restaurants, users] = await Promise.all([
      this.db
        .select({ id: tables.restaurants.id, name: tables.restaurants.name })
        .from(tables.restaurants)
        .where(inArray(tables.restaurants.id, restaurantIds)),
      this.db
        .select({
          id: tables.user.id,
          firstName: tables.user.firstName,
          lastName: tables.user.lastName,
          email: tables.user.email,
        })
        .from(tables.user)
        .where(inArray(tables.user.id, userIds)),
    ]);

    const restaurantsById = new Map(restaurants.map((item) => [item.id, item]));
    const usersById = new Map(users.map((item) => [item.id, item]));
    const items = orderRows.map((order) => ({
      ...order,
      restaurant: restaurantsById.get(order.restaurantId) ?? null,
      customer: usersById.get(order.customerId) ?? null,
      driver: order.driverId ? (usersById.get(order.driverId) ?? null) : null,
    }));

    return this.paginated(items, query, total);
  }

  async cancelOrder(
    orderId: string,
    actorId: string,
    dto: UpdateAdminOrderStatusDto,
  ) {
    if (dto.status !== OrderStatus.CANCELLED) {
      throw new BadRequestException(
        'Administrative order changes are limited to cancellation',
      );
    }

    if (!dto.reason?.trim()) {
      throw new BadRequestException('A cancellation reason is required');
    }

    const [order] = await this.db
      .select()
      .from(tables.orders)
      .where(eq(tables.orders.id, orderId));
    if (!order) throw new NotFoundException('Order not found');

    if (order.status === OrderStatus.DELIVERED) {
      throw new BadRequestException(
        `Cannot cancel an order that is already ${order.status.toLowerCase()}`,
      );
    }

    // Retrying this action repairs a rare partially-completed earlier request
    // by releasing any still-reserved offer capacity.
    if (order.status === OrderStatus.CANCELLED) {
      await this.offersService.releaseReservationForOrder(orderId);
      return order;
    }

    const [normalizedReason] = dto.cancellationReasonId
      ? await this.db
          .select()
          .from(tables.cancellationReasons)
          .where(
            and(
              eq(tables.cancellationReasons.id, dto.cancellationReasonId),
              eq(tables.cancellationReasons.isActive, true),
            ),
          )
      : [undefined];
    if (dto.cancellationReasonId) {
      if (!normalizedReason) {
        throw new BadRequestException('Cancellation reason is not available');
      }
    }

    const updated = await this.paymentsService.cancelAndRefundOrder(
      orderId,
      dto.reason.trim(),
      order.status,
    );
    if (normalizedReason) {
      await this.db
        .insert(tables.orderCancellations)
        .values({
          orderId,
          reasonId: normalizedReason.id,
          actorId,
          note: dto.reason.trim(),
        })
        .onConflictDoUpdate({
          target: tables.orderCancellations.orderId,
          set: {
            reasonId: normalizedReason.id,
            actorId,
            note: dto.reason.trim(),
          },
        });
    }
    await this.db.insert(tables.orderEvents).values({
      orderId,
      actorId,
      type: 'ADMIN_ORDER_CANCELLED',
      metadata: {
        reason: dto.reason.trim(),
        cancellationReasonId: dto.cancellationReasonId ?? null,
      },
    });
    await this.recordAudit(actorId, 'ORDER_CANCELLED', 'ORDER', orderId, {
      previousStatus: order.status,
      reason: dto.reason?.trim() || null,
    });

    return updated;
  }

  async listOffers(query: ListAdminOffersQueryDto) {
    const conditions: SQL[] = [];
    if (query.status) conditions.push(eq(tables.offers.status, query.status));
    if (query.restaurantId) {
      conditions.push(eq(tables.offers.restaurantId, query.restaurantId));
    }
    if (query.featured !== undefined) {
      conditions.push(eq(tables.offers.isFeatured, query.featured));
    }
    if (query.search?.trim()) {
      const search = `%${this.escapeLike(query.search.trim())}%`;
      conditions.push(
        or(
          ilike(tables.offers.title, search),
          ilike(tables.offers.code, search),
          ilike(tables.restaurants.name, search),
        )!,
      );
    }

    const where = this.andConditions(conditions);
    const [rows, countResult] = await Promise.all([
      this.db
        .select({
          offer: tables.offers,
          restaurant: {
            id: tables.restaurants.id,
            name: tables.restaurants.name,
            moderationStatus: tables.restaurants.moderationStatus,
          },
        })
        .from(tables.offers)
        .innerJoin(
          tables.restaurants,
          eq(tables.offers.restaurantId, tables.restaurants.id),
        )
        .where(where)
        .orderBy(
          desc(tables.offers.isFeatured),
          asc(tables.offers.sortOrder),
          desc(tables.offers.createdAt),
        )
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(tables.offers)
        .innerJoin(
          tables.restaurants,
          eq(tables.offers.restaurantId, tables.restaurants.id),
        )
        .where(where),
    ]);

    const now = new Date();
    const items = rows.map(({ offer, restaurant }) => ({
      ...offer,
      effectiveStatus: this.getEffectiveOfferStatus(offer, now),
      restaurant,
    }));
    return this.paginated(items, query, Number(countResult[0]?.total ?? 0));
  }

  async updateOffer(
    offerId: string,
    actorId: string,
    dto: UpdateAdminOfferDto,
  ) {
    if (
      dto.status === undefined &&
      dto.isFeatured === undefined &&
      dto.sortOrder === undefined
    ) {
      throw new BadRequestException(
        'Provide an offer status, featured flag, or display order',
      );
    }

    const [offer] = await this.db
      .select()
      .from(tables.offers)
      .where(eq(tables.offers.id, offerId));
    if (!offer) throw new NotFoundException('Offer not found');

    const now = new Date();
    let status = offer.status;
    if (dto.status !== undefined) {
      if (dto.status === 'ACTIVE') {
        if (offer.endsAt <= now) {
          throw new BadRequestException('An expired offer cannot be activated');
        }
        status = offer.startsAt > now ? 'SCHEDULED' : 'ACTIVE';
      } else {
        status = dto.status;
      }
    }

    const effectiveStatus = this.getEffectiveOfferStatus(
      { ...offer, status },
      now,
    );
    const canBeFeatured =
      effectiveStatus === 'ACTIVE' || effectiveStatus === 'SCHEDULED';
    if (dto.isFeatured === true && !canBeFeatured) {
      throw new BadRequestException(
        'Only active or scheduled offers can be featured',
      );
    }
    // Keep inactive campaigns out of the curated rail even if a previous
    // manual update left a featured flag behind. A reactivated campaign must
    // be deliberately featured again.
    const isFeatured = canBeFeatured
      ? (dto.isFeatured ?? offer.isFeatured)
      : false;

    const [updated] = await this.db
      .update(tables.offers)
      .set({
        status,
        isFeatured,
        sortOrder: dto.sortOrder ?? offer.sortOrder,
        updatedAt: now,
      })
      .where(
        and(
          eq(tables.offers.id, offerId),
          eq(tables.offers.status, offer.status),
        ),
      )
      .returning();

    if (!updated) {
      throw new ConflictException('This offer changed. Refresh and try again');
    }

    await this.recordAudit(actorId, 'OFFER_UPDATED', 'OFFER', offerId, {
      previousStatus: offer.status,
      status: updated.status,
      previousIsFeatured: offer.isFeatured,
      isFeatured: updated.isFeatured,
      previousSortOrder: offer.sortOrder,
      sortOrder: updated.sortOrder,
    });

    return {
      ...updated,
      effectiveStatus: this.getEffectiveOfferStatus(updated, now),
    };
  }

  async listAuditLogs(query: PaginationQueryDto) {
    const [items, total] = await Promise.all([
      this.db
        .select({
          log: tables.adminAuditLogs,
          actor: {
            id: tables.user.id,
            firstName: tables.user.firstName,
            lastName: tables.user.lastName,
            email: tables.user.email,
          },
        })
        .from(tables.adminAuditLogs)
        .innerJoin(
          tables.user,
          eq(tables.adminAuditLogs.actorId, tables.user.id),
        )
        .orderBy(desc(tables.adminAuditLogs.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.countRows(tables.adminAuditLogs),
    ]);

    return this.paginated(items, query, total);
  }

  private async countRows(
    table:
      | typeof tables.user
      | typeof tables.restaurants
      | typeof tables.orders
      | typeof tables.adminAuditLogs,
    where?: SQL,
  ): Promise<number> {
    const [result] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(table)
      .where(where);
    return Number(result?.total ?? 0);
  }

  private paginated<T>(items: T[], query: Pagination, total: number) {
    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  private andConditions(conditions: SQL[]) {
    return conditions.length === 0 ? undefined : and(...conditions);
  }

  private toCountMap<T extends Record<string, unknown>>(
    rows: T[],
    key: keyof T,
  ) {
    return Object.fromEntries(
      rows.map((row) => [String(row[key]), Number(row.total)]),
    );
  }

  private escapeLike(value: string) {
    return value.replace(/[\\%_]/g, '\\$&');
  }

  private getEffectiveOfferStatus(
    offer: typeof tables.offers.$inferSelect,
    now: Date,
  ) {
    if (
      offer.status === 'DRAFT' ||
      offer.status === 'PAUSED' ||
      offer.status === 'ARCHIVED'
    ) {
      return offer.status;
    }
    if (offer.endsAt <= now) return 'EXPIRED';
    if (offer.startsAt > now) return 'SCHEDULED';
    return 'ACTIVE';
  }

  private async requireRestaurant(restaurantId: string) {
    const [restaurant] = await this.db
      .select({ id: tables.restaurants.id, name: tables.restaurants.name })
      .from(tables.restaurants)
      .where(eq(tables.restaurants.id, restaurantId))
      .limit(1);
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return restaurant;
  }

  private async requireCategoryForRestaurant(
    restaurantId: string,
    categoryId: string,
  ) {
    await this.requireRestaurant(restaurantId);
    const [category] = await this.db
      .select()
      .from(tables.menuCategories)
      .where(eq(tables.menuCategories.id, categoryId))
      .limit(1);
    if (!category) throw new NotFoundException('Category not found');
    if (category.restaurantId !== restaurantId) {
      throw new BadRequestException(
        'This category does not belong to the selected restaurant',
      );
    }
    return category;
  }

  private async requireMenuItemForRestaurant(
    restaurantId: string,
    itemId: string,
  ) {
    await this.requireRestaurant(restaurantId);
    const [item] = await this.db
      .select()
      .from(tables.menuItems)
      .where(eq(tables.menuItems.id, itemId))
      .limit(1);
    if (!item) throw new NotFoundException('Menu item not found');
    if (item.restaurantId !== restaurantId) {
      throw new BadRequestException(
        'This menu item does not belong to the selected restaurant',
      );
    }
    return item;
  }

  private assertPositiveMenuPrice(price: string) {
    const value = Number(price);
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException('Menu price must be greater than zero');
    }
  }

  private async recordAudit(
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.db.insert(tables.adminAuditLogs).values({
      actorId,
      action,
      targetType,
      targetId,
      metadata,
    });
  }
}
