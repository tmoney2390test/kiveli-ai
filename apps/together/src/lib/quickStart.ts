import type { PendingOnboarding } from './pendingOnboarding';

export function quickStartProfile(characterTemplateId: string, worldId: string): PendingOnboarding {
  return {
    ageConfirmed: true,
    onboardingChoice: 'companion',
    characterTemplateId,
    worldId,
    interests: [],
    goals: ['Dating', 'Stories', 'Social worlds'],
  };
}

export function skipQuickStartProfile(worldId?: string): PendingOnboarding {
  return {
    ageConfirmed: true,
    onboardingChoice: 'skip',
    worldId,
    interests: [],
    goals: ['Dating', 'Stories', 'Social worlds'],
  };
}
