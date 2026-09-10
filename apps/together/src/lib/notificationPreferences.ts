function formatClockTime(value: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${suffix}`;
}

export function formatQuietHoursRange(start?: string | null, end?: string | null): string {
  const formattedStart = formatClockTime(start ?? '');
  const formattedEnd = formatClockTime(end ?? '');
  return formattedStart && formattedEnd ? `${formattedStart} – ${formattedEnd}` : 'Set quiet hours';
}
