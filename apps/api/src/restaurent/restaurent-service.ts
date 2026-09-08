import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, ilike, or } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import type { schema as RelationsSchema } from '../db/relations';
import * as schema from '../db/schema';
import { isPostgresUniqueViolation } from '../db/is-unique-violation';
import {
  AccountStatus,
  RestaurantModerationStatus,
  UserRole,
} from '@food-delivery/types';
import { CreateRestaurantDto } from './dto/create-restaurent.dto';
import { UpdateRestaurantDto } from './dto/update-restaurent.dto';
import { CacheKey } from '../cache/cache-key';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class RestaurantsService {
  constructor(
    @Inject('DB') private db: NeonDatabase<typeof RelationsSchema>,
    private readonly cache: CacheService,
  ) {}

  async create(ownerId: string, dto: CreateRestaurantDto) {
    this.assertLocationPair(dto.latitude, dto.longitude);
    const [existing] = await this.db
      .select({ id: schema.restaurants.id })
      .from(schema.restaurants)
      .where(eq(schema.restaurants.ownerId, ownerId))
      .limit(1);

    if (existing) {
      throw new ConflictException('You already have a restaurant');
    }

    let restaurant: typeof schema.restaurants.$inferSelect;
    try {
      const [created] = await this.db
        .insert(schema.restaurants)
        .values({
          ownerId,
          name: dto.name,
          description: dto.description,
          address: dto.address,
          latitude: dto.latitude,
          longitude: dto.longitude,
          cuisineType: dto.cuisineType,
          imageUrl: dto.imageUrl,
          moderationStatus: RestaurantModerationStatus.PENDING_APPROVAL,
        })
        .returning();
      restaurant = created;
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException('You already have a restaurant');
      }
      throw error;
    }

    await this.cache.invalidateRestaurantCatalog();
    return restaurant;
  }

  async findMine(ownerId: string) {
    const [restaurant] = await this.db
      .select()
      .from(schema.restaurants)
      .where(eq(schema.restaurants.ownerId, ownerId));
    return restaurant ?? null;
  }
  async findById(id: string) {
    const key = CacheKey.restaurant(id);
    const cached =
      await this.cache.get<typeof schema.restaurants.$inferSelect>(key);
    if (cached) return cached;
    const [row] = await this.db
      .select({ restaurant: schema.restaurants })
      .from(schema.restaurants)
      .innerJoin(schema.user, eq(schema.restaurants.ownerId, schema.user.id))
      .where(
        and(
          eq(schema.restaurants.id, id),
          eq(
            schema.restaurants.moderationStatus,
            RestaurantModerationStatus.APPROVED,
          ),
          eq(schema.user.role, UserRole.RESTAURANT_OWNER),
          eq(schema.user.accountStatus, AccountStatus.ACTIVE),
        ),
      );
    if (!row) {
      throw new NotFoundException('Restaurant not found');
    }
    await this.cache.set(key, row.restaurant, 120);
    return row.restaurant;
  }
  async findAll(search?: string) {
    const version = await this.cache.getRestaurantCatalogVersion();
    const key = CacheKey.restaurantCatalog(version, search);
    const cached =
      await this.cache.get<(typeof schema.restaurants.$inferSelect)[]>(key);
    if (cached) return cached;
    const term = search?.trim();
    const searchCondition = term
      ? or(
          ilike(schema.restaurants.name, `%${this.escapeLike(term)}%`),
          ilike(schema.restaurants.cuisineType, `%${this.escapeLike(term)}%`),
        )
      : undefined;
    const rows = await this.db
      .select({ restaurant: schema.restaurants })
      .from(schema.restaurants)
      .innerJoin(schema.user, eq(schema.restaurants.ownerId, schema.user.id))
      .where(
        and(
          eq(schema.restaurants.isOpen, true),
          eq(
            schema.restaurants.moderationStatus,
            RestaurantModerationStatus.APPROVED,
          ),
          eq(schema.user.role, UserRole.RESTAURANT_OWNER),
          eq(schema.user.accountStatus, AccountStatus.ACTIVE),
          searchCondition,
        ),
      );
    const restaurants = rows.map((row) => row.restaurant);
    await this.cache.set(key, restaurants, 30);
    return restaurants;
  }
  async update(id: string, ownerId: string, dto: UpdateRestaurantDto) {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException(
        'Provide at least one restaurant field to update',
      );
    }
    this.assertLocationPair(dto.latitude, dto.longitude);
    const [restaurant] = await this.db
      .select()
      .from(schema.restaurants)
      .where(eq(schema.restaurants.id, id));

    if (!restaurant) throw new NotFoundException('Restaurant not found');

    if (restaurant.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this restaurant');
    }

    if (
      dto.isOpen === true &&
      restaurant.moderationStatus !== RestaurantModerationStatus.APPROVED
    ) {
      throw new ForbiddenException(
        'Your restaurant must be approved before it can open',
      );
    }

    const [updated] = await this.db
      .update(schema.restaurants)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(schema.restaurants.id, id))
      .returning();

    await this.cache.invalidateRestaurant(updated.id);
    return updated;
  }

  private escapeLike(value: string) {
    return value.replace(/[\\%_]/g, '\\$&');
  }

  private assertLocationPair(latitude?: number, longitude?: number) {
    if ((latitude === undefined) !== (longitude === undefined)) {
      throw new BadRequestException(
        'Latitude and longitude must be provided together',
      );
    }
  }
}
