import { isAtLeast18 } from './adult-access.ts';

export const accountGenderValues = ['woman', 'man', 'nonbinary', 'prefer_not_to_say'] as const;
export type AccountGender = typeof accountGenderValues[number];

export function normalizePersonaDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 50);
}

export function accountGenderPronouns(gender: AccountGender): string | null {
  if (gender === 'woman') return 'she/her';
  if (gender === 'man') return 'he/him';
  if (gender === 'nonbinary') return 'they/them';
  return null;
}

export function ageFromBirthdate(value: string, now: Date): number | null {
  if (!isAtLeast18(value, now)) return null;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  let age = now.getUTCFullYear() - year;
  if (now.getUTCMonth() < month - 1 || (now.getUTCMonth() === month - 1 && now.getUTCDate() < day)) age--;
  return age;
}
