import type { CharacterDayScheduleEntry } from './characterDaySchedule';
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
      ? 'Something recent affected this connection. Consistent, respectful follow-through can rebuild it over time.'
      : tone === 'repairing'
        ? 'A sincere repair helped. Trust returns gradually through accountability and changed behavior.'
        : 'Built through honest conversation, shared experiences, and reliability. Trust is separate from attraction.',
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
