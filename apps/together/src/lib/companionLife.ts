import type { CharacterInstance, ScheduleItem, Snapshot } from '../types';

export type CompanionLifeSnapshot = {
  companion: CharacterInstance;
  relationship: Snapshot['relationships'][number] | undefined;
  relationshipDay: number;
  location: Snapshot['locations'][number] | undefined;
  recentEvents: Snapshot['lifeEvents'];
  upcomingSchedule: Array<ScheduleItem & { locationName: string; startsAt: Date; endsAt: Date }>;
  proactiveMessages: Snapshot['proactiveMessages'];
  dates: Snapshot['dates'];
  moments: Snapshot['moments'];
  openThreads: Snapshot['openThreads'];
};

export function activeCompanion(snapshot: Snapshot, companionId?: string): CharacterInstance | undefined {
  return snapshot.characters.find((item) => item.id === companionId)
    ?? snapshot.characters.find((item) => item.id === snapshot.profile?.active_companion_instance_id)
    ?? snapshot.characters.find((item) => Boolean(item.contact_added_at))
    ?? snapshot.characters[0];
}

export function buildCompanionLife(snapshot: Snapshot, now = new Date(), companionId?: string): CompanionLifeSnapshot | undefined {
  const companion = activeCompanion(snapshot, companionId);
  if (!companion) return undefined;
  const location = snapshot.locations.find((item) => item.id === companion.current_location_id);
  const date = now.getDate(), month = now.getMonth(), year = now.getFullYear();
  const upcomingSchedule = snapshot.schedules.filter((item) => item.character_version_id === companion.character_version_id && item.day_of_week === now.getDay() && item.start_minute > now.getHours() * 60 + now.getMinutes()).sort((a, b) => a.start_minute - b.start_minute).slice(0, 3).map((item) => {
    const startsAt = new Date(year, month, date, Math.floor(item.start_minute / 60), item.start_minute % 60);
    const endsAt = new Date(year, month, date, Math.floor(item.end_minute / 60), item.end_minute % 60);
    return { ...item, startsAt, endsAt, locationName: snapshot.locations.find((place) => place.id === item.location_id)?.name ?? 'City Life' };
  });
  return {
    companion,
    relationship: snapshot.relationships.find((item) => item.character_instance_id === companion.id),
    relationshipDay: Math.max(1, Math.floor((now.getTime() - new Date(companion.met_at || companion.contact_added_at || now.toISOString()).getTime()) / 86400000) + 1),
    location,
    recentEvents: snapshot.lifeEvents.filter((event) => event.character_instance_id === companion.id).filter((event) => event.user_should_know !== false).slice(0, 8),
    upcomingSchedule,
    proactiveMessages: snapshot.proactiveMessages.filter((message) => message.character_instance_id === companion.id),
    dates: snapshot.dates.filter((item) => item.character_instance_id === companion.id),
    moments: snapshot.moments,
    openThreads: snapshot.openThreads,
  };
}

export function formatScheduleTime(value: Date): string { return value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
