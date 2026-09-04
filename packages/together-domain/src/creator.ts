export const creatorSteps = ['identity', 'appearance', 'personality', 'life', 'connection', 'meeting', 'review'] as const;
export type CreatorStep = typeof creatorSteps[number];

export type CreatorRoutineBlock = {
  id: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  locationId: string;
  activity: string;
  availability: 'available' | 'limited' | 'busy';
  energyDelta: number;
  moodInfluence?: string;
};

export type CreatorReadinessInput = {
  identity: Record<string, unknown>;
  appearance: Record<string, unknown>;
  routine: { blocks?: CreatorRoutineBlock[] };
  firstMeeting: { selectedId?: string | null; options?: Array<{ id: string }> };
  hasSelectedAsset: boolean;
  hasLegacyReference?: boolean;
  requireGender?: boolean;
};

export type CreatorReadiness = {
  ready: boolean;
  missing: Array<'identity' | 'appearance' | 'routine' | 'first_meeting'>;
};

export function creatorReadiness(input: CreatorReadinessInput): CreatorReadiness {
  const missing: CreatorReadiness['missing'] = [];
  const age = Number(input.identity['age'] ?? 0);
  const name = typeof input.identity['name'] === 'string' ? input.identity['name'] : '';
  const occupation = typeof input.identity['occupation'] === 'string' ? input.identity['occupation'] : '';
  const biography = typeof input.identity['biography'] === 'string' ? input.identity['biography'] : '';
  const gender = typeof input.identity['gender'] === 'string' ? input.identity['gender'] : '';
  if (
    name.trim().length < 1
    || age < 18
    || occupation.trim().length < 1
    || biography.trim().length < 20
    || (input.requireGender === true && gender.trim().length < 1)
  ) missing.push('identity');
  if (!input.hasSelectedAsset && !input.hasLegacyReference) missing.push('appearance');
  if (!Array.isArray(input.routine.blocks) || input.routine.blocks.length === 0 || routineConflicts(input.routine.blocks).length > 0) missing.push('routine');
  const selected = input.firstMeeting.options?.some((option) => option.id === input.firstMeeting.selectedId);
  if (!selected) missing.push('first_meeting');
  return { ready: missing.length === 0, missing };
}

export function routineConflicts(blocks: CreatorRoutineBlock[]): Array<{ firstId: string; secondId: string }> {
  const conflicts: Array<{ firstId: string; secondId: string }> = [];
  const ordered = [...blocks].sort((left, right) => left.dayOfWeek - right.dayOfWeek || left.startMinute - right.startMinute);
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index]!;
    if (current.dayOfWeek < 0 || current.dayOfWeek > 6 || current.startMinute < 0 || current.endMinute > 1440 || current.endMinute <= current.startMinute) {
      conflicts.push({ firstId: current.id, secondId: current.id });
      continue;
    }
    const next = ordered[index + 1];
    if (next && current.dayOfWeek === next.dayOfWeek && current.endMinute > next.startMinute) conflicts.push({ firstId: current.id, secondId: next.id });
  }
  return conflicts;
}

export function creatorSampleMessages(input: {
  name: string;
  warmth: number;
  humor: number;
  directness: number;
  messageLength?: string;
}): string[] {
  const opening = input.directness >= 0.65
    ? `Tell me what you actually think.`
    : `You can take your time. I'm listening.`;
  const playful = input.humor >= 0.65
    ? `That is a confident answer. I'm deciding whether it was also a good one.`
    : `I noticed that. I just wasn't going to interrupt you.`;
  const warm = input.warmth >= 0.65
    ? `You don't have to make it sound smaller for me.`
    : `I understand. I may need a little time before I know what I think.`;
  return input.messageLength === 'concise' ? [opening, playful] : [opening, playful, warm].map((message) => `${input.name}: ${message}`);
}
