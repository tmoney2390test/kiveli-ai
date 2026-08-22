import type { SupabaseClient } from '@supabase/supabase-js';

export type ExperienceClock = {
  now: string;
  timezone: string;
  localDate: string;
  localTime: string;
  weekday: number;
  minuteOfDay: number;
  daypart: 'overnight'|'morning'|'afternoon'|'evening'|'late_night';
};

export function safeTimezone(value: unknown): string {
  const timezone = typeof value === 'string' && value.trim() ? value.trim() : 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date()); return timezone; }
  catch { return 'UTC'; }
}

/**
 * The experience clock follows the viewer, not the fictional world's
 * canonical timezone. Authored hours such as 21:00 therefore always mean
 * 9 PM for the user who is viewing or planning the experience.
 */
export async function resolveUserExperienceTimezone(
  db: SupabaseClient,
  userId: string | undefined,
  fallback: unknown = 'UTC',
): Promise<string> {
  if (!userId) return safeTimezone(fallback);
  const [profile, preferences] = await Promise.all([
    db.from('together_profiles').select('experience_timezone').eq('user_id', userId).maybeSingle(),
    db.from('together_notification_preferences').select('timezone').eq('user_id', userId).maybeSingle(),
  ]);
  return safeTimezone(profile.data?.experience_timezone ?? preferences.data?.timezone ?? fallback);
}

export function experienceClock(timezoneValue: unknown, now = new Date()): ExperienceClock {
  const timezone = safeTimezone(timezoneValue);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  const hour = Number(part('hour')) % 24;
  const minute = Number(part('minute'));
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(part('weekday'));
  return {
    now: now.toISOString(), timezone,
    localDate: `${part('year')}-${part('month')}-${part('day')}`,
    localTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    weekday: Math.max(0, weekday), minuteOfDay: hour * 60 + minute,
    daypart: hour < 5 ? 'overnight' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 22 ? 'evening' : 'late_night',
  };
}

export function eventIsActive(event: Record<string, unknown> | null | undefined, now = new Date()): boolean {
  if (!event) return false;
  const metadata = (event.metadata ?? {}) as Record<string, unknown>;
  if (metadata.planStatus === 'cancelled') return false;
  const starts = new Date(String(event.starts_at ?? '')).getTime();
  const ends = event.ends_at ? new Date(String(event.ends_at)).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(starts) && starts <= now.getTime() && ends >= now.getTime();
}

export function sharedPlanStatus(event: Record<string, unknown>, now = new Date()): 'scheduled'|'active'|'completed'|'cancelled' {
  const metadata = (event.metadata ?? {}) as Record<string, unknown>;
  if (metadata.planStatus === 'cancelled') return 'cancelled';
  const starts = new Date(String(event.starts_at)).getTime();
  const ends = event.ends_at ? new Date(String(event.ends_at)).getTime() : starts + 2 * 3600000;
  if (now.getTime() < starts) return 'scheduled';
  if (now.getTime() <= ends) return 'active';
  return 'completed';
}

export function formatExperienceTime(value: string, timezoneValue: unknown): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { timeZone: safeTimezone(timezoneValue), weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}
