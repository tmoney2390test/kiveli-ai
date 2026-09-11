import { VENICE_CHAT_VERSION, normalizeVeniceTestSelection, veniceChatModel, veniceTestSelections, type VeniceTestCapability, type VeniceDialogueExperiment } from '../../../packages/together-domain/src/venice-chat.ts';
import type { DialogueRoutingDecision } from '../../../packages/together-domain/src/ai-routing.ts';
import { AppError } from './types.ts';

// Verified auth.users identity. Never authorize an email or ID supplied in a request body.
const TEST_USER_ID = '0aaaa97b-a210-4d06-893a-7780bed71927';
const EXPERIMENT_ID = 'venice-owner-chat';
type Row = Record<string, any>;
export async function veniceTestCapability(db: any, userId: string): Promise<VeniceTestCapability> {
  const unavailable: VeniceTestCapability = { available: false, version: VENICE_CHAT_VERSION, selections: ['off'] };
  if (userId !== TEST_USER_ID || Deno.env.get('KIVELLE_VENICE_CHAT_TEST_ENABLED') === 'false' || !Deno.env.get('VENICE_API_KEY')) return unavailable;
  const { data, error } = await db.from('kivelle_dialogue_experiments').select('enabled,version').eq('id', EXPERIMENT_ID).maybeSingle();
  if (error || !data?.enabled) return unavailable;
  return { available: true, version: `${VENICE_CHAT_VERSION}:${data.version}`, selections: [...veniceTestSelections] };
}
export async function validateVeniceTestSetting(db: any, userId: string, ownerId: unknown, value: unknown) {
  if (value === undefined) return undefined;
  if (!veniceTestSelections.includes(value as never)) throw new AppError('VALIDATION_ERROR', 'Choose an available Venice test model.', 400);
  if (userId !== ownerId || value !== 'off' && !(await veniceTestCapability(db, userId)).available) throw new AppError('FORBIDDEN', 'This experiment is not available for this account.', 403);
  return normalizeVeniceTestSelection(value);
}
export async function resolveVeniceTestExperiment(db: any, userId: string, conversation: Row): Promise<VeniceDialogueExperiment | null> {
  if (conversation.user_id !== userId) return null;
  const selection = normalizeVeniceTestSelection(conversation.metadata?.chatPreferences?.veniceTestModel);
  const model = veniceChatModel(selection);
  if (!model || selection === 'off') return null;
  const capability = await veniceTestCapability(db, userId);
  return capability.available ? { selection, model: model.id, version: capability.version } : null;
}
export async function applyVeniceTestRoute(db: any, userId: string, conversation: Row, route: DialogueRoutingDecision, frozenExperiment?: VeniceDialogueExperiment | null): Promise<DialogueRoutingDecision> {
  if (userId !== TEST_USER_ID || route.provider !== 'xai' || !route.explicit || route.hardBlocked || conversation.user_id !== userId) return route;
  const experiment = frozenExperiment === undefined ? await resolveVeniceTestExperiment(db, userId, conversation) : frozenExperiment;
  return experiment ? { ...route, provider: 'venice', experiment } : route;
}
/** Recheck configuration and ownership immediately before an outbound experiment request. */
export async function assertVeniceTestRequest(db: any, userId: string | undefined, conversationId: string | null | undefined, experiment: VeniceDialogueExperiment | undefined): Promise<void> {
  if (!db || !userId || !conversationId || !experiment) throw new AppError('FORBIDDEN', 'This experiment is not available for this account.', 403);
  const capability = await veniceTestCapability(db, userId);
  const { data, error } = await db.from('together_conversations').select('user_id,metadata').eq('id', conversationId).eq('user_id', userId).single();
  const selection = normalizeVeniceTestSelection(data?.metadata?.chatPreferences?.veniceTestModel);
  if (error || !capability.available || experiment.version !== capability.version || selection !== experiment.selection || veniceChatModel(selection)?.id !== experiment.model) throw new AppError('CONFLICT', 'The Venice test setting changed. Refresh the chat and try again.', 409, true);
}
export async function veniceTestStateVersion(db: any, userId: string, conversation: Row): Promise<string | null> {
  if (userId !== TEST_USER_ID || normalizeVeniceTestSelection(conversation.metadata?.chatPreferences?.veniceTestModel) === 'off') return null;
  const capability = await veniceTestCapability(db, userId);
  return `${capability.version}:${capability.available}`;
}
