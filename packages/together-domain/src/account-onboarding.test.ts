import { describe, expect, it } from 'vitest';
import { accountGenderPronouns, ageFromBirthdate, normalizePersonaDisplayName } from './account-onboarding.ts';

describe('account onboarding identity', () => {
  it('normalizes a Persona name without accepting excess whitespace', () => {
    expect(normalizePersonaDisplayName('  Taylor   Reed  ')).toBe('Taylor Reed');
    expect(normalizePersonaDisplayName(' x '.repeat(40))).toHaveLength(50);
  });

  it('maps selected gender to a useful default without guessing when withheld', () => {
    expect(accountGenderPronouns('woman')).toBe('she/her');
    expect(accountGenderPronouns('man')).toBe('he/him');
    expect(accountGenderPronouns('nonbinary')).toBe('they/them');
    expect(accountGenderPronouns('prefer_not_to_say')).toBeNull();
  });

  it('derives an adult age using the same UTC boundary as eligibility', () => {
    const now = new Date('2026-09-07T18:00:00.000Z');
    expect(ageFromBirthdate('2008-09-07', now)).toBe(18);
    expect(ageFromBirthdate('2008-09-08', now)).toBeNull();
    expect(ageFromBirthdate('1906-09-07', now)).toBe(120);
  });
});
