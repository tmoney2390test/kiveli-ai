import type { CharacterInstance, CharacterScheduleEvent, ScheduleItem, Snapshot } from '../types';
import { getScheduleEventPresentation, getScheduleHint } from './lifePresentation';

export type CharacterDayScheduleEntry = {
  id: string;
  activity: string;
  time: string;
  locationId?: string;
  location?: string;
  current: boolean;
  past: boolean;
};

export type CharacterDaySchedule = {
  dateLabel: string;
  entries: CharacterDayScheduleEntry[];
  source: 'authored' | 'generated' | 'recurring' | 'none';
  currentStatus?: Pick<CharacterDayScheduleEntry, 'activity' | 'location' | 'locationId'>;
};

export function buildCharacterDaySchedule(input: {
  snapshot: Snapshot;
  instance?: CharacterInstance;
  characterVersionId: string;
  timezone?: string;
  now?: Date;
}): CharacterDaySchedule {
  const { snapshot, instance, characterVersionId } = input;
  const now = input.now ?? new Date();
  // Character routines intentionally follow the user's clock. A world's
  // timezone remains useful for place ambience, but never decides whether a
  // character's calendar block is current.
  const timezone = safeTimezone(snapshot.profile?.experience_timezone ?? input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC');
  const dateLabel = new Intl.DateTimeFormat(undefined, { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  const weekday = localWeekday(now, timezone);
  const localMinute = localMinuteOfDay(now, timezone);
  const dateKey = localDateKey(now, timezone);
  const recurring = snapshot.schedules
    .filter((item) => item.character_version_id === characterVersionId && item.day_of_week === weekday)
    .filter((item) => item.metadata?.profileVisibility !== 'hidden')
    .sort((left, right) => left.start_minute - right.start_minute);
  const authored = recurring.filter((item) => item.metadata?.scheduleMode === 'authored');

  // An authored timetable is character canon. Generated events remain the
  // fallback for characters that have not received one yet.
  if (authored.length) {
    const entries = authored.map((item) => recurringEntry(snapshot, item, localMinute, dateKey));
    const current = entries.find((entry) => entry.current);
    return {
      dateLabel,
      entries,
      source: 'authored',
      currentStatus: current
        ? { activity: current.activity, location: current.location, locationId: current.locationId }
        : passiveHomeStatus(localMinute),
    };
  }

  const generated = instance
    ? visibleEventsForLocalDay(snapshot.scheduleEvents ?? [], instance.id, now, timezone)
    : [];

  if (generated.length) {
    const entries = generated.map((event) => generatedEntry(snapshot, event, now, timezone));
    const current = entries.find((entry) => entry.current);
    return {
      dateLabel,
      entries,
      source: 'generated',
      currentStatus: current ? { activity: current.activity, location: current.location, locationId: current.locationId } : undefined,
    };
  }

  const entries = recurring.map((item) => recurringEntry(snapshot, item, localMinute, dateKey));
  const current = entries.find((entry) => entry.current);
  return {
    dateLabel,
    entries,
    source: entries.length ? 'recurring' : 'none',
    currentStatus: current ? { activity: current.activity, location: current.location, locationId: current.locationId } : undefined,
  };
}

function visibleEventsForLocalDay(events: CharacterScheduleEvent[], characterId: string, now: Date, timezone: string) {
  const today = localDateKey(now, timezone);
  return events
    .filter((event) => event.character_instance_id === characterId && event.visibility !== 'hidden')
    .filter((event) => localDateKey(new Date(event.starts_at), timezone) <= today && localDateKey(new Date(event.ends_at), timezone) >= today)
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime());
}

function generatedEntry(snapshot: Snapshot, event: CharacterScheduleEvent, now: Date, timezone: string): CharacterDayScheduleEntry {
  const startsAt = new Date(event.starts_at);
  const endsAt = new Date(event.ends_at);
  const presentation = getScheduleEventPresentation(event);
  return {
    id: event.id,
    activity: getScheduleHint(event) ?? presentation.activity,
    time: `${formatTime(startsAt, timezone)}–${formatTime(endsAt, timezone)}`,
    locationId: event.location_id ?? undefined,
    location: displayLocation(event.metadata) ?? snapshot.locations.find((item) => item.id === event.location_id)?.name,
    current: startsAt <= now && endsAt > now,
    past: endsAt <= now,
  };
}

function recurringEntry(snapshot: Snapshot, item: ScheduleItem, localMinute: number, dateKey: string): CharacterDayScheduleEntry {
  return {
    id: `routine:${item.id}`,
    activity: activityForDate(item, dateKey),
    time: `${formatMinute(item.start_minute)}–${formatMinute(item.end_minute)}`,
    locationId: item.location_id ?? undefined,
    location: displayLocation(item.metadata) ?? snapshot.locations.find((place) => place.id === item.location_id)?.name,
    current: item.start_minute <= localMinute && item.end_minute > localMinute,
    past: item.end_minute <= localMinute,
  };
}

function activityForDate(item: ScheduleItem, dateKey: string) {
  const variants = Array.isArray(item.metadata?.activityVariants)
    ? item.metadata.activityVariants.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    : [];
  if (!variants.length) return humanize(item.activity);
  return variants[stableIndex(`${item.id}:${dateKey}`, variants.length)] ?? humanize(item.activity);
}

function displayLocation(metadata?: Record<string, unknown>) {
  const value = metadata?.displayLocation;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stableIndex(seed: string, length: number) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = Math.imul(31, hash) + seed.charCodeAt(index) | 0;
  return (hash >>> 0) % length;
}

function localDateKey(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function localWeekday(value: Date, timezone: string) {
  const short = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(value);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
}

function localMinuteOfDay(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(value);
  const hour = Number(parts.find((item) => item.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((item) => item.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function formatTime(value: Date, timezone: string) {
  return value.toLocaleTimeString([], { timeZone: timezone, hour: 'numeric', minute: '2-digit' });
}

/** Authored schedule gaps are private home time, expressed naturally for the viewer's clock. */
function passiveHomeStatus(localMinute:number):Pick<CharacterDayScheduleEntry,'activity'|'location'>{
  if(localMinute<7*60||localMinute>=23*60)return{activity:'Sleeping at home',location:'Home'};
  if(localMinute<10*60)return{activity:'Starting the day at home',location:'Home'};
  if(localMinute<17*60)return{activity:'Having some downtime at home',location:'Home'};
  if(localMinute<22*60)return{activity:'Relaxing at home',location:'Home'};
  return{activity:'Winding down at home',location:'Home'};
}

function formatMinute(value: number) {
  const hour24 = Math.floor(value / 60) % 24;
  const minute = value % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour24 % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function humanize(value: string) {
  return value.trim().replace(/[_-]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) || 'Free time';
}

function safeTimezone(value: string) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return value; }
  catch { return 'UTC'; }
}
