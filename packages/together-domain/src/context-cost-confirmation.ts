import { normalizeContextPreference } from './chat-context.ts';

/** A new activation requires a new notice; unrelated setting saves do not. */
export function contextCostActivation(previous: Record<string, unknown>, next: unknown, newId: () => string): string | null {
  const selected = normalizeContextPreference(next);
  if (selected === 'included') return null;
  const existing = previous['contextCostActivationId'];
  return selected === normalizeContextPreference(previous['contextPreference']) && typeof existing === 'string' && existing.length > 0
    ? existing : newId();
}

export function contextCostNoticeToken(preference: unknown, activationId: unknown): string | null {
  const selected = normalizeContextPreference(preference);
  if (selected === 'included') return null;
  return `${selected}:${typeof activationId === 'string' && activationId ? activationId : 'legacy'}`;
}
