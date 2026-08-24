import type { PendingOnboarding } from './pendingOnboarding';

type ExplicitAgeConfirmation = { ageConfirmed: boolean };

function confirmedAge(input: ExplicitAgeConfirmation): true {
  if (input.ageConfirmed !== true) throw new Error('Confirm that you are 18 or older before continuing.');
  return true;
}

export function quickStartProfile(characterTemplateId: string, worldId: string, confirmation: ExplicitAgeConfirmation): PendingOnboarding {
  return {
    ageConfirmed: confirmedAge(confirmation),
    onboardingChoice: 'companion',
    characterTemplateId,
    worldId,
    interests: [],
    goals: ['Dating', 'Stories', 'Social worlds'],
  };
}

export function skipQuickStartProfile(worldId: string | undefined, confirmation: ExplicitAgeConfirmation): PendingOnboarding {
  return {
    ageConfirmed: confirmedAge(confirmation),
    onboardingChoice: 'skip',
    worldId,
    interests: [],
    goals: ['Dating', 'Stories', 'Social worlds'],
  };
}
