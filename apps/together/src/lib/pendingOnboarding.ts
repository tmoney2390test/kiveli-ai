import AsyncStorage from '@react-native-async-storage/async-storage';

export type PendingOnboarding = {
  ageConfirmed: true;
  onboardingChoice?: 'companion' | 'skip';
  displayName?: string;
  characterTemplateId?: string;
  worldId?: string;
  interests: string[];
  goals: Array<'Dating'|'Friendship'|'Stories'|'Social worlds'>;
};

const key = 'together.pending-onboarding.v1';

export const savePendingOnboarding = (value: PendingOnboarding) => AsyncStorage.setItem(key, JSON.stringify(value));
export const clearPendingOnboarding = () => AsyncStorage.removeItem(key);
export async function loadPendingOnboarding(): Promise<PendingOnboarding|null> {
  const value = await AsyncStorage.getItem(key);
  if (!value) return null;
  try { return JSON.parse(value) as PendingOnboarding; } catch { await clearPendingOnboarding(); return null; }
}
