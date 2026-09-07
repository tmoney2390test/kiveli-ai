import { contextInputTokenCeiling, estimateContextTokens } from './context-budget.ts';

export const contextPreferences = ['included', 'extended_32k', 'maximum_64k'] as const;
export type ContextPreference = typeof contextPreferences[number];
export function normalizeContextPreference(value: unknown): ContextPreference {
  return value === 'extended_32k' || value === 'maximum_64k' ? value : 'included';
}
export function contextPreferenceLabel(value: unknown): string {
  return value === 'extended_32k' ? 'Extended · 32K' : value === 'maximum_64k' ? 'Maximum · 64K' : 'Included';
}
export function selectedContextCeiling(value: unknown, profile: unknown): number {
  return value === 'extended_32k' ? 32_000 : value === 'maximum_64k' ? 64_000 : contextInputTokenCeiling(profile);
}

/** Contiguous, complete recent messages; the caller enforces the final assembled input limit. */
export function recentHistoryWithinBudget<T extends { content: string }>(rows: readonly T[], budget: number): T[] {
  const selected: T[] = [];
  let tokens = 0;
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index]!;
    const cost = estimateContextTokens(row.content) + 24;
    if (tokens + cost > budget) break;
    selected.push(row);
    tokens += cost;
  }
  return selected.reverse();
}

export type DialogueContextQuote = {
  quoteId: string;
  expiresAt: string;
  contextPreference: ContextPreference;
  approximateInputTokens: number;
  maximumCredits: number;
  maximumReplies: number;
  paidExpansion: boolean;
};
