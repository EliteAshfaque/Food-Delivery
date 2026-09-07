import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateFavoriteDto {
  @IsUUID()
  restaurantId!: string;
}

export class ReorderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryAddress?: string;
}

export class ClaimReferralDto {
  @IsString()
  @MaxLength(32)
  referralCode!: string;
}

/** A Stripe PaymentMethod ID — never a card number or CVC. */
export class SavePaymentMethodDto {
  @IsString()
  @MaxLength(255)
  paymentMethodId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripeCustomerId?: string;

  @IsOptional()
  isDefault?: boolean;
}
