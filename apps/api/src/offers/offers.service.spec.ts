import { BadRequestException } from '@nestjs/common';
import type { Offer } from '../db/schema';
import { OffersService } from './offers.service';

type PricingResult = {
  subtotalAmount: string;
  discountAmount: string;
  totalAmount: string;
};

type OfferRulesInput = {
  title: string;
  code: string | null;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: string;
  minimumOrderAmount: string;
  maximumDiscountAmount: string | null;
  usageLimit: number | null;
  perCustomerLimit: number;
  autoApply: boolean;
  startsAt: Date;
  endsAt: Date;
};

type PricingRulesAccess = {
  applyOffer: (offer: Offer, subtotal: number) => PricingResult;
  assertOfferRules: (values: OfferRulesInput) => void;
};

/**
 * These unit tests deliberately exercise the server-only pricing rules. The
 * database-backed eligibility/reservation paths are protected by integration
 * transactions in OffersService and OrdersService.
 */
describe('OffersService pricing rules', () => {
  const service = new OffersService({} as never);
  const pricingRules = service as unknown as PricingRulesAccess;
  const baseOffer: Offer = {
    id: '00000000-0000-4000-8000-000000000001',
    restaurantId: '00000000-0000-4000-8000-000000000002',
    title: 'Lunch deal',
    description: null,
    imageUrl: null,
    code: 'LUNCH20',
    discountType: 'PERCENTAGE' as const,
    discountValue: '20.00',
    minimumOrderAmount: '0.00',
    maximumDiscountAmount: null,
    usageLimit: null,
    usageCount: 0,
    perCustomerLimit: 1,
    autoApply: false,
    isFeatured: false,
    sortOrder: 0,
    status: 'ACTIVE' as const,
    startsAt: new Date('2026-01-01T00:00:00.000Z'),
    endsAt: new Date('2027-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('calculates a percentage discount on the server amount', () => {
    const result = pricingRules.applyOffer(baseOffer, 125.5);

    expect(result.subtotalAmount).toBe('125.50');
    expect(result.discountAmount).toBe('25.10');
    expect(result.totalAmount).toBe('100.40');
  });

  it('caps a percentage discount at the configured currency maximum', () => {
    const result = pricingRules.applyOffer(
      {
        ...baseOffer,
        discountValue: '50.00',
        maximumDiscountAmount: '15.00',
      },
      100,
    );

    expect(result.discountAmount).toBe('15.00');
    expect(result.totalAmount).toBe('85.00');
  });

  it('does not allow a zero-value payment order until complimentary fulfilment exists', () => {
    expect(() =>
      pricingRules.applyOffer({ ...baseOffer, discountValue: '100.00' }, 25),
    ).toThrow(BadRequestException);
  });

  it('rejects percentage campaigns over 100 percent', () => {
    expect(() =>
      pricingRules.assertOfferRules({
        title: 'Too much',
        code: 'TOOMUCH',
        discountType: 'PERCENTAGE',
        discountValue: '100.01',
        minimumOrderAmount: '0.00',
        maximumDiscountAmount: null,
        usageLimit: null,
        perCustomerLimit: 1,
        autoApply: false,
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    ).toThrow(BadRequestException);
  });
});
