import type { Location } from '../types';

export type PlaceHoursStatus = {
  state: 'open' | 'closed' | 'unknown';
  isOpen: boolean;
  statusLabel: string;
  scheduleLabel: string;
};

export function placeHoursStatus(
  hours: Location['hours'],
  now = new Date(),
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
): PlaceHoursStatus {
  const open = parseMinute(hours?.open);
  const close = parseMinute(hours?.close);
  if (open === null || close === null) {
    return { state: 'unknown', isOpen: false, statusLabel: 'Hours not published', scheduleLabel: 'Hours not published' };
  }

  const scheduleLabel = open === close || (open === 0 && close === 1439)
    ? 'Open 24 hours'
    : `Daily ${formatMinute(open)}–${formatMinute(close)}`;
  if (open === close || (open === 0 && close === 1439)) {
    return { state: 'open', isOpen: true, statusLabel: 'Open now · 24 hours', scheduleLabel };
  }

  const minute = localMinute(now, timezone);
  const isOpen = close > open ? minute >= open && minute < close : minute >= open || minute < close;
  return {
    state: isOpen ? 'open' : 'closed',
    isOpen,
    statusLabel: isOpen ? `Open now · until ${formatMinute(close)}` : `Closed · opens ${formatMinute(open)}`,
    scheduleLabel,
  };
}

export function hasPublishedPlaceHours(hours: Location['hours']) {
  return parseMinute(hours?.open) !== null && parseMinute(hours?.close) !== null;
}

function localMinute(now: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
    const hour = part('hour');
    const minute = part('minute');
    if (Number.isFinite(hour) && Number.isFinite(minute)) return hour * 60 + minute;
  } catch {
    // Fall back to the device clock when a stored timezone is invalid.
  }
  return now.getHours() * 60 + now.getMinutes();
}

function parseMinute(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatMinute(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return minute ? `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}` : `${displayHour} ${suffix}`;
}
