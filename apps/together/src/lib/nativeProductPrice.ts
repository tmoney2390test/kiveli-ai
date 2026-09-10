export type NativeProductPrice = { price: string; period: string; detail: string; subscriptionPeriod: string };

/** The store amount is the full billing amount, never a monthly equivalent. */
export function nativeProductPrice(product: { priceString: string; subscriptionPeriod: string | null }): NativeProductPrice | null {
  const match = /^P(\d+)([DWMY])$/.exec(product.subscriptionPeriod ?? '');
  if (!match || !product.priceString.trim() || Number(match[1]) < 1) return null;
  const count = Number(match[1]);
  const unit = ({ D: 'day', W: 'week', M: 'month', Y: 'year' } as Record<string, string>)[match[2]!]!;
  const duration = count === 1 ? unit : `${count} ${unit}s`;
  return { price: product.priceString, period: `/ ${duration}`, detail: `Renews every ${duration}. Cancel in your app store.`, subscriptionPeriod: product.subscriptionPeriod! };
}
