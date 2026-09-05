import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { UploadThingError } from 'uploadthing/server';
import { AccountStatus, UserRole, type JwtPayload } from '@food-delivery/types';
import type { schema as RelationsSchema } from '../db/relations';
import * as schema from '../db/schema';
import type { UploadAuthorizer } from './upload-router';

/* UploadThingError is the library's documented HTTP error class, but its
 * TypeScript declaration does not extend Error. */
/* eslint-disable @typescript-eslint/only-throw-error */

/**
 * Authorization for UploadThing's non-Nest Express route. A valid JWT alone
 * is not enough: the current database role and account status are always
 * checked so a suspended owner cannot mint new direct-upload URLs.
 */
@Injectable()
export class UploadAuthorizationService implements UploadAuthorizer {
  constructor(
    private readonly jwtService: JwtService,
    @Inject('DB')
    private readonly db: NeonDatabase<typeof RelationsSchema>,
  ) {}

  async requireRestaurantOwner(
    authorizationHeader: string | undefined,
    restaurantId?: string,
  ): Promise<{ uploadedBy: string; restaurantId: string | null }> {
    const payload = this.verifyBearerToken(authorizationHeader);

    const [dbUser] = await this.db
      .select({
        id: schema.user.id,
        role: schema.user.role,
        accountStatus: schema.user.accountStatus,
      })
      .from(schema.user)
      .where(eq(schema.user.id, payload.sub));

    if (
      !dbUser ||
      dbUser.role !== UserRole.RESTAURANT_OWNER ||
      dbUser.accountStatus !== AccountStatus.ACTIVE
    ) {
      throw this.forbidden();
    }

    if (restaurantId) {
      const [restaurant] = await this.db
        .select({ ownerId: schema.restaurants.ownerId })
        .from(schema.restaurants)
        .where(eq(schema.restaurants.id, restaurantId));

      if (!restaurant || restaurant.ownerId !== dbUser.id) {
        throw this.forbidden();
      }
    } else {
      // A target-less restaurant image is only for the create-restaurant
      // screen. Once the one-restaurant-per-owner record exists, every image
      // request must name that record and pass the ownership check above.
      const [existingRestaurant] = await this.db
        .select({ id: schema.restaurants.id })
        .from(schema.restaurants)
        .where(eq(schema.restaurants.ownerId, dbUser.id))
        .limit(1);

      if (existingRestaurant) {
        throw this.forbidden();
      }
    }

    return {
      uploadedBy: dbUser.id,
      restaurantId: restaurantId ?? null,
    };
  }

  private verifyBearerToken(authorizationHeader: string | undefined) {
    const authParts = authorizationHeader?.trim().split(/\s+/) ?? [];
    const [scheme, token] = authParts;
    if (authParts.length !== 2 || scheme !== 'Bearer' || !token) {
      throw this.forbidden();
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      if (!payload?.sub) throw this.forbidden();
      return payload;
    } catch (error) {
      if (error instanceof UploadThingError) throw error;
      throw this.forbidden();
    }
  }

  private forbidden() {
    // UploadThing maps this error to a 403 response. Do not distinguish an
    // expired token, suspended account, or another owner's restaurant.
    return new UploadThingError({
      code: 'FORBIDDEN',
      message: 'You are not allowed to upload files for this restaurant',
    });
  }
}
