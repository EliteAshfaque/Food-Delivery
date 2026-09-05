import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '@food-delivery/types';

const PUBLIC_REGISTRATION_ROLES = [
  UserRole.CUSTOMER,
  UserRole.RESTAURANT_OWNER,
  UserRole.DRIVER,
] as const;

function trimValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeEmailValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class RegisterDto {
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

  // ADMIN is never a self-selectable role. Privileged access is bootstrapped
  // from trusted server configuration and managed only by administrators.
  @IsIn(PUBLIC_REGISTRATION_ROLES)
  role!: UserRole;
}
