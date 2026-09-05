import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const ADMIN_MUTABLE_OFFER_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'ARCHIVED',
] as const;

export class UpdateAdminOfferDto {
  @IsOptional()
  @IsIn(ADMIN_MUTABLE_OFFER_STATUSES)
  status?: (typeof ADMIN_MUTABLE_OFFER_STATUSES)[number];

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}
