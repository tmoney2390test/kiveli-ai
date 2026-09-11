import { CHAT_MODEL_TEST_VERSION, normalizeChatTestSelection, chatTestModel, chatTestSelections, type ChatTestCapability, type ChatDialogueExperiment } from '../../../packages/together-domain/src/chat-model-test.ts';
import type { DialogueRoutingDecision } from '../../../packages/together-domain/src/ai-routing.ts';
import { AppError } from './types.ts';

// Verified auth.users identity. Never authorize an email or ID supplied in a request body.
const TEST_USER_ID = '0aaaa97b-a210-4d06-893a-7780bed71927';
// Keep the existing server switch and serialized preference names during this extension.
const EXPERIMENT_ID = 'venice-owner-chat';
type Row = Record<string, any>;
export async function chatTestCapability(db: any, userId: string): Promise<ChatTestCapability> {
  const unavailable: ChatTestCapability = { available: false, version: CHAT_MODEL_TEST_VERSION, selections: ['off'] };
  if (userId !== TEST_USER_ID || Deno.env.get('KIVELLE_VENICE_CHAT_TEST_ENABLED') === 'false') return unavailable;
  const { data, error } = await db.from('kivelle_dialogue_experiments').select('enabled,version').eq('id', EXPERIMENT_ID).maybeSingle();
  if (error || !data?.enabled) return unavailable;
  const selections = chatTestSelections.filter(selection => {
    const model = chatTestModel(selection);
    if (!model) return true;
    return model.provider === 'venice' ? Boolean(Deno.env.get('VENICE_API_KEY'))
      : Boolean(Deno.env.get('WAVESPEED_API_KEY')) && Deno.env.get('KIVELLE_WAVESPEED_CHAT_TEST_ENABLED') !== 'false';
  });
  return { available: selections.length > 1, version: `${CHAT_MODEL_TEST_VERSION}:${data.version}:${selections.join(',')}`, selections };
}
export async function validateChatTestSetting(db: any, userId: string, ownerId: unknown, value: unknown) {
  if (value === undefined) return undefined;
  if (!chatTestSelections.includes(value as never)) throw new AppError('VALIDATION_ERROR', 'Choose an available chat test model.', 400);
  if (userId !== ownerId || value !== 'off' && !(await chatTestCapability(db, userId)).selections.includes(value as never)) throw new AppError('FORBIDDEN', 'This experiment is not available for this account.', 403);
  return normalizeChatTestSelection(value);
}
export async function resolveChatTestExperiment(db: any, userId: string, conversation: Row): Promise<ChatDialogueExperiment | null> {
  if (conversation.user_id !== userId) return null;
  const selection = normalizeChatTestSelection(conversation.metadata?.chatPreferences?.veniceTestModel);
  const model = chatTestModel(selection);
  if (!model || selection === 'off') return null;
  const capability = await chatTestCapability(db, userId);
  return capability.available && capability.selections.includes(selection) ? { selection, provider: model.provider, model: model.id, version: capability.version } : null;
}
export async function applyChatTestRoute(db: any, userId: string, conversation: Row, route: DialogueRoutingDecision, frozenExperiment?: ChatDialogueExperiment | null): Promise<DialogueRoutingDecision> {
  if (userId !== TEST_USER_ID || route.provider !== 'xai' || !route.explicit || route.hardBlocked || conversation.user_id !== userId) return route;
  const experiment = frozenExperiment === undefined ? await resolveChatTestExperiment(db, userId, conversation) : frozenExperiment;
  return experiment ? { ...route, provider: experiment.provider, experiment } : route;
}
/** Recheck configuration and ownership immediately before an outbound experiment request. */
export async function assertChatTestRequest(db: any, userId: string | undefined, conversationId: string | null | undefined, experiment: ChatDialogueExperiment | undefined): Promise<void> {
  if (!db || !userId || !conversationId || !experiment) throw new AppError('FORBIDDEN', 'This experiment is not available for this account.', 403);
  const capability = await chatTestCapability(db, userId);
  const { data, error } = await db.from('together_conversations').select('user_id,metadata').eq('id', conversationId).eq('user_id', userId).single();
  const selection = normalizeChatTestSelection(data?.metadata?.chatPreferences?.veniceTestModel);
  if (error || data?.user_id !== userId || !capability.available || !capability.selections.includes(selection) || experiment.version !== capability.version || selection !== experiment.selection || chatTestModel(selection)?.id !== experiment.model || chatTestModel(selection)?.provider !== experiment.provider) throw new AppError('CONFLICT', 'The chat model test setting changed. Refresh the chat and try again.', 409, true);
}
export async function chatTestStateVersion(db: any, userId: string, conversation: Row): Promise<string | null> {
  if (userId !== TEST_USER_ID || normalizeChatTestSelection(conversation.metadata?.chatPreferences?.veniceTestModel) === 'off') return null;
  const capability = await chatTestCapability(db, userId);
  return `${capability.version}:${capability.available}`;
}
