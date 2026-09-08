import { createHash } from 'node:crypto';

const prefix = 'wasil:v1';

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

/**
 * Keep keys versioned and private. Search text is hashed so Redis keys never
 * contain a customer's query verbatim.
 */
export const CacheKey = {
  restaurantCatalogVersion: () => `${prefix}:restaurants:catalog-version`,
  restaurantCatalog: (version: number, search?: string) =>
    `${prefix}:restaurants:catalog:${version}:${hash(search?.trim().toLowerCase() || 'all')}`,
  restaurant: (restaurantId: string) => `${prefix}:restaurant:${restaurantId}`,
  restaurantCategories: (restaurantId: string) =>
    `${prefix}:restaurant:${restaurantId}:categories`,
  restaurantMenu: (restaurantId: string) =>
    `${prefix}:restaurant:${restaurantId}:menu`,
};
