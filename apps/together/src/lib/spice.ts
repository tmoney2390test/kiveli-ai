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
