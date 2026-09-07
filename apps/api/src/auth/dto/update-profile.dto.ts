import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

function trimValue({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimOrNull({ value }: { value: unknown }): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export class UpdateProfileDto {
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName!: string;

  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName!: string;

  /** Pass null to clear; omit to leave unchanged. */
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(2048)
  imageUrl?: string | null;
}
