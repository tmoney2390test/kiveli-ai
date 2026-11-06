import type {
  ConversationAttachment,
  KivelleExperienceCapabilities,
  MultimodalPreferences,
} from '../../types';
import { ensureWebAdultSession } from '../webAdultSession';
import { invoke, token } from './transport';
export const manageMultimodal = async <T>(input: Record<string, unknown>) => {
  // The website session is prepared before upload analysis so the server can
  // distinguish an authorized adult web request from native or unknown
  // clients. Native builds use the no-op implementation and remain SFW.
  await ensureWebAdultSession(await token()).catch(() => undefined);
  return invoke<T>('together-multimodal', input);
};
export const getExperienceCapabilities = () =>
  manageMultimodal<{
    experience: KivelleExperienceCapabilities;
    providers: KivelleExperienceCapabilities['providers'];
  }>({ action: 'capabilities' });
export const saveMultimodalPreferences = (preferences: Required<MultimodalPreferences>) =>
  manageMultimodal<{
    preferences: MultimodalPreferences;
    experience: KivelleExperienceCapabilities;
  }>({ action: 'preferences', ...preferences });
export const prepareUserImage = (input: {
  conversationId: string;
  characterInstanceId: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
  width?: number;
  height?: number;
  requestId: string;
}) =>
  manageMultimodal<{
    attachment: ConversationAttachment;
    upload: {
      bucket: string;
      path: string;
      token?: string | null;
    };
  }>({ action: 'prepare_user_image', ...input });
export const confirmUserImage = (attachmentId: string, caption?: string) =>
  manageMultimodal<{
    attachment: ConversationAttachment;
    upload: {
      bucket: string;
      path: string;
      token?: string | null;
    };
  }>({
    action: 'confirm_user_image',
    attachmentId,
    ...(caption?.trim() ? { caption: caption.trim() } : {}),
  });
export const removePendingAttachment = (attachmentId: string) =>
  manageMultimodal<{
    removed: boolean;
  }>({ action: 'remove_attachment', attachmentId });
export const deleteConversationAttachment = (attachmentId: string) =>
  manageMultimodal<{
    removed: boolean;
  }>({ action: 'delete_attachment', attachmentId });
