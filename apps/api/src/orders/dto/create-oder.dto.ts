import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderItemDto } from './order-item.dto';

export class CreateOrderDto {
  @IsUUID()
  restaurantId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  deliveryAddress!: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  deliveryLatitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  deliveryLongitude!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];

  /** Optional customer-entered code; auto-apply offers are evaluated either way. */
  @IsOptional()
  @IsString()
  @Matches(/^\s*$|^[A-Za-z0-9_-]{3,32}$/)
  offerCode?: string;
}
