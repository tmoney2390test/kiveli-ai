import type { Conversation, Message, SharedPlan } from '../types';

export function activeConversationFor(conversations: Conversation[], characterInstanceId: string): Conversation | undefined {
  return conversations.find((conversation) => conversation.character_instance_id === characterInstanceId && !conversation.archived_at && ['direct','first_meeting'].includes(conversation.kind));
}

export function mergeOlderMessages(olderDescending: Message[], currentChronological: Message[]): Message[] {
  const currentIds = new Set(currentChronological.map((message) => message.id));
  return [...olderDescending].reverse().filter((message) => !currentIds.has(message.id)).concat(currentChronological);
}

export function planConversationDraft(plan:Pick<SharedPlan,'title'|'status'>):string{
  const title=plan.title.trim()||'our plan';
  if(plan.status==='completed')return`We should do ${title} again.`;
  if(plan.status==='missed')return`Can we talk about what happened with ${title}?`;
  if(plan.status==='proposed')return`Can we figure out the details for ${title}?`;
  return`Are we still good for ${title}?`;
}
