import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function trimValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateAdminRestaurantDto {
  @IsUUID()
  ownerId!: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(300)
  address!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  cuisineType!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2_000)
  imageUrl?: string;

  /** When true, restaurant is approved immediately for discovery. */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  approveImmediately?: boolean;
}
