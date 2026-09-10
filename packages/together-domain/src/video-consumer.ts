/** Public video capabilities and published credit defaults. No provider routing data. */
export const VIDEO_CATALOG_VERSION = '2026-09-10-two-tiers-v1';
export const VIDEO_CREDIT_DEFAULTS = { creditsPerUnit: 250, minimumCredits: 25 };
export const VIDEO_CONSUMER_TIERS = [
  { id: 'tier:standard', tier: 'standard', name: 'Standard', description: 'Everyday moments, fewer credits', resolution: '720p', resolutions: ['480p', '720p', '1080p'], durations: [5, 10], audioMode: 'toggleable', creditsPerSecond: [3, 6.5, 13] },
  { id: 'tier:premium', tier: 'premium', name: 'Cinematic', description: 'Premium video generation', resolution: '768p', resolutions: ['480p', '768p'], durations: Array.from({ length: 13 }, (_, i) => i + 3), audioMode: 'always', creditsPerSecond: [10, 20] },
] as const;

export function consumerVideoCreditQuotes(tierId: string, creditsPerUnit = 250, minimumCredits = 25): Record<string, number> {
  const tier = VIDEO_CONSUMER_TIERS.find(item => item.id === tierId);
  if (!tier) return {};
  const quotes: Record<string, number> = {};
  tier.resolutions.forEach((resolution, index) => {
    for (const duration of tier.durations) for (const sound of [false, true]) {
      quotes[`${resolution}:${duration}:${sound ? 'sound' : 'silent'}`] = Math.max(minimumCredits, Math.ceil(tier.creditsPerSecond[index]! * duration * creditsPerUnit / 250 * (tier.audioMode === 'toggleable' && sound ? 2 : 1)));
    }
  });
  return quotes;
}

export function consumerVideoTierId(value: string): 'tier:standard' | 'tier:premium' {
  return value === 'tier:premium' || value.startsWith('minimax-h3-') ? 'tier:premium' : 'tier:standard';
}
