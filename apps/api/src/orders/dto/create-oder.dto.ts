import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
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
}
