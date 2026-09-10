import { describe, expect, it } from 'vitest';
import { formatQuietHoursRange } from './notificationPreferences';

describe('formatQuietHoursRange', () => {
  it('formats the default overnight window', () => {
    expect(formatQuietHoursRange('23:00', '08:00')).toBe('11 PM – 8 AM');
  });

  it('keeps minutes when they are meaningful', () => {
    expect(formatQuietHoursRange('21:30', '07:15')).toBe('9:30 PM – 7:15 AM');
  });

  it('falls back safely for missing or malformed preferences', () => {
    expect(formatQuietHoursRange(null, '08:00')).toBe('Set quiet hours');
    expect(formatQuietHoursRange('25:00', '08:00')).toBe('Set quiet hours');
  });
});
