import type { Snapshot } from '../types';
import { activeCompanion } from './companionLife';
import { activeConversationFor, mostRecentlyUsedConversation } from './conversation';

export type ChatRouteParams = {
  character?: string;
  conversationId?: string;
  plan?: string;
  draft?: string;
  location?: string;
  world?: string;
  activity?: string;
  planId?: string;
  repeatPlanId?: string;
  switchPlanId?: string;
  sharePhoto?: string;
};

export function resolveChatRoute(snapshot: Snapshot | null, params: ChatRouteParams) {
  const focusedPlan = params.planId && snapshot
    ? snapshot.sharedPlans?.find((item) => item.id === params.planId)
    : undefined;
  const requestedConversation = params.conversationId && snapshot
    ? snapshot.conversations.find((item) => item.id === params.conversationId && !item.archived_at && !item.user_archived_at)
    : undefined;
  const requestedConversationCharacter = requestedConversation && snapshot
    ? snapshot.characters.find((item) => item.id === requestedConversation.character_instance_id)
    : undefined;
  const requestedCharacter = params.character && snapshot
    ? snapshot.characters.find((item) =>
      item.id === params.character
      || item.together_character_templates.slug === params.character
      || item.together_character_templates.public_handle === params.character
      || item.character_template_id === params.character
    )
    : undefined;
  const resumeMostRecent = !params.character && !params.conversationId && !params.plan && !params.draft
    && !params.location && !params.activity && !params.planId && !params.repeatPlanId;
  const recentConversation = snapshot && resumeMostRecent
    ? mostRecentlyUsedConversation(snapshot.conversations)
    : undefined;
  const recentCharacter = snapshot && recentConversation
    ? snapshot.characters.find((item) => item.id === recentConversation.character_instance_id)
    : undefined;
  const character = snapshot
    ? focusedPlan
      ? snapshot.characters.find((item) => item.id === focusedPlan.character_instance_id) ?? requestedConversationCharacter ?? requestedCharacter
      : requestedConversationCharacter ?? requestedCharacter ?? recentCharacter ?? activeCompanion(snapshot)
    : undefined;
  const conversation = snapshot && character
    ? requestedConversation?.character_instance_id === character.id
      ? requestedConversation
      : activeConversationFor(snapshot.conversations, character.id)
    : undefined;
  return { focusedPlan, character, conversation };
}

export function characterConversationHref(handle: string, conversationId: string): string {
  return `/chat?character=${encodeURIComponent(handle)}&conversationId=${encodeURIComponent(conversationId)}`;
}
