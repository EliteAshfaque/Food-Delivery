import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class UpdateAddressDto {
  @IsOptional()
  @Transform(({ value }: { value: string }) => value.trim())
  @IsString()
  @MaxLength(40)
  label?: string;

  @IsOptional()
  @Transform(({ value }: { value: string }) => value.trim())
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  addressLine?: string;

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

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
