import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AccountStatus, UserRole } from '@food-delivery/types';

function trimValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeEmailValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class CreateAdminUserDto {
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName!: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName!: string;

  @Transform(normalizeEmailValue)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  /** Defaults by role when omitted: customers ACTIVE, operators PENDING. */
  @IsOptional()
  @IsEnum(AccountStatus)
  accountStatus?: AccountStatus;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  activateImmediately?: boolean;
}
