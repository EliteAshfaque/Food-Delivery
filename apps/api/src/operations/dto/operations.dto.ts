import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CoordinateDto {
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;
}

export class UpsertDeliveryZoneDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CoordinateDto)
  polygon!: CoordinateDto[];

  @IsString()
  baseFee!: string;

  @IsString()
  feePerKm!: string;

  @IsString()
  minimumOrder!: string;

  @IsInt()
  @Min(1)
  @Max(240)
  etaMinutes!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertRestaurantScheduleDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsString()
  @MaxLength(5)
  opensAt!: string;

  @IsString()
  @MaxLength(5)
  closesAt!: string;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  prepMinutes?: number;
}

export class ReviewDriverDocumentDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}

export class ReassignOrderDto {
  @IsUUID()
  driverId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateSupportTicketDto {
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsString()
  @MaxLength(160)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  priority?: string;
}

export class UpdateSupportTicketDto {
  @IsOptional()
  @IsEnum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
  status?: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

  @IsOptional()
  @IsUUID()
  assignedAdminId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  priority?: string;
}

export class AddSupportNoteDto {
  @IsString()
  @MaxLength(4000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}

export class CreateCancellationReasonDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(160)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  appliesTo?: string;
}

export class SendNotificationDto {
  @IsUUID()
  recipientId!: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(1000)
  body!: string;

  @IsOptional()
  payload?: Record<string, unknown>;
}

export class CreateSettlementDto {
  @IsUUID()
  restaurantId!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsString()
  commissionRate!: string;
}

export class UpdateAdminAssignmentDto {
  @IsEnum(['SUPER_ADMIN', 'OPERATIONS', 'SUPPORT', 'FINANCE', 'MARKETING'])
  role!: 'SUPER_ADMIN' | 'OPERATIONS' | 'SUPPORT' | 'FINANCE' | 'MARKETING';

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  permissions!: string[];
}
