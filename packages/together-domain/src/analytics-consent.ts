export const PRODUCT_ANALYTICS_DISCLOSURE_VERSION = 'product-analytics-v1' as const;

export function productAnalyticsAllowed(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
  const choice = settings as Record<string, unknown>;
  const consent = choice['analyticsConsent'];
  if (choice['analytics'] !== true || !consent || typeof consent !== 'object' || Array.isArray(consent)) return false;
  const decision = consent as Record<string, unknown>;
  return decision['decision'] === 'accepted'
    && decision['version'] === PRODUCT_ANALYTICS_DISCLOSURE_VERSION
    && typeof decision['recordedAt'] === 'string'
    && Number.isFinite(Date.parse(decision['recordedAt']));
}
