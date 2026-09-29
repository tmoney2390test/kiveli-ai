import type { Location } from '../types';
import { PLACE_DAYS, placeHoursOnDay, placeOpeningWindow } from '@together/domain/src/place-hours';

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
  const clock = localClock(now, timezone);
  const weekly = PLACE_DAYS.some(day => hours?.[day] !== undefined);
  const today = placeHoursOnDay(hours, clock.weekday);
  const window = placeOpeningWindow(hours, clock.weekday, clock.minute);
  const open = parseMinute(today?.open);
  const close = parseMinute(today?.close);
  if (today?.closed === true) return { state: window.isOpen ? 'open' : 'closed', isOpen: window.isOpen, statusLabel: window.isOpen && window.closingMinute !== null ? `Open now · until ${formatMinute(window.closingMinute)}` : 'Closed today', scheduleLabel: 'Today · Closed' };
  if (open === null || close === null) {
    return { state: 'unknown', isOpen: false, statusLabel: 'Hours not published', scheduleLabel: 'Hours not published' };
  }

  const scheduleLabel = open === close || (open === 0 && (close === 1439 || close === 1440))
    ? 'Open 24 hours'
    : `${weekly ? 'Today' : 'Daily'} ${formatMinute(open)}–${formatMinute(close)}`;
  if (open === close || (open === 0 && (close === 1439 || close === 1440))) {
    return { state: 'open', isOpen: true, statusLabel: 'Open now · 24 hours', scheduleLabel };
  }

  const isOpen = window.isOpen;
  return {
    state: isOpen ? 'open' : 'closed',
    isOpen,
    statusLabel: isOpen ? `Open now · until ${formatMinute(window.closingMinute ?? close)}` : `Closed · opens ${formatMinute(open)}`,
    scheduleLabel,
  };
}

export function hasPublishedPlaceHours(hours: Location['hours']) {
  if (PLACE_DAYS.some(day => hours?.[day] !== undefined)) return PLACE_DAYS.every((_, index) => {
    const row = placeHoursOnDay(hours, index);
    return row?.closed === true || (parseMinute(row?.open) !== null && parseMinute(row?.close) !== null);
  });
  return parseMinute(hours?.open) !== null && parseMinute(hours?.close) !== null;
}

function localClock(now: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    }).formatToParts(now);
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
    const hour = part('hour');
    const minute = part('minute');
    const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.find(item => item.type === 'weekday')?.value ?? '');
    if (Number.isFinite(hour) && Number.isFinite(minute) && weekday >= 0) return { minute: hour * 60 + minute, weekday };
  } catch {
    // Fall back to the device clock when a stored timezone is invalid.
  }
  return { minute: now.getHours() * 60 + now.getMinutes(), weekday: now.getDay() };
}

function parseMinute(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 24 || minute < 0 || minute > 59 || (hour === 24 && minute !== 0)) return null;
  return hour * 60 + minute;
}

function formatMinute(value: number) {
  const normalized = ((value % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return minute ? `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}` : `${displayHour} ${suffix}`;
}
