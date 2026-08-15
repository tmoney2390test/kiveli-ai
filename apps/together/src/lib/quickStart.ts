import type { PendingOnboarding } from './pendingOnboarding';

export function quickStartProfile(characterTemplateId: string): PendingOnboarding {
  return {
    ageConfirmed: true,
    characterTemplateId,
    interests: [],
    goals: ['Dating', 'Stories', 'Social worlds'],
  };
}
