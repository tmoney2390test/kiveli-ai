import type {
  CharacterResetPreview,
  CharacterResetResult,
  Conversation,
  Message,
} from '../../types';
import { withIdempotentRetry } from '../requestRetry';
import { ensureWebAdultSession } from '../webAdultSession';
import { invoke, token } from './transport';
export const manageConversation = async <T>(input: Record<string, unknown>) => {
  await ensureWebAdultSession(await token()).catch(() => undefined);
  return invoke<T>('together-conversation', input);
};
export const setConversationPinned = (conversationId: string, pinned: boolean) =>
  manageConversation<Conversation>({ action: 'pin', conversationId, pinned });
export const setMessageFavorite = (conversationId: string, messageId: string, favorite: boolean) =>
  manageConversation<Message>({ action: 'message_favorite', conversationId, messageId, favorite });
export const ensureConversation = (characterInstanceId: string) =>
  withIdempotentRetry(
    () => manageConversation<Conversation>({ action: 'ensure', characterInstanceId }),
    { attempts: 2, delayMs: 180 },
  );
export const openConversation = (characterInstanceId: string) =>
  withIdempotentRetry(() =>
    manageConversation<{
      conversation: Conversation;
      messages: Message[];
      hasMore: boolean;
    }>({ action: 'open', characterInstanceId, limit: 50 }), { attempts: 2, delayMs: 180 });
export const previewCharacterReset = (characterInstanceId: string) =>
  manageConversation<CharacterResetPreview>({ action: 'reset_preview', characterInstanceId });
export const startOverCharacter = (characterInstanceId: string, requestId: string) =>
  manageConversation<CharacterResetResult>({
    action: 'start_over',
    characterInstanceId,
    requestId,
  });
