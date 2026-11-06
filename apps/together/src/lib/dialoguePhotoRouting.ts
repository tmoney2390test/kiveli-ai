import { classifyPhotoIntent } from '@together/domain/src/media';

/** A declined photo is continued as text, even when the original words asked for a photo. */
export function dialoguePhotoRouting(
  message: string,
  messageAction: 'continue' | 'respond_to_declined_photo' | undefined,
  web: boolean,
): { photoRequest: boolean; explicitWebsitePhoto: boolean } {
  if (messageAction === 'respond_to_declined_photo') return { photoRequest: false, explicitWebsitePhoto: false };
  const intent = classifyPhotoIntent(message);
  return {
    photoRequest: intent.requested,
    explicitWebsitePhoto: web && intent.requested && intent.requestedContentLevel === 'explicit',
  };
}
