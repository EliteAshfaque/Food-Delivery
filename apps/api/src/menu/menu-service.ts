import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import type { schema as RelationsSchema } from '../db/relations';
import * as schema from '../db/schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateMenuItemDto } from './dto/create-menu.dto';
import { UpdateMenuItemDto } from './dto/update-menu.dto';
import { isPostgresUniqueViolation } from '../db/is-unique-violation';
import { CacheKey } from '../cache/cache-key';
import { CacheService } from '../cache/cache.service';
@Injectable()
export class MenuService {
  constructor(
    @Inject('DB') private db: NeonDatabase<typeof RelationsSchema>,
    private readonly cache: CacheService,
  ) {}
  private async getRestaurantByOwner(ownerId: string) {
    const [restaurant] = await this.db
      .select()
      .from(schema.restaurants)
      .where(eq(schema.restaurants.ownerId, ownerId));

    if (!restaurant) throw new NotFoundException('Create a restaurant first');

    return restaurant;
  }

  // ==================== CATEGORIES ====================

  async createCategory(ownerId: string, dto: CreateCategoryDto) {
    const restaurant = await this.getRestaurantByOwner(ownerId);

    const [existing] = await this.db
      .select({ id: schema.menuCategories.id })
      .from(schema.menuCategories)
      .where(
        and(
          eq(schema.menuCategories.restaurantId, restaurant.id),
          sql`lower(${schema.menuCategories.name}) = ${dto.name.toLowerCase()}`,
        ),
      );

    if (existing) {
      throw new ConflictException('A category with this name already exists');
    }

    let category: typeof schema.menuCategories.$inferSelect;
    try {
      [category] = await this.db
        .insert(schema.menuCategories)
        .values({ restaurantId: restaurant.id, name: dto.name })
        .returning();
    } catch (error) {
      if (isPostgresUniqueViolation(error)) {
        throw new ConflictException('A category with this name already exists');
      }
      throw error;
    }

    await this.cache.invalidateRestaurant(restaurant.id);
    return category;
  }

  async getCategories(restaurantId: string) {
    const key = CacheKey.restaurantCategories(restaurantId);
    const cached =
      await this.cache.get<(typeof schema.menuCategories.$inferSelect)[]>(key);
    if (cached) return cached;
    const categories = await this.db
      .select()
      .from(schema.menuCategories)
      .where(eq(schema.menuCategories.restaurantId, restaurantId));
    await this.cache.set(key, categories, 60);
    return categories;
  }

  async updateCategory(id: string, ownerId: string, dto: UpdateCategoryDto) {
    const restaurant = await this.getRestaurantByOwner(ownerId);

    if (!dto.name) {
      throw new BadRequestException('Provide a category name to update');
    }

    const [category] = await this.db
      .select()
      .from(schema.menuCategories)
      .where(eq(schema.menuCategories.id, id));

    if (!category) throw new NotFoundException('Category not found');

    if (category.restaurantId !== restaurant.id) {
      throw new ForbiddenException(
        'This category does not belong to your restaurant',
      );
    }

    const [duplicate] = await this.db
      .select({ id: schema.menuCategories.id })
      .from(schema.menuCategories)
      .where(
        and(
          eq(schema.menuCategories.restaurantId, restaurant.id),
          sql`lower(${schema.menuCategories.name}) = ${dto.name.toLowerCase()}`,
          ne(schema.menuCategories.id, id),
        ),
      )
      .limit(1);
    if (duplicate) {
      throw new ConflictException('A category with this name already exists');
    }

    const [updated] = await this.db
      .update(schema.menuCategories)
      .set({ name: dto.name })
      .where(eq(schema.menuCategories.id, id))
      .returning();

    await this.cache.invalidateRestaurant(restaurant.id);
    return updated;
  }

  async deleteCategory(id: string, ownerId: string) {
    const restaurant = await this.getRestaurantByOwner(ownerId);

    const [category] = await this.db
      .select()
      .from(schema.menuCategories)
      .where(eq(schema.menuCategories.id, id));

    if (!category) throw new NotFoundException('Category not found');

    if (category.restaurantId !== restaurant.id) {
      throw new ForbiddenException(
        'This category does not belong to your restaurant',
      );
    }

    const [item] = await this.db
      .select({ id: schema.menuItems.id })
      .from(schema.menuItems)
      .where(eq(schema.menuItems.categoryId, id))
      .limit(1);

    if (item) {
      throw new ConflictException(
        'This category still has menu items. Move or remove them first.',
      );
    }

    await this.db
      .delete(schema.menuCategories)
      .where(eq(schema.menuCategories.id, id));

    await this.cache.invalidateRestaurant(restaurant.id);
    return { message: 'Category deleted successfully' };
  }

