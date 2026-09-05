import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AccountStatus, UserRole } from '@food-delivery/types';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(AccountStatus)
  accountStatus?: AccountStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
