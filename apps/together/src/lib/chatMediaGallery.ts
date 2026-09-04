import type { ConversationAttachment, GeneratedMedia, Message } from '../types';

export type ChatMediaGalleryItem =
  | { kind: 'generated'; id: string; createdAt: string; media: GeneratedMedia }
  | { kind: 'attachment'; id: string; createdAt: string; attachment: ConversationAttachment };

/** Build the private photo/video gallery for one conversation only. */
export function chatMediaGalleryItems(
  generatedMedia: GeneratedMedia[],
  messages: Message[],
  conversationId: string,
  loadedAttachments: ConversationAttachment[] = [],
): ChatMediaGalleryItem[] {
  const generated: ChatMediaGalleryItem[] = generatedMedia
    .filter((item) => item.conversation_id === conversationId)
    .filter((item)=>item.metadata?.hiddenIntermediate!==true)
    .filter((item) => item.media_type === 'image' || item.media_type === 'video')
    .filter((item) => item.status === 'queued' || item.status === 'generating' || item.status === 'ready' && Boolean(item.signed_url))
    .map((media) => ({ kind: 'generated', id: `generated:${media.id}`, createdAt: media.created_at, media }));

  const messageAttachments = messages
    .filter((message) => message.conversation_id === conversationId)
    .flatMap((message) => message.attachments ?? message.together_conversation_attachments ?? []);
  const attachmentsById=new Map([...messageAttachments,...loadedAttachments].map((item)=>[item.id,item]));
  const attachments: ChatMediaGalleryItem[] = [...attachmentsById.values()]
    .filter((attachment) => attachment.conversation_id === conversationId)
    .filter((attachment) => attachment.kind === 'image' || attachment.kind === 'video')
    .filter((attachment) => attachment.upload_status === 'uploaded' && Boolean(attachment.signed_url))
    .map((attachment) => ({ kind: 'attachment', id: `attachment:${attachment.id}`, createdAt: attachment.created_at, attachment }));

  return [...generated, ...attachments].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}
