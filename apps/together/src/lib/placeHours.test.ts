import { describe, expect, it } from 'vitest';
import { hasPublishedPlaceHours, placeHoursStatus } from './placeHours';

describe('place hours', () => {
  it('uses the viewer timezone for daytime hours', () => {
    const now = new Date('2026-08-20T14:30:00Z');
    expect(placeHoursStatus({ open: '09:00', close: '17:00' }, now, 'America/New_York').isOpen).toBe(true);
    expect(placeHoursStatus({ open: '09:00', close: '17:00' }, now, 'America/Los_Angeles').isOpen).toBe(false);
  });

  it('handles venues that close after midnight', () => {
    const afterMidnight = new Date('2026-08-21T04:30:00Z');
    expect(placeHoursStatus({ open: '17:00', close: '01:00' }, afterMidnight, 'America/New_York')).toMatchObject({
      state: 'open',
      statusLabel: 'Open now · until 1 AM',
    });
  });

  it('does not claim a place is open without authored hours', () => {
    expect(hasPublishedPlaceHours(undefined)).toBe(false);
    expect(placeHoursStatus(undefined)).toMatchObject({ state: 'unknown', isOpen: false, statusLabel: 'Hours not published' });
  });
});
