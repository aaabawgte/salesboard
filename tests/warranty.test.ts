import { describe, expect, it } from 'vitest';
import { calculateWarranty, euroToCents } from '../src/lib/warranty';

describe('warranty calculator', () => {
  it('calculates warranty from the original price before discount', () => {
    expect(calculateWarranty({
      originalPriceCents: 100_000,
      discountType: 'percent',
      discountValue: 1_000,
      rateBasisPoints: 1_800,
      installments: 12
    })).toEqual({
      discountedPriceCents: 90_000,
      discountCents: 10_000,
      warrantyCents: 18_000,
      totalCents: 108_000,
      installmentCents: 9_000
    });
  });

  it('caps a fixed discount at the original price', () => {
    const result = calculateWarranty({ originalPriceCents: 10_000, discountType: 'fixed', discountValue: 20_000, rateBasisPoints: 900 });
    expect(result.discountedPriceCents).toBe(0);
    expect(result.warrantyCents).toBe(900);
  });

  it('parses Croatian decimal input', () => {
    expect(euroToCents('123,45')).toBe(12_345);
  });
});

