import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OrderStatus } from '@food-delivery/types';
import { PaginationQueryDto } from './pagination-query.dto';

export class ListOrdersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;
}
