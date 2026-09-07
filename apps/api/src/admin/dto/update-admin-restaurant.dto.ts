import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function trimValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Admin can edit restaurant profile fields (not only moderation). */
export class UpdateAdminRestaurantDto {
  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @IsOptional()
  @Transform(trimValue)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  cuisineType?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2_000)
  imageUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isOpen?: boolean;
}
