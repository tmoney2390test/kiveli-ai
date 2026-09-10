import { describe, expect, it } from 'vitest';
import { storyReturnDate } from './worldStoryPresentation';
describe('story return dates', () => {
  const now = new Date(2026, 8, 9, 10);
  it('rejects impossible dates instead of rolling into another month', () => {
    expect(() => storyReturnDate('2027-02-29', now)).toThrow('real calendar date');
    expect(() => storyReturnDate('2026-09-31', now)).toThrow('real calendar date');
    expect(() => storyReturnDate('2026-13-01', now)).toThrow('real calendar date');
  });
  it('accepts leap days and preserves the selected local day', () => {
    const date = new Date(storyReturnDate('2028-02-29', now));
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2028, 1, 29, 12]);
  });
  it('rejects past dates and malformed input before saving a choice', () => {
    expect(() => storyReturnDate('2026-09-08', now)).toThrow('future');
    expect(() => storyReturnDate('tomorrow', now)).toThrow('YYYY-MM-DD');
  });
});
