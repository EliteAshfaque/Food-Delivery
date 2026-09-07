import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class CreateAddressDto {
  @Transform(({ value }: { value: string }) => value.trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  label!: string;

  @Transform(({ value }: { value: string }) => value.trim())
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(300)
  addressLine!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
