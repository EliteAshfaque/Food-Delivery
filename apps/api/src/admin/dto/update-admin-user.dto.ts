import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AccountStatus, UserRole } from '@food-delivery/types';

export class UpdateAdminUserDto {
  /** Only an existing admin can grant or revoke this role. */
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(AccountStatus)
  accountStatus?: AccountStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  accountStatusReason?: string;
}
