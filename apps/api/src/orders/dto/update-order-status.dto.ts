import {
  OrderStatus,
  type OrderStatus as OrderStatusType,
} from '@food-delivery/types';
import { IsIn } from 'class-validator';

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
}
