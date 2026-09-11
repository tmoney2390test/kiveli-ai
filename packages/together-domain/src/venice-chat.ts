/** Exact model IDs and rates shared by quotes and usage accounting. Reviewed 2026-09-10. */
export const VENICE_CHAT_VERSION = 'venice-chat-2026-09-10-v1';
export const veniceTestSelections = ['off', 'uncensored_1_2', 'role_play', 'gemma_4'] as const;
export type VeniceTestSelection = (typeof veniceTestSelections)[number];
export const veniceChatModels = {
  uncensored_1_2: { id: 'venice-uncensored-1-2', label: 'Uncensored 1.2', inputPerMillion: 0.20, outputPerMillion: 0.90, contextTokens: 128_000 },
  role_play: { id: 'venice-uncensored-role-play', label: 'Role Play', inputPerMillion: 0.50, outputPerMillion: 2.00, contextTokens: 128_000 },
  gemma_4: { id: 'gemma-4-uncensored', label: 'Gemma 4 Uncensored', inputPerMillion: 0.16, outputPerMillion: 0.50, contextTokens: 256_000 },
} as const;
export function normalizeVeniceTestSelection(value: unknown): VeniceTestSelection {
  return typeof value === 'string' && veniceTestSelections.includes(value as VeniceTestSelection) ? value as VeniceTestSelection : 'off';
}
export function veniceChatModel(value: unknown) {
  const selection = normalizeVeniceTestSelection(value);
  return selection === 'off' ? null : veniceChatModels[selection];
}
export function veniceChatRate(model: string) {
  return Object.values(veniceChatModels).find((candidate) => candidate.id === model);
}
export type VeniceTestCapability = { available: boolean; version: string; selections: VeniceTestSelection[] };
export type VeniceDialogueExperiment = { selection: Exclude<VeniceTestSelection, 'off'>; model: string; version: string };
