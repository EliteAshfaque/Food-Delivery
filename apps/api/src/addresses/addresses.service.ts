import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { schema } from '../db/relations';
import * as tables from '../db/schema';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class AddressesService {
  constructor(@Inject('DB') private readonly db: NeonDatabase<typeof schema>) {}

  async list(userId: string) {
    return this.db
      .select()
      .from(tables.userAddresses)
      .where(eq(tables.userAddresses.userId, userId))
      .orderBy(
        desc(tables.userAddresses.isDefault),
        desc(tables.userAddresses.updatedAt),
      );
  }

  async create(userId: string, dto: CreateAddressDto) {
    const makeDefault =
      dto.isDefault === true || (await this.count(userId)) === 0;

    return this.db.transaction(async (tx) => {
      if (makeDefault) {
        await tx
          .update(tables.userAddresses)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(eq(tables.userAddresses.userId, userId));
      }

      const [created] = await tx
        .insert(tables.userAddresses)
        .values({
          userId,
          label: dto.label.trim(),
          addressLine: dto.addressLine.trim(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          isDefault: makeDefault,
        })
        .returning();

      return created;
    });
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto) {
    const existing = await this.getOwned(userId, addressId);

    if (
      (dto.latitude !== undefined && dto.longitude === undefined) ||
      (dto.longitude !== undefined && dto.latitude === undefined)
    ) {
      throw new BadRequestException(
        'Provide both latitude and longitude together',
      );
    }

    if (
      dto.label === undefined &&
      dto.addressLine === undefined &&
      dto.latitude === undefined &&
      dto.longitude === undefined &&
      dto.isDefault === undefined
    ) {
      throw new BadRequestException('Provide at least one field to update');
    }

    return this.db.transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx
          .update(tables.userAddresses)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(
            and(
              eq(tables.userAddresses.userId, userId),
              ne(tables.userAddresses.id, addressId),
            ),
          );
      }

      if (dto.isDefault === false && existing.isDefault) {
        throw new BadRequestException(
          'Set another address as default instead of clearing the only default',
        );
      }

      const [updated] = await tx
        .update(tables.userAddresses)
        .set({
          label: dto.label?.trim() ?? existing.label,
          addressLine: dto.addressLine?.trim() ?? existing.addressLine,
          latitude:
            dto.latitude === undefined ? existing.latitude : dto.latitude,
          longitude:
            dto.longitude === undefined ? existing.longitude : dto.longitude,
          isDefault:
            dto.isDefault === undefined ? existing.isDefault : dto.isDefault,
          updatedAt: new Date(),
        })
        .where(eq(tables.userAddresses.id, addressId))
        .returning();

      return updated;
    });
  }

  async setDefault(userId: string, addressId: string) {
    await this.getOwned(userId, addressId);

    return this.db.transaction(async (tx) => {
      await tx
        .update(tables.userAddresses)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(tables.userAddresses.userId, userId));

      const [updated] = await tx
        .update(tables.userAddresses)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(tables.userAddresses.id, addressId))
        .returning();

      return updated;
    });
  }

  async remove(userId: string, addressId: string) {
    const existing = await this.getOwned(userId, addressId);

    await this.db
      .delete(tables.userAddresses)
      .where(eq(tables.userAddresses.id, addressId));

    if (existing.isDefault) {
      const [next] = await this.db
        .select()
        .from(tables.userAddresses)
        .where(eq(tables.userAddresses.userId, userId))
        .orderBy(desc(tables.userAddresses.updatedAt))
        .limit(1);
      if (next) {
        await this.db
          .update(tables.userAddresses)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(tables.userAddresses.id, next.id));
      }
    }

    return { message: 'Address deleted' };
  }

  private async count(userId: string) {
    const [row] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(tables.userAddresses)
      .where(eq(tables.userAddresses.userId, userId));
    return Number(row?.total ?? 0);
  }

  private async getOwned(userId: string, addressId: string) {
    const [address] = await this.db
      .select()
      .from(tables.userAddresses)
      .where(eq(tables.userAddresses.id, addressId));

    if (!address) throw new NotFoundException('Address not found');
    if (address.userId !== userId) {
      throw new ForbiddenException('This address does not belong to you');
    }
    return address;
  }
}
