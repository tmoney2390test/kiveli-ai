import { describe, expect, it } from 'vitest';
import { PRODUCT_ANALYTICS_DISCLOSURE_VERSION, productAnalyticsAllowed } from './analytics-consent';

describe('product analytics consent', () => {
  const consent = { decision: 'accepted', version: PRODUCT_ANALYTICS_DISCLOSURE_VERSION, recordedAt: '2026-10-01T12:00:00.000Z' };

  it('requires a versioned, recorded affirmative choice', () => {
    expect(productAnalyticsAllowed({ analytics: true, analyticsConsent: consent })).toBe(true);
    expect(productAnalyticsAllowed({ analytics: true })).toBe(false);
    expect(productAnalyticsAllowed({ analytics: false, analyticsConsent: consent })).toBe(false);
    expect(productAnalyticsAllowed({ analytics: true, analyticsConsent: { ...consent, version: 'older' } })).toBe(false);
    expect(productAnalyticsAllowed({ analytics: true, analyticsConsent: { ...consent, recordedAt: 'invalid' } })).toBe(false);
    expect(productAnalyticsAllowed(null)).toBe(false);
  });
});
