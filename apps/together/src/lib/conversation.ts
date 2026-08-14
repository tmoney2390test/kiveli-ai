import type { Conversation, Message } from '../types';

export function activeConversationFor(conversations: Conversation[], characterInstanceId: string): Conversation | undefined {
  return conversations.find((conversation) => conversation.character_instance_id === characterInstanceId && !conversation.archived_at && ['direct','first_meeting'].includes(conversation.kind));
}

export function mergeOlderMessages(olderDescending: Message[], currentChronological: Message[]): Message[] {
  const currentIds = new Set(currentChronological.map((message) => message.id));
  return [...olderDescending].reverse().filter((message) => !currentIds.has(message.id)).concat(currentChronological);
}
