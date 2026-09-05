import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { RestaurantModerationStatus } from '@food-delivery/types';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListRestaurantsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(RestaurantModerationStatus)
  moderationStatus?: RestaurantModerationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
