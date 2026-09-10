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


/** Only use assets already authorized and projected into this conversation's gallery. */
export function chatMediaVideoPreview(item: ChatMediaGalleryItem, generatedById: ReadonlyMap<string, GeneratedMedia>) {
  const media = item.kind === 'generated' ? item.media : null;
  const attachment = item.kind === 'attachment' ? item.attachment : null;
  const isVideo = media?.media_type === 'video' || attachment?.kind === 'video';
  const parent = media?.parent_media_id ? generatedById.get(media.parent_media_id) : undefined;
  const poster = isVideo && parent?.media_type === 'image' && parent.status === 'ready'
    && parent.conversation_id === media?.conversation_id && parent.signed_url ? parent : null;
  const uri = isVideo
    ? media?.status === 'ready' ? media.signed_url : attachment?.upload_status === 'uploaded' ? attachment.signed_url : null
    : null;
  return {uri: uri ?? null, poster};
}
