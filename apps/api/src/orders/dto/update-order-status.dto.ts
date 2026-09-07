import {
  OrderStatus,
  type OrderStatus as OrderStatusType,
} from '@food-delivery/types';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const updatableStatuses: OrderStatusType[] = [
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.CANCELLED,
  OrderStatus.PICKED_UP,
  OrderStatus.DELIVERED,
];

export class UpdateOrderStatusDto {
  @IsIn(updatableStatuses)
  status!: OrderStatusType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
