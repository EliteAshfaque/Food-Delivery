import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

/** A checkout quote request. The final order always recalculates this server-side. */
export class ValidateOfferDto {
  @IsUUID()
  restaurantId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  subtotalAmount!: number;

  @IsOptional()
  @IsString()
  @Matches(/^\s*$|^[A-Za-z0-9_-]{3,32}$/)
  code?: string;
}
