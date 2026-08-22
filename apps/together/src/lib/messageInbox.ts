import type { CharacterInstance, Conversation } from '../types';
import { isActiveConversation } from './conversation';

export type InboxFilter = 'favorites' | 'all';
export type InboxRow = { conversation: Conversation; character: CharacterInstance };
export type ChatLaunchParams = {
  character?: string;
  plan?: string;
  draft?: string;
  location?: string;
  world?: string;
  activity?: string;
  planId?: string;
  repeatPlanId?: string;
};

const chatLaunchKeys = ['character', 'plan', 'draft', 'location', 'world', 'activity', 'planId', 'repeatPlanId'] as const;

export function chatHrefFromInboxParams(params: ChatLaunchParams): string | null {
  const entries = chatLaunchKeys.flatMap((key) => params[key] ? [[key, params[key]] as const] : []);
  if (!entries.length) return null;
  return `/chat?${entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
}

/**
 * A place-planning launch must remount the chat surface even when it targets the
 * conversation already sitting underneath Places in the navigation stack.
 */
export function chatSessionRouteKey(conversationId:string|null|undefined,params:ChatLaunchParams,fallback='recent'):string{
  const base=conversationId??`pending:${fallback}`;
  if(params.plan!=='1')return`${base}:chat`;
  const scope=[params.world,params.location,params.activity,params.repeatPlanId].map((value)=>value??'').join(':');
  return`${base}:plan:${scope}`;
}

export function buildInboxRows(
  conversations: Conversation[],
  characters: CharacterInstance[],
  favoriteCharacterTemplateIds: string[],
  query: string,
  filter: InboxFilter,
): InboxRow[] {
  const favorites = new Set(favoriteCharacterTemplateIds);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return conversations
    .filter(isActiveConversation)
    .map((conversation) => ({
      conversation,
      character: characters.find((character) => character.id === conversation.character_instance_id),
    }))
    .filter((row): row is InboxRow => Boolean(row.character))
    .filter(({ character }) => filter === 'all' || favorites.has(character.character_template_id))
    .filter(({ conversation, character }) => {
      if (!normalizedQuery) return true;
      return `${character.together_character_templates.name} ${conversation.title ?? ''} ${conversation.last_message_preview ?? ''}`
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    })
    .sort((left, right) => timestamp(right.conversation.last_message_at) - timestamp(left.conversation.last_message_at));
}

export function inboxPreview(conversation: Conversation): string {
  const preview = conversation.last_message_preview?.replace(/\s+/g, ' ').trim();
  return preview || 'Start the conversation.';
}

export function formatInboxTimestamp(value: string | null | undefined, now = new Date()): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  if (sameDay) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = Math.max(1, Math.floor(elapsed / 86_400_000));
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString([], date.getFullYear() === now.getFullYear()
    ? { month: 'numeric', day: 'numeric' }
    : { month: 'numeric', day: 'numeric', year: '2-digit' });
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const result = new Date(value).getTime();
  return Number.isNaN(result) ? 0 : result;
}
