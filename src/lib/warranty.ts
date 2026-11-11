export type DiscountType = 'none' | 'percent' | 'fixed';

export type WarrantyCalculationInput = {
  originalPriceCents: number;
  discountType: DiscountType;
  discountValue: number;
  rateBasisPoints: number;
  installments?: number;
};

export type WarrantyCalculation = {
  discountedPriceCents: number;
  discountCents: number;
  warrantyCents: number;
  totalCents: number;
  installmentCents: number;
};

const integer = (value: number) => Math.max(0, Math.round(Number.isFinite(value) ? value : 0));

export function calculateWarranty(input: WarrantyCalculationInput): WarrantyCalculation {
  const originalPriceCents = integer(input.originalPriceCents);
  const rateBasisPoints = Math.min(integer(input.rateBasisPoints), 10_000);
  const installments = Math.min(Math.max(integer(input.installments ?? 1), 1), 36);

  let discountCents = 0;
  if (input.discountType === 'percent') {
    const discountBasisPoints = Math.min(integer(input.discountValue), 10_000);
    discountCents = Math.round(originalPriceCents * discountBasisPoints / 10_000);
  } else if (input.discountType === 'fixed') {
    discountCents = Math.min(integer(input.discountValue), originalPriceCents);
  }

  const discountedPriceCents = Math.max(0, originalPriceCents - discountCents);
  // Jamstvo se uvijek računa na izvornu cijenu proizvoda, prije popusta.
  const warrantyCents = Math.round(originalPriceCents * rateBasisPoints / 10_000);
  const totalCents = discountedPriceCents + warrantyCents;

  return {
    discountedPriceCents,
    discountCents,
    warrantyCents,
    totalCents,
    installmentCents: Math.round(totalCents / installments)
  };
}

export function euroToCents(value: unknown) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

