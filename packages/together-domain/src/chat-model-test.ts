import { veniceChatModels, veniceTestSelections } from './venice-chat.ts';
import { wavespeedChatModels } from './wavespeed-chat.ts';

export const CHAT_MODEL_TEST_VERSION = 'chat-model-test-2026-09-11-v2';
export const chatTestSelections = [...veniceTestSelections, 'deepseek_v4_flash', 'deepseek_v4_pro'] as const;
export type ChatTestSelection = (typeof chatTestSelections)[number];
export const chatTestModels = {
  uncensored_1_2: { ...veniceChatModels.uncensored_1_2, provider: 'venice', label: 'Uncensored 1.2 · Venice' },
  role_play: { ...veniceChatModels.role_play, provider: 'venice', label: 'Role Play · Venice' },
  gemma_4: { ...veniceChatModels.gemma_4, provider: 'venice', label: 'Gemma 4 Uncensored · Venice' },
  ...wavespeedChatModels,
} as const;
export function normalizeChatTestSelection(value: unknown): ChatTestSelection {
  return typeof value === 'string' && chatTestSelections.includes(value as ChatTestSelection) ? value as ChatTestSelection : 'off';
}
export function chatTestModel(value: unknown) {
  const selection = normalizeChatTestSelection(value);
  return selection === 'off' ? null : chatTestModels[selection];
}
export type ChatTestCapability = { available: boolean; version: string; selections: ChatTestSelection[] };
export type ChatDialogueExperiment = { selection: Exclude<ChatTestSelection, 'off'>; provider: 'venice' | 'wavespeed'; model: string; version: string };
