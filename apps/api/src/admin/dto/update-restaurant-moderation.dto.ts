import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { RestaurantModerationStatus } from '@food-delivery/types';

export class UpdateRestaurantModerationDto {
  @IsEnum(RestaurantModerationStatus)
  moderationStatus!: RestaurantModerationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  moderationNote?: string;
}
