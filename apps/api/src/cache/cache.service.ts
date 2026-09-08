import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';

import { CacheKey } from './cache-key';

/**
 * Small read-through cache for public catalogue data. Every method fails open:
 * Redis trouble must never make restaurant browsing, ordering, or payments
 * unavailable. Mutable order, cart, payment, driver and GPS data is excluded.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis | null;
  private hasLoggedUnavailable = false;

  constructor(config: ConfigService) {
    const url = config.get<string>('UPSTASH_REDIS_REST_URL')?.trim();
    const token = config.get<string>('UPSTASH_REDIS_REST_TOKEN')?.trim();
    this.redis = url && token ? new Redis({ url, token }) : null;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const value = await this.redis.get<T>(key);
      return value ?? null;
    } catch (error) {
      this.logUnavailable(error);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(key, value, { ex: ttlSeconds });
    } catch (error) {
      this.logUnavailable(error);
    }
  }

  async delete(...keys: string[]): Promise<void> {
    if (!this.redis || keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch (error) {
      this.logUnavailable(error);
    }
  }

  async getRestaurantCatalogVersion(): Promise<number> {
    const key = CacheKey.restaurantCatalogVersion();
    const current = await this.get<number>(key);
    if (
      typeof current === 'number' &&
      Number.isInteger(current) &&
      current > 0
    ) {
      return current;
    }
    // A race here merely creates one short-lived duplicate catalogue cache.
    await this.set(key, 1, 24 * 60 * 60);
    return 1;
  }

  /** Invalidates every search variant without Redis key scans. */
  async invalidateRestaurantCatalog(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.incr(CacheKey.restaurantCatalogVersion());
    } catch (error) {
      this.logUnavailable(error);
    }
  }

  async invalidateRestaurant(restaurantId: string): Promise<void> {
    await Promise.all([
      this.delete(
        CacheKey.restaurant(restaurantId),
        CacheKey.restaurantCategories(restaurantId),
        CacheKey.restaurantMenu(restaurantId),
      ),
      this.invalidateRestaurantCatalog(),
    ]);
  }

  private logUnavailable(error: unknown) {
    if (this.hasLoggedUnavailable) return;
    this.hasLoggedUnavailable = true;
    const reason = error instanceof Error ? error.message : 'unknown error';
    this.logger.warn(
      `Catalogue cache unavailable; continuing without cache (${reason})`,
    );
  }
}
