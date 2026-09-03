export const PHOTO_ONLY_MESSAGE_CONTENT='[Photo]';

export function isPhotoOnlyConversationMessage(message:{role?:unknown;content?:unknown;provider_metadata?:unknown}):boolean{
  const metadata=message.provider_metadata&&typeof message.provider_metadata==='object'&&!Array.isArray(message.provider_metadata)
    ?message.provider_metadata as Record<string,unknown>
    :{};
  return message.role==='assistant'&&(message.content===PHOTO_ONLY_MESSAGE_CONTENT||metadata.mediaOnly===true);
}
