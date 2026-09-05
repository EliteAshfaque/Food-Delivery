import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

const OFFER_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'PAUSED',
  'EXPIRED',
  'ARCHIVED',
] as const;

export class ListAdminOffersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(OFFER_STATUSES)
  status?: (typeof OFFER_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    // Do not coerce arbitrary query values (for example, "yes") to false.
    // That would make an invalid filter silently return the wrong dataset.
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
