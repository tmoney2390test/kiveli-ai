import type { KivelleAccountStage } from './authRouting';
import type { Snapshot } from '../types';
import { activeConversationFor } from './conversation';
import { characterConversationHref } from './chatRoute';
import { isAgeConfirmationPath, isCompanionOnboardingPath } from './sessionRouting';

export const companionOnboardingSteps = ['name', 'about', 'world', 'character'] as const;
export type CompanionOnboardingStep = typeof companionOnboardingSteps[number];

export function resolveCompanionOnboardingStep(value: unknown): CompanionOnboardingStep {
  return companionOnboardingSteps.includes(value as CompanionOnboardingStep) ? value as CompanionOnboardingStep : 'world';
}

export function previousCompanionOnboardingStep(step: CompanionOnboardingStep): CompanionOnboardingStep | null {
  const index = companionOnboardingSteps.indexOf(step);
  return index > 0 ? companionOnboardingSteps[index - 1]! : null;
}

export function companionOnboardingStepNumber(step: CompanionOnboardingStep): 1 | 2 | 3 | 4 {
  return (companionOnboardingSteps.indexOf(step) + 1) as 1 | 2 | 3 | 4;
}

export function completedOnboardingChatHref(snapshot: Snapshot, selectedTemplateId?: string): string | null {
  const activeId = snapshot.activeContinuity?.active_companion_instance_id ?? snapshot.profile?.active_companion_instance_id;
  const character = selectedTemplateId
    ? snapshot.characters.find((item) => item.character_template_id === selectedTemplateId)
    : snapshot.characters.find((item) => item.id === activeId);
  if (!character) return null;
  const conversation = activeConversationFor(snapshot.conversations, character.id);
  return conversation ? characterConversationHref(character.id, conversation.id) : `/chat?character=${encodeURIComponent(character.id)}`;
}

export function onboardingRouteRedirect(stage: KivelleAccountStage, pathname: string, completedChatHref?: string | null): string | null {
  const path = pathname.split(/[?#]/)[0]?.replace(/\/+$/, '') || '/';
  // Account deletion and data controls remain reachable before setup is complete.
  if (path === '/privacy') return null;
  if (stage === 'age_confirmation') return isAgeConfirmationPath(path) ? null : '/age-confirmation';
  if (stage === 'onboarding') return isCompanionOnboardingPath(path) || path === '/subscription' ? null : '/choose-companion';
  if (isCompanionOnboardingPath(path)) return completedChatHref ?? '/home';
  return isAgeConfirmationPath(path) ? '/home' : null;
}

export function companionOnboardingHref(world?: string, step: CompanionOnboardingStep = 'world', companion?: string) {
  const params = new URLSearchParams({ step });
  if (world) params.set('world', world);
  if (companion && step === 'character') params.set('companion', companion);
  return `/choose-companion?${params.toString()}`;
}

/** Incomplete accounts may return only to companion setup, never an arbitrary app route. */
export function onboardingMembershipReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1200 || !value.startsWith('/choose-companion?')) return companionOnboardingHref();
  const params = new URLSearchParams(value.slice(value.indexOf('?') + 1));
  const step = params.get('step');
  return companionOnboardingHref(params.get('world') || undefined, resolveCompanionOnboardingStep(step), params.get('companion') || undefined);
}
