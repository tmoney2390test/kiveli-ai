type PlaceHours = { open?: unknown; close?: unknown } | null | undefined;

export function planFitsLocationHours(hours: PlaceHours, startMinute: number, endMinute: number) {
  const open = parseMinute(hours?.open);
  const close = parseMinute(hours?.close);
  if (open === null || close === null || open === close || (open === 0 && close === 1439)) return true;
  if (!locationStartsOpen(open, close, startMinute)) return false;
  if (close > open) return endMinute > startMinute && endMinute <= close;
  return startMinute >= open
    ? endMinute > open || endMinute <= close
    : endMinute > startMinute && endMinute <= close;
}

export function closedLocationPlanMessage(input: {
  name: string;
  hours: PlaceHours;
  startMinute: number;
  durationMinutes: number;
}) {
  const open = parseMinute(input.hours?.open);
  const close = parseMinute(input.hours?.close);
  if (open === null || close === null) return `${input.name} is closed at that time. Choose another time or place.`;

  if (!locationStartsOpen(open, close, input.startMinute)) {
    return `${input.name} opens at ${minuteLabel(open)}. Try then or choose another place.`;
  }

  const duration = Math.max(30, input.durationMinutes);
  const serviceWindow = close > open ? close - open : 1440 - open + close;
  if (duration > serviceWindow) {
    return `${input.name} is open from ${minuteLabel(open)} to ${minuteLabel(close)}, which is not long enough for this plan. Choose a shorter activity or another place.`;
  }
  const latestStart = normalizeMinute(close - duration);
  return `${input.name} closes at ${minuteLabel(close)}. Try ${minuteLabel(latestStart)} or choose another place.`;
}

function locationStartsOpen(open: number, close: number, startMinute: number) {
  return close > open
    ? startMinute >= open && startMinute < close
    : startMinute >= open || startMinute < close;
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

function normalizeMinute(value: number) {
  return ((value % 1440) + 1440) % 1440;
}

function minuteLabel(value: number) {
  const normalized = normalizeMinute(value);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}
