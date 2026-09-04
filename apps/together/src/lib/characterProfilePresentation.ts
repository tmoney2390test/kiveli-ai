import type { CharacterDayScheduleEntry } from './characterDaySchedule';
import type { DateSession, Location, SharedPlan } from '../types';
import { DEFAULT_INITIAL_TRUST } from '@together/domain/src/relationship';

export type CharacterProfileStat = {
  value: string;
  label: string;
};

export type CharacterRelationshipPresentation = {
  heading: string | null;
  supportingCopy: string | null;
  stats: CharacterProfileStat[];
};

export type CharacterTrustPresentation = {
  value: number;
  label: string;
  detail: string;
  trendLabel: string | null;
  tone: 'steady' | 'strained' | 'repairing';
  recentChange: number | null;
};

export type CharacterUpcomingCommitment = {
  id: string;
  kind: 'plan' | 'date';
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  locationId: string | null;
  locationName: string;
  status: 'active' | 'upcoming';
  route: string;
};

export function characterUpcomingCommitments(input: {
  characterInstanceId: string;
  plans: readonly SharedPlan[];
  dates: readonly DateSession[];
  locations: readonly Location[];
  now?: Date;
}): CharacterUpcomingCommitment[] {
  const now = input.now ?? new Date();
  const locationName = (locationId?: string | null, fallback?: string | null) =>
    input.locations.find((item) => item.id === locationId)?.name ?? fallback ?? 'Location to be decided';
  const plans = input.plans
    .filter((plan) => plan.character_instance_id === input.characterInstanceId || plan.participant_instance_ids?.includes(input.characterInstanceId))
    .filter((plan) => plan.status === 'active' || plan.status === 'scheduled' && new Date(plan.ends_at).getTime() > now.getTime())
    .map<CharacterUpcomingCommitment>((plan) => ({
      id: plan.id,
      kind: 'plan',
      title: plan.title,
      description: plan.note?.trim() || null,
      startsAt: plan.starts_at,
      endsAt: plan.ends_at,
      locationId: plan.location_id,
      locationName: locationName(plan.location_id, plan.together_locations?.name),
      status: plan.status === 'active' ? 'active' : 'upcoming',
      route: `/plan/${plan.id}`,
    }));
  const linkedPlanIds = new Set(plans.map((plan) => plan.id));
  const dates = input.dates
    .filter((date) => date.character_instance_id === input.characterInstanceId)
    .filter((date) => (date.status === 'active' || date.status === 'upcoming') && Boolean(date.scheduled_for))
    .filter((date) => !date.shared_plan_id || !linkedPlanIds.has(date.shared_plan_id))
    .filter((date) => date.status === 'active' || new Date(date.scheduled_for!).getTime() > now.getTime())
    .map<CharacterUpcomingCommitment>((date) => ({
      id: date.id,
      kind: 'date',
      title: date.together_date_templates.name,
      description: date.together_date_templates.description?.trim() || null,
      startsAt: date.scheduled_for!,
      endsAt: null,
      locationId: date.together_date_templates.location_id ?? null,
      locationName: locationName(date.together_date_templates.location_id),
      status: date.status === 'active' ? 'active' : 'upcoming',
      route: `/date/${date.id}`,
    }));

  return [...plans, ...dates].sort((left, right) => {
    if (left.status !== right.status) return left.status === 'active' ? -1 : 1;
    return new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
  });
}

export function characterTrustPresentation(rawValue: unknown, context: {
  recentDirection?: unknown;
  recentTrustChange?: unknown;
} = {}): CharacterTrustPresentation {
  const parsed = rawValue === null || rawValue === undefined ? DEFAULT_INITIAL_TRUST : Number(rawValue);
  const value = Math.max(0, Math.min(100, Math.round(Number.isFinite(parsed) ? parsed : 0)));
  const direction = String(context.recentDirection ?? '').trim().toLowerCase();
  const tone: CharacterTrustPresentation['tone'] = direction === 'repairing'
    ? 'repairing'
    : direction === 'strained'
      ? 'strained'
      : 'steady';
  const parsedChange = Number(context.recentTrustChange);
  const recentChange = tone === 'steady' || !Number.isFinite(parsedChange) || parsedChange === 0
    ? null
    : Math.max(-100, Math.min(100, Math.round(parsedChange)));
  const label = value >= 80
    ? 'Deep trust'
    : value >= 60
      ? 'Strong trust'
      : value >= 35
        ? 'Growing trust'
        : value >= 14
          ? 'Taking root'
          : 'Still new';

  return {
    value,
    label,
    tone,
    recentChange,
    trendLabel: tone === 'strained' ? 'Recently strained' : tone === 'repairing' ? 'Repairing' : null,
    detail: tone === 'strained'
      ? 'Trust took a hit recently. Being honest, respecting their boundaries, and following through will help, but it may take a little time.'
      : tone === 'repairing'
        ? 'You’ve started to make things right. Keep being honest and following through, and trust can grow again over time.'
        : 'Trust shows how safe and dependable this relationship feels to them. It grows when you’re honest, keep promises, and show up for them. It can drop when you lie, break promises, ignore their boundaries, or repeatedly let them down.',
  };
}

export function characterRelationshipPresentation(input: {
  name: string;
  known: boolean;
  stage?: string | null;
  daysKnown: number;
  momentCount: number;
  placesTogether: number;
  upcomingCount: number;
}): CharacterRelationshipPresentation {
  if (!input.known) return { heading: null, supportingCopy: null, stats: [] };

  const stage = (input.stage ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  const newConnection = stage === 'stranger' || stage === 'new' || stage === 'introduced';
  const daysKnown = Math.max(1, Math.round(input.daysKnown || 1));
  const stats: CharacterProfileStat[] = [{
    value: daysKnown === 1 ? 'Today' : String(daysKnown),
    label: daysKnown === 1 ? 'Met' : 'Days known',
  }];

  if (input.momentCount > 0) stats.push({ value: String(input.momentCount), label: input.momentCount === 1 ? 'Moment' : 'Moments' });
  if (input.upcomingCount > 0) stats.push({ value: String(input.upcomingCount), label: 'Upcoming' });
  else if (input.placesTogether > 0) stats.push({ value: String(input.placesTogether), label: input.placesTogether === 1 ? 'Place together' : 'Places together' });

  return {
    heading: newConnection
      ? daysKnown === 1 ? `You’ve just met ${input.name}` : `Getting to know ${input.name}`
      : `Your relationship with ${input.name}`,
    supportingCopy: newConnection
      ? 'Your story is just beginning. The details you share and the time you spend together will shape what comes next.'
      : null,
    stats,
  };
}

export function compactCharacterSchedule(entries: readonly CharacterDayScheduleEntry[]): {
  entries: CharacterDayScheduleEntry[];
  hiddenCount: number;
} {
  if (entries.length <= 2) return { entries: [...entries], hiddenCount: 0 };

  const currentIndex = entries.findIndex((entry) => entry.current);
  let visible: CharacterDayScheduleEntry[];
  if (currentIndex >= 0) {
    const next = entries.slice(currentIndex + 1).find((entry) => !entry.past);
    visible = next ? [entries[currentIndex]!, next] : [entries[currentIndex]!];
  } else {
    const upcoming = entries.filter((entry) => !entry.past).slice(0, 2);
    visible = upcoming.length ? upcoming : [entries[entries.length - 1]!];
  }

  return { entries: visible, hiddenCount: Math.max(0, entries.length - visible.length) };
}

export function characterNameFromSlug(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim() || 'Character';
}
