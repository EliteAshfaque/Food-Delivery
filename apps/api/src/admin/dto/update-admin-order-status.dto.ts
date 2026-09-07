import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { OrderStatus } from '@food-delivery/types';

export class UpdateAdminOrderStatusDto {
  /**
   * Administrative intervention is deliberately limited to cancellation.
   * Restaurant and driver workflow transitions remain domain-owned.
   */
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /** Optional normalized code for cancellation analytics. */
  @IsOptional()
  @IsUUID()
  cancellationReasonId?: string;
}
