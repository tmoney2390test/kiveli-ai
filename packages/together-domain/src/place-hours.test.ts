import { describe, expect, it } from 'vitest';
import { defaultPlaceHoursDraft, placeHoursDraft, placeOpeningWindow, placeVisitFitsHours, serializePlaceHours, validPersonalPlaceHours } from './place-hours';

describe('personal place hours', () => {
  it('defaults to 24/7 and reveals 9–6 daily hours when unchecked', () => {
    const draft = defaultPlaceHoursDraft();
    expect(serializePlaceHours(draft)).toEqual({ open: '00:00', close: '24:00' });
    expect(serializePlaceHours({ ...draft, alwaysOpen: false })).toEqual({ open: '09:00', close: '18:00' });
    expect(placeOpeningWindow(serializePlaceHours(draft), 2, 1439)).toEqual({ isOpen: true, closingMinute: null });
  });
  it('round trips individual days and closed days', () => {
    const draft = defaultPlaceHoursDraft();
    draft.alwaysOpen = false; draft.repeatDaily = false;
    draft.days.mon = { open: '10:00', close: '19:00', closed: false };
    draft.days.sun.closed = true;
    const saved = serializePlaceHours(draft);
    expect(validPersonalPlaceHours(saved)).toBe(true);
    const restored = placeHoursDraft(saved);
    expect(restored.days).toEqual(draft.days);
    expect(restored.repeatDaily).toBe(false);
    expect(placeVisitFitsHours(saved, 0, 600, 60)).toBe(false);
    expect(placeVisitFitsHours(saved, 1, 600, 60)).toBe(true);
    expect(placeVisitFitsHours(saved, 1, 9 * 60, 60)).toBe(false);
    expect(placeVisitFitsHours(saved, 1, 18 * 60 + 30, 60)).toBe(false);
  });
  it('restores legacy all-day hours with a useful daily default', () => {
    expect(placeHoursDraft({ open: '00:00', close: '00:00' })).toMatchObject({ alwaysOpen: true, daily: { open: '09:00', close: '18:00' } });
  });
  it('uses the daily fallback for malformed saved clock values', () => {
    expect(placeHoursDraft({ open: {}, close: '18:00' }).daily).toEqual({ open: '09:00', close: '18:00' });
    expect(placeHoursDraft({ mon: { open: {}, close: '17:00' } }).days.mon).toEqual({ open: '09:00', close: '17:00', closed: false });
  });
  it('carries Friday night opening into a closed Saturday morning, but not Sunday', () => {
    const draft = defaultPlaceHoursDraft(); draft.alwaysOpen = false; draft.repeatDaily = false;
    draft.days.fri = { open: '18:00', close: '02:00', closed: false };
    draft.days.sat.closed = true; draft.days.sun.closed = true;
    const hours = serializePlaceHours(draft);
    expect(placeOpeningWindow(hours, 5, 23 * 60)).toEqual({ isOpen: true, closingMinute: 26 * 60 });
    expect(placeOpeningWindow(hours, 6, 60)).toEqual({ isOpen: true, closingMinute: 120 });
    expect(placeVisitFitsHours(hours, 6, 60, 90)).toBe(false);
    expect(placeVisitFitsHours(hours, 0, 60, 30)).toBe(false);
  });
  it('does not treat an individual 24-hour day as open across the closed next day', () => {
    const draft = defaultPlaceHoursDraft(); draft.alwaysOpen = false; draft.repeatDaily = false;
    draft.days.mon = { open: '00:00', close: '24:00', closed: false }; draft.days.tue.closed = true;
    expect(placeOpeningWindow(serializePlaceHours(draft), 1, 23 * 60)).toEqual({ isOpen: true, closingMinute: 1440 });
  });
  it('rejects incomplete schedules and malformed or equal times', () => {
    for (const value of [{ mon: { open: '09:00', close: '18:00' } }, { open: '', close: '18:00' }, { open: '24:00', close: '18:00' }, { open: '09:60', close: '18:00' }, { open: '09:00', close: '09:00' }]) expect(validPersonalPlaceHours(value)).toBe(false);
  });
});
