import { describe, expect, it } from 'vitest';
import { cleanScheduleActivity, specificScheduleVariants } from './schedule-language.ts';

describe('schedule presentation language', () => {
  it('keeps the character-specific activity and drops recovery filler', () => {
    expect(specificScheduleVariants([
      'Checking patient requests and preparing clinic doses',
      'Making time for a familiar routine',
      "Following the day's routine at an easy pace",
    ], 'Checking patient requests and preparing clinic doses')).toEqual([
      'Checking patient requests and preparing clinic doses',
    ]);
  });

  it('removes a vague suffix without losing the actual activity', () => {
    expect(cleanScheduleActivity('Editing photographs while leaving room for the day to change naturally')).toBe('Editing photographs');
  });

  it('keeps concrete work and home activities ahead of recovery padding', () => {
    expect(specificScheduleVariants(['Checking the night clinic supplies', "Staying focused on today's work", "Taking care of the day's responsibilities"])).toEqual(['Checking the night clinic supplies']);
    expect(specificScheduleVariants(['Getting ready for the day at home', 'Having some quiet time at home', 'Keeping this part of the day private at home'])).toEqual(['Getting ready for the day at home']);
    expect(specificScheduleVariants(['Getting ready for the day at home', 'Spending some time at Home', 'Getting ready for the day at home'])).toEqual(['Getting ready for the day at home']);
    expect(specificScheduleVariants(['Having some quiet time at home'], 'Having some quiet time at home')).toEqual(['Having some quiet time at home']);
  });
});
