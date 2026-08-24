import type { Conversation, Message, SharedPlan } from '../types';

export function isActiveConversation(conversation:Conversation):boolean{
  return !conversation.archived_at&&!conversation.user_archived_at&&['direct','first_meeting'].includes(conversation.kind);
}

export function activeConversationFor(conversations: Conversation[], characterInstanceId: string): Conversation | undefined {
  return conversations.find((conversation) => conversation.character_instance_id === characterInstanceId && isActiveConversation(conversation));
}

export function mostRecentlyUsedConversation(conversations: Conversation[]): Conversation | undefined {
  return conversations
    .filter(isActiveConversation)
    .reduce<Conversation|undefined>((latest,conversation) => {
      if(!latest)return conversation;
      return conversationActivityTime(conversation)>conversationActivityTime(latest)?conversation:latest;
    },undefined);
}

export function mergeOlderMessages(olderDescending: Message[], currentChronological: Message[]): Message[] {
  const currentIds = new Set(currentChronological.map((message) => message.id));
  return [...olderDescending].reverse().filter((message) => !currentIds.has(message.id)).concat(currentChronological);
}

export function mostRecentlyMessagedConversation(conversations: Conversation[]): Conversation | undefined {
  return conversations
    .filter((conversation) => isActiveConversation(conversation) && Boolean(conversation.last_message_at))
    .reduce<Conversation | undefined>((latest, conversation) => {
      if (!latest) return conversation;
      return conversationActivityTime(conversation) > conversationActivityTime(latest) ? conversation : latest;
    }, undefined);
}

export function scopedConversationMessages(messages: Message[], conversationId: string, loadedConversationId: string | null, loading: boolean): Message[] {
  if (loading || loadedConversationId !== conversationId) return [];
  return messages.filter((message) => message.conversation_id === conversationId);
}

export function planConversationDraft(plan:Pick<SharedPlan,'title'|'status'>):string{
  const title=plan.title.trim()||'our plan';
  if(plan.status==='completed')return`We should do ${title} again.`;
  if(plan.status==='missed')return`Can we talk about what happened with ${title}?`;
  if(plan.status==='proposed')return`Can we figure out the details for ${title}?`;
  return`Are we still good for ${title}?`;
}

function conversationActivityTime(conversation:Conversation):number{
  const value=conversation.last_message_at??conversation.updated_at??conversation.created_at;
  const timestamp=value?new Date(value).getTime():0;
  return Number.isFinite(timestamp)?timestamp:0;
}
