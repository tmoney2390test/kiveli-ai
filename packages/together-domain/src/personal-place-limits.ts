/** Active personal places are counted across every world on the account. */
export function personalPlaceLimit(tier: string | null | undefined): number {
  if (tier === 'kivelle_max') return 50;
  if (tier === 'kivelle_plus') return 20;
  return 3;
}