  // ==================== MENU ITEMS ====================

  async createItem(ownerId: string, dto: CreateMenuItemDto) {
    const restaurant = await this.getRestaurantByOwner(ownerId);

    await this.getCategoryForRestaurant(dto.categoryId, restaurant.id);
    this.assertPositivePrice(dto.price);

    const [item] = await this.db
      .insert(schema.menuItems)
      .values({
        restaurantId: restaurant.id,
        categoryId: dto.categoryId,
        name: dto.name,
        description: this.normaliseOptionalText(dto.description),
        price: dto.price,
        imageUrl: dto.imageUrl,
      })
      .returning();

    await this.cache.invalidateRestaurant(restaurant.id);
    return item;
  }

  async getItemsByRestaurant(restaurantId: string) {
    // returns all items for a restaurant – frontend groups them by category
    const key = CacheKey.restaurantMenu(restaurantId);
    const cached =
      await this.cache.get<(typeof schema.menuItems.$inferSelect)[]>(key);
    if (cached) return cached;
    const items = await this.db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.restaurantId, restaurantId));
    await this.cache.set(key, items, 60);
    return items;
  }

  async updateItem(id: string, ownerId: string, dto: UpdateMenuItemDto) {
    const restaurant = await this.getRestaurantByOwner(ownerId);

    if (Object.keys(dto).length === 0) {
      throw new BadRequestException(
        'Provide at least one item field to update',
      );
    }

    const [item] = await this.db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, id));

    if (!item) throw new NotFoundException('Menu item not found');

    if (item.restaurantId !== restaurant.id) {
      throw new ForbiddenException(
        'This item does not belong to your restaurant',
      );
    }

    if (dto.categoryId) {
      await this.getCategoryForRestaurant(dto.categoryId, restaurant.id);
    }
    if (dto.price !== undefined) this.assertPositivePrice(dto.price);

    const [updated] = await this.db
      .update(schema.menuItems)
      .set({
        ...dto,
        description:
          dto.description === undefined
            ? undefined
            : this.normaliseOptionalText(dto.description),
        updatedAt: new Date(),
      })
      .where(eq(schema.menuItems.id, id))
      .returning();

    await this.cache.invalidateRestaurant(restaurant.id);
    return updated;
  }

  async deleteItem(id: string, ownerId: string) {
    const restaurant = await this.getRestaurantByOwner(ownerId);

    const [item] = await this.db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, id));

    if (!item) throw new NotFoundException('Menu item not found');

    if (item.restaurantId !== restaurant.id) {
      throw new ForbiddenException(
        'This item does not belong to your restaurant',
      );
    }

    const [orderedItem] = await this.db
      .select({ id: schema.orderItems.id })
      .from(schema.orderItems)
      .where(eq(schema.orderItems.menuItemId, id))
      .limit(1);

    if (orderedItem) {
      throw new ConflictException(
        'This menu item appears in an order. Mark it unavailable instead.',
      );
    }

    await this.db.delete(schema.menuItems).where(eq(schema.menuItems.id, id));

    await this.cache.invalidateRestaurant(restaurant.id);
    return { message: 'Item deleted' };
  }

  private async getCategoryForRestaurant(
    categoryId: string,
    restaurantId: string,
  ) {
    const [category] = await this.db
      .select({
        id: schema.menuCategories.id,
        restaurantId: schema.menuCategories.restaurantId,
      })
      .from(schema.menuCategories)
      .where(eq(schema.menuCategories.id, categoryId));

    if (!category || category.restaurantId !== restaurantId) {
      throw new NotFoundException('Menu category not found');
    }

    return category;
  }

  private assertPositivePrice(price: string) {
    const value = Number(price);
    if (!Number.isFinite(value) || value <= 0) {
      throw new BadRequestException('Menu price must be greater than zero');
    }
  }

  private normaliseOptionalText(value?: string | null) {
    return value?.trim() || null;
  }
}
