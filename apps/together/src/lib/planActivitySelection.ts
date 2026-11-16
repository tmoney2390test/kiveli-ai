import type { Location } from '../types';
import { cleanPlanActivity, PLAN_ACTIVITY_MAX_LENGTH } from './planActivity';
import { venuePrograms, type PlanOption } from './plans';

const activityKey = (value: string) => cleanPlanActivity(value.replace(/_/g, ' ')).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Selecting an authored activity retains its timing rules; custom text stays readable. */
export function planningActivityOption(location: Location, value: string, options: PlanOption[] = []): PlanOption {
  const activity = cleanPlanActivity(value);
  if (!activity || activity.length > PLAN_ACTIVITY_MAX_LENGTH) throw new Error('Enter an activity of up to 120 characters.');
  const existing = options.find(option => option.locationId === location.id && activityKey(option.activityKey) === activityKey(activity));
  if (existing) return existing;
  const program = venuePrograms(location).find(item => activityKey(item.activityKey) === activityKey(activity));
  return {
    id: `activity:${location.id}:${activity}`,
    title: location.category === 'home' ? activity : `${activity} at ${location.name}`,
    description: location.description,
    locationId: location.id,
    locationName: location.name,
    activityKey: program?.activityKey ?? activity,
    source: 'location_activity',
    tags: [],
    durationMinutes: program?.durationMinutes ?? 90,
    reason: location.character_home_id ? 'Their home' : location.owner_user_id ? 'Your private place' : 'Your choice',
    hours: location.hours,
    program,
  };
}

export function planningActivitySuggestions(location: Location): string[] {
  return [
    ...(location.possible_activities ?? []),
    ...(Array.isArray(location.metadata?.date_types) ? location.metadata.date_types.map(String) : []),
    ...venuePrograms(location).map(program => program.activityKey.replace(/_/g, ' ')),
  ];
}
