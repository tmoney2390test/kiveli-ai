import type { Snapshot } from '../types';

export function safeExperienceTimezone(value: unknown, fallback = 'UTC') {
  const candidate = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return fallback;
  }
}

export function deviceExperienceTimezone() {
  try {
    return safeExperienceTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return 'UTC';
  }
}

/** Authored clocks and hours follow the viewer's local experience clock. */
export function userExperienceTimezone(snapshot?: Pick<Snapshot, 'profile'|'notificationPreferences'> | null) {
  return safeExperienceTimezone(
    snapshot?.profile?.experience_timezone
      ?? snapshot?.notificationPreferences?.timezone
      ?? deviceExperienceTimezone(),
  );
}
