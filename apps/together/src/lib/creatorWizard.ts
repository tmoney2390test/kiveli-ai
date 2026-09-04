import type { CreatorIdentityConfig, CreatorLifeConfig, CreatorRoutineBlock, CreatorStep } from '../types';

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
}): string[] {
  const { step, identity } = input;
  const issues: string[] = [];
  if (step === 'identity' || step === 'personality') {
    if (!identity.name.trim()) issues.push('Name is required.');
    if (!Number.isInteger(identity.age) || identity.age < 18 || identity.age > 99) issues.push('Age must be between 18 and 99.');
    if (!(identity.gender ?? '').trim()) issues.push('Gender is required for consistent character and media generation.');
    if (!identity.pronouns.trim()) issues.push('Pronouns are required.');
    if (!identity.occupation.trim()) issues.push('Job or role is required.');
    if (identity.biography.trim().length < 20) issues.push('Add at least 20 characters of history and personality.');
    if (identity.interests.length < 1) issues.push('Add at least one interest.');
    if (identity.traits.length < 2) issues.push('Add at least two defining traits.');
  }
  if (step === 'appearance') {
    if (input.appearanceDescription.trim().length < 20) issues.push('Describe their enduring appearance in at least 20 characters.');
    if (input.appearanceDescription.trim().length > 800) issues.push('Keep the appearance description to 800 characters.');
    if (!input.hasAppearance) issues.push('Upload or generate and select a canonical portrait.');
  }
  if (step === 'life') {
    if (!input.life.homeWorldId || !input.life.homeLocationId) issues.push('Choose a home area.');
    if (!input.life.lifestyle.trim()) issues.push('Describe their typical lifestyle.');
    if (!input.life.scheduleStyle.trim()) issues.push('Describe how structured their schedule is.');
    if (input.routine.length < 1) issues.push('Add at least one schedule block.');
    for (const block of input.routine) {
      if (!block.locationId || !block.activity.trim() || block.endMinute <= block.startMinute) {
        issues.push('Every schedule block needs a place, activity, and valid time range.');
        break;
      }
    }
  }
  if (step === 'meeting' && !input.selectedMeeting) issues.push('Choose a first meeting.');
  return issues;
}

