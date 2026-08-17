import type { SpiceLevel } from '../types';

export function normalizeSpiceLevel(value: unknown): SpiceLevel {
  const level = Number(value);
  if (level === 1 || level === 3) return level;
  return 2;
}

export function spiceLabel(value: unknown): string {
  const level = normalizeSpiceLevel(value);
  return level === 1 ? 'Mild chemistry' : level === 2 ? 'Flirty chemistry' : 'Bold chemistry';
}

export function spiceChemistryMultiplier(value: unknown): number {
  const level = normalizeSpiceLevel(value);
  return level === 1 ? 0.6 : level === 2 ? 1 : 1.8;
}

export function chemistryLabel(value: unknown): string {
  const heat = Math.max(0, Math.min(100, Number(value) || 0));
  if (heat >= 80) return 'Electric';
  if (heat >= 58) return 'Strong chemistry';
  if (heat >= 30) return 'Flirty energy';
  if (heat >= 10) return 'A little chemistry';
  return 'No spark yet';
}
