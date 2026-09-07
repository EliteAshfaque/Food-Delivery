import {
  IsBoolean,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateAdminMenuItemDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(({ value }: { value: string }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  name?: string;

  @IsOptional()
  @Transform(({ value }: { value?: string | null }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsNumberString()
  @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, {
    message: 'price must be a positive amount with at most two decimals',
  })
  price?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2_000)
  imageUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
