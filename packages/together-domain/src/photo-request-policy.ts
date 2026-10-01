import { classifyPhotoIntent, resolveProductionSafePhotoRequest } from './media.ts';

export const PHOTO_CONTENT_BLOCKED = 'PHOTO_CONTENT_BLOCKED';
export const PHOTO_REQUEST_BLOCKED_MESSAGE = 'Nude and explicit photos are not available in this app session. Edit your request to ask for a non-explicit photo.';

/** Inspect authored intent before a provider prompt can replace it with safe prose. */
export function photoRequestRestriction(input: Parameters<typeof resolveProductionSafePhotoRequest>[0]) {
  if (!resolveProductionSafePhotoRequest(input).downgraded) return null;
  return {
    code: PHOTO_CONTENT_BLOCKED,
    reason: 'adult_photo_not_authorized',
    requestedContentLevel: input.requestedContentLevel ?? classifyPhotoIntent(input.requestText ?? '').requestedContentLevel ?? 'standard',
  } as const;
}

/** A native app may keep restricted photo-like wording in ordinary chat. */
export function restrictedPhotoTextCanContinueAsChat(requestText: string): boolean {
  const intent = classifyPhotoIntent(requestText);
  return intent.requested && photoRequestRestriction({
    requestText,
    ...(intent.requestedContentLevel ? { requestedContentLevel: intent.requestedContentLevel } : {}),
    adultPipelineAuthorized: false,
  }) !== null;
}
