import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class OrderItemDto {
  @IsUUID()
  menuItemId!: string;

  /** Food item quantities are whole, bounded units; decimals/zero are unsafe. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}
