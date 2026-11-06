import { describe, it, expect } from 'vitest';
import { nativeProductPrice } from './nativeProductPrice';
describe('native store price presentation', () => {
  it('keeps an annual localized total paired with a year', () => { expect(nativeProductPrice({priceString:'199,99 €',subscriptionPeriod:'P1Y'})).toMatchObject({price:'199,99 €',period:'/ year'}); });
  it('uses the store amount for a localized savings claim when available', () => { expect(nativeProductPrice({priceString:'199,99 €',price:199.99,subscriptionPeriod:'P1Y'})?.amount).toBe(199.99); });
  it('supports monthly and multi-month periods', () => { expect(nativeProductPrice({priceString:'¥900',subscriptionPeriod:'P1M'})?.period).toBe('/ month'); expect(nativeProductPrice({priceString:'£29',subscriptionPeriod:'P3M'})?.period).toBe('/ 3 months'); });
  it('does not invent a price or period for unavailable products', () => { expect(nativeProductPrice({priceString:'',subscriptionPeriod:'P1Y'})).toBeNull(); expect(nativeProductPrice({priceString:'$10',subscriptionPeriod:null})).toBeNull(); });
});
