export const PLACE_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type PlaceDay = typeof PLACE_DAYS[number];
export type PlaceDayHours = { open: string; close: string; closed?: false } | { closed: true };
export type PersonalPlaceHours = { open: string; close: string } | Record<PlaceDay, PlaceDayHours>;
export type PlaceHoursDraft = {
  alwaysOpen: boolean;
  repeatDaily: boolean;
  daily: { open: string; close: string };
  days: Record<PlaceDay, { open: string; close: string; closed: boolean }>;
};

export function defaultPlaceHoursDraft(): PlaceHoursDraft {
  return { alwaysOpen: true, repeatDaily: true, daily: { open: '09:00', close: '18:00' },
    days: Object.fromEntries(PLACE_DAYS.map(day => [day, { open: '09:00', close: '18:00', closed: false }])) as PlaceHoursDraft['days'] };
}

function clockTextOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function placeHoursDraft(hours?: Record<string, unknown> | null): PlaceHoursDraft {
  const draft = defaultPlaceHoursDraft();
  if (!hours || !Object.keys(hours).length) return draft;
  const weekly = PLACE_DAYS.some(day => hours[day] !== undefined);
  draft.repeatDaily = !weekly;
  draft.alwaysOpen = !weekly && hours['open'] === '00:00' && ['00:00', '23:59', '24:00'].includes(String(hours['close']));
  if (draft.alwaysOpen) return draft;
  if (!weekly) draft.daily = { open: clockTextOr(hours['open'], '09:00'), close: clockTextOr(hours['close'], '18:00') };
  for (const day of PLACE_DAYS) {
    const raw = hours[day] ?? hours['default'] ?? hours;
    const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    draft.days[day] = { open: clockTextOr(value['open'], draft.daily.open), close: clockTextOr(value['close'], draft.daily.close), closed: raw === 'closed' || value['closed'] === true };
  }
  return draft;
}

export function serializePlaceHours(draft: PlaceHoursDraft): PersonalPlaceHours {
  if (draft.alwaysOpen) return { open: '00:00', close: '24:00' };
  if (draft.repeatDaily) return { ...draft.daily };
  return Object.fromEntries(PLACE_DAYS.map(day => [day, draft.days[day].closed ? { closed: true } : { open: draft.days[day].open, close: draft.days[day].close }])) as Record<PlaceDay, PlaceDayHours>;
}

export function validPersonalPlaceHours(value: unknown): value is PersonalPlaceHours {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const hours = value as Record<string, unknown>;
  const validWindow = (item: unknown): boolean => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    if (row['closed'] === true) return true;
    const open = placeClockMinute(row['open']), close = placeClockMinute(row['close']);
    return open !== null && close !== null && open < 1440 && (open !== close || open === 0);
  };
  if (PLACE_DAYS.some(day => hours[day] !== undefined)) return PLACE_DAYS.every(day => validWindow(hours[day]));
  return hours['closed'] !== true && validWindow(hours);
}

export function placeClockMinute(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  return hour <= 24 && minute < 60 && (hour < 24 || minute === 0) ? hour * 60 + minute : null;
}

/** Uses Sunday=0, like Date.getDay() and the canonical user-local clock. */
export function placeHoursOnDay(hours: Record<string, unknown> | null | undefined, weekday: number): Record<string, unknown> | null {
  if (!hours) return null;
  const day = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][((weekday % 7) + 7) % 7]!;
  const raw = hours[day] ?? hours['default'] ?? hours;
  if (raw === 'closed') return { closed: true };
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
}

export function placeOpeningWindow(hours: Record<string, unknown> | null | undefined, weekday: number, startMinute: number): { isOpen: boolean; closingMinute: number | null } {
  if (!hours || !Object.keys(hours).length) return { isOpen: true, closingMinute: null };
  const intervals: Array<[number, number]> = [];
  for (let offset = -1; offset <= 7; offset++) {
    const row = placeHoursOnDay(hours, weekday + offset);
    if (row?.['closed'] === true) continue;
    const open = placeClockMinute(row?.['open']), close = placeClockMinute(row?.['close']);
    if (open === null || close === null || open === close || (open === 0 && close >= 1439)) {
      intervals.push([offset * 1440, (offset + 1) * 1440]);
    } else intervals.push([offset * 1440 + open, offset * 1440 + close + (close < open ? 1440 : 0)]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let closing: number | null = null;
  for (const [open, close] of intervals) {
    if (closing === null) { if (startMinute >= open && startMinute < close) closing = close; }
    else if (open <= closing) closing = Math.max(closing, close);
    else break;
  }
  return closing === null ? { isOpen: false, closingMinute: null } : { isOpen: true, closingMinute: closing >= 8 * 1440 ? null : closing };
}

export function placeVisitFitsHours(hours: Record<string, unknown> | null | undefined, weekday: number, startMinute: number, durationMinutes: number): boolean {
  if (!(durationMinutes > 0)) return false;
  const window = placeOpeningWindow(hours, weekday, startMinute);
  return window.isOpen && (window.closingMinute === null || startMinute + durationMinutes <= window.closingMinute);
}
