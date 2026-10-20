// Money is always integer cents. Never floats.
export type Cents = number & { readonly __brand: 'Cents' };

export function cents(value: number): Cents {
  if (!Number.isInteger(value)) throw new RangeError(`cents must be an integer, got ${value}`);
  return value as Cents;
}

export function formatCents(value: Cents, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value / 100);
}
