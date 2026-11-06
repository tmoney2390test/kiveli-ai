import { confirmUserImage, prepareUserImage } from '../../lib/api/multimodal';
import { uploadPreparedChatPhoto } from '../../lib/chatPhotoStorageUpload';
import { supabase } from '../../lib/supabase';
import type { PhotoUploadPhase } from '../../lib/photoUploadPresentation';

export type ConversationImageUpload = {
  uri: string;
  mimeType: 'image/jpeg';
  byteSize: number;
  width: number;
  height: number;
  requestId: string;
};

/** Direct and group photo attachments follow the same preparation/upload/confirmation path. */
export async function uploadConversationImage(options: {
  image: ConversationImageUpload;
  conversationId: string;
  characterInstanceId: string;
  text: string;
  isCurrent: () => boolean;
  onPhase: (phase: PhotoUploadPhase) => void;
  onPrepared: (attachmentId: string) => void;
}) {
  const { image, isCurrent, onPhase } = options;
  if (!isCurrent()) return null;
  onPhase('preparing');
  const prepared = await prepareUserImage({
    conversationId: options.conversationId,
    characterInstanceId: options.characterInstanceId,
    mimeType: image.mimeType,
    byteSize: image.byteSize,
    width: image.width,
    height: image.height,
    requestId: image.requestId,
  });
  if (!isCurrent()) return null;
  options.onPrepared(prepared.attachment.id);
  onPhase('uploading');
  const blob = await fetch(image.uri).then((response) => response.blob());
  if (!isCurrent()) return null;
  await uploadPreparedChatPhoto({
    storage: supabase.storage.from(prepared.upload.bucket),
    upload: prepared.upload,
    body: blob,
    contentType: image.mimeType,
  });
  if (!isCurrent()) return null;
  onPhase('processing');
  const confirmed = await confirmUserImage(prepared.attachment.id, options.text);
  if (!isCurrent()) return null;
  onPhase('sending');
  return { ...confirmed.attachment, signed_url: confirmed.attachment.signed_url ?? image.uri };
}
