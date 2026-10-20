import { describe, expect, it } from 'vitest';
import { cents, formatCents } from './money';

describe('cents', () => {
  it('accepts integers', () => {
    expect(cents(90800)).toBe(90800);
  });

  it('rejects fractional values', () => {
    expect(() => cents(10.5)).toThrow(RangeError);
  });
});

describe('formatCents', () => {
  it('formats USD with two decimals', () => {
    expect(formatCents(cents(90800))).toBe('$908.00');
  });

  it('formats negatives', () => {
    expect(formatCents(cents(-1250))).toBe('-$12.50');
  });
});
