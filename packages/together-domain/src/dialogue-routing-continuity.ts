import { hasConsentWithdrawalSignal, type DialogueContentClass } from './ai-routing.ts';

export const ADULT_ROUTING_CARRYOVER_TURNS = 3;
export const DIALOGUE_ROUTING_VERSION = 'adult-routing-continuity-v1';
export type AdultRoutingEvidence = { version: 1; eligible: boolean; freshAdult: boolean; reset: boolean };

export function adultRoutingEvidence(input: { message: string; classification: DialogueContentClass; eligible: boolean; photoRequest?: boolean }): AdultRoutingEvidence {
  const reset = !input.eligible || input.classification === 'hard_block' || hasConsentWithdrawalSignal(input.message)
    || /\b(?:change (?:the )?(?:subject|topic)|new topic|let['’]s talk about something else)\b/i.test(input.message);
  return {
    version: 1,
    eligible: input.eligible,
    freshAdult: !reset && !input.photoRequest && ['adult_suggestive', 'adult_intimacy', 'explicit_adult'].includes(input.classification),
    reset,
  };
}

/** Oldest first, user turns only. Never renew from the chosen provider, a
 * contextual classification, assistant output, or the previous carryover. */
export function adultRoutingCarryover(current: AdultRoutingEvidence, history: unknown[] = []): number {
  if (current.reset || !current.eligible || current.freshAdult) return 0;
  const recent = history.slice(-ADULT_ROUTING_CARRYOVER_TURNS).reverse();
  for (let index = 0; index < recent.length; index++) {
    const item = recent[index] as Partial<AdultRoutingEvidence> | null;
    // Unknown/legacy evidence cannot authorize carryover across a boundary.
    if (!item || item.version !== 1 || item.eligible !== true || item.reset !== false) return 0;
    if (item.freshAdult === true) return ADULT_ROUTING_CARRYOVER_TURNS - index;
  }
  return 0;
}
