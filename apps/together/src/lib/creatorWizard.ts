import { routineConflicts } from '@together/domain/src/creator';
import type { CreatorConnectionConfig, CreatorIdentityConfig, CreatorLifeConfig, CreatorRoutineBlock, CreatorStep } from '../types';

export type CompanionBasics = {
  name: string;
  age: number;
  gender: string;
  pronouns: string;
  worldId: string;
  description: string;
};

export function companionBasicsIssues(value: CompanionBasics): string[] {
  const issues: string[] = [];
  if (value.name.trim().length < 1) issues.push('Enter their name.');
  if (!Number.isInteger(value.age) || value.age < 18 || value.age > 99) issues.push('Companions must have a confirmed age from 18 to 99.');
  if (value.gender.trim().length < 1) issues.push('Choose or enter their gender.');
  if (value.pronouns.trim().length < 1) issues.push('Enter their pronouns.');
  if (!value.worldId) issues.push('Choose the world they live in.');
  if (value.description.trim().length > 800) issues.push('Keep the starting description to 800 characters.');
  return issues;
}
export function creatorSectionIssues(input: {
  step: CreatorStep;
  identity: CreatorIdentityConfig;
  appearanceDescription: string;
  hasAppearance: boolean;
  life: CreatorLifeConfig;
  routine: CreatorRoutineBlock[];
  selectedMeeting: boolean;
  connection?: CreatorConnectionConfig;
}): string[] {
  const { step, identity } = input;
  const issues: string[] = [];
  if (step === 'identity' || step === 'personality') {
    if (!identity.name.trim()) issues.push('Name is required.');
    if (identity.name.trim().length > 50) issues.push('Keep their name to 50 characters.');
    if (!Number.isInteger(identity.age) || identity.age < 18 || identity.age > 99) issues.push('Age must be between 18 and 99.');
    if (!(identity.gender ?? '').trim()) issues.push('Gender is required for consistent character and media generation.');
    if (!identity.pronouns.trim()) issues.push('Pronouns are required.');
    if (!identity.occupation.trim()) issues.push('Job or role is required.');
    if (identity.occupation.trim().length > 100) issues.push('Keep their job or role to 100 characters.');
    if (identity.biography.trim().length < 20) issues.push('Add at least 20 characters of history and personality.');
    if (identity.biography.trim().length > 1000) issues.push('Keep their history to 1,000 characters.');
    if (identity.interests.length < 1) issues.push('Add at least one interest.');
    if (identity.traits.length < 2) issues.push('Add at least two defining traits.');
    if (identity.interests.length > 12 || identity.interests.some((item) => item.length > 40)) issues.push('Use up to 12 interests, each 40 characters or fewer.');
    if (identity.traits.length > 8 || identity.traits.some((item) => item.length > 40)) issues.push('Use up to 8 traits, each 40 characters or fewer.');
    if (identity.ambitions.length > 5 || identity.ambitions.some((item) => item.length > 160)) issues.push('Use up to 5 ambitions, each 160 characters or fewer.');
  }
  if (step === 'appearance') {
    if (input.appearanceDescription.trim().length < 20) issues.push('Describe their enduring appearance in at least 20 characters.');
    if (input.appearanceDescription.trim().length > 800) issues.push('Keep the appearance description to 800 characters.');
    if (!input.hasAppearance) issues.push('Upload or generate and select a canonical portrait.');
  }
  if (step === 'life') {
    if (!input.life.homeWorldId || !input.life.homeLocationId) issues.push('Choose a home area.');
    if (!input.life.lifestyle.trim()) issues.push('Describe their typical lifestyle.');
    if (input.life.lifestyle.trim().length > 300) issues.push('Keep their lifestyle to 300 characters.');
    if (!input.life.scheduleStyle.trim()) issues.push('Describe how structured their schedule is.');
    if (input.life.scheduleStyle.trim().length > 200) issues.push('Keep their schedule style to 200 characters.');
    if (input.life.preferredActivities.length > 10 || input.life.preferredActivities.some((item) => item.length > 80)) issues.push('Use up to 10 preferred activities, each 80 characters or fewer.');
    if (input.routine.length < 1) issues.push('Add at least one schedule block.');
    if (input.routine.length > 28) issues.push('Keep the weekly rhythm to 28 schedule blocks.');
    for (const block of input.routine) {
      if (!block.locationId || block.activity.trim().length < 2 || block.activity.trim().length > 160 || block.endMinute <= block.startMinute) {
        issues.push('Every schedule block needs a place, activity, and valid time range.');
        break;
      }
    }
    if (routineConflicts(input.routine).length) issues.push('Schedule blocks on the same day cannot overlap.');
  }
  if (step === 'connection' && input.connection && (input.connection.boundaries.length > 8 || input.connection.boundaries.some((item) => item.length < 2 || item.length > 120))) issues.push('Use up to 8 boundaries, each 2–120 characters.');
  if (step === 'meeting' && !input.selectedMeeting) issues.push('Choose a first meeting.');
  return issues;
}

export function nextCreatorRoutineSlot(blocks: CreatorRoutineBlock[]): { dayOfWeek: number; startMinute: number; endMinute: number } | null {
  const firstDay = blocks.length ? (Math.max(...blocks.map((block) => block.dayOfWeek)) + 1) % 7 : 1;
  const starts = Array.from({ length: 29 }, (_, index) => 480 + index * 30)
    .filter((start) => start + 120 <= 1440)
    .sort((a, b) => Math.abs(a - 1080) - Math.abs(b - 1080));
  for (let offset = 0; offset < 7; offset += 1) {
    const dayOfWeek = (firstDay + offset) % 7;
    for (const startMinute of starts) {
      const endMinute = startMinute + 120;
      if (blocks.every((block) => block.dayOfWeek !== dayOfWeek || block.endMinute <= startMinute || block.startMinute >= endMinute)) return { dayOfWeek, startMinute, endMinute };
    }
  }
  return null;
}

