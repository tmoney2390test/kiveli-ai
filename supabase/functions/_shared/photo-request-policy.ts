import { photoRequestRestriction, PHOTO_REQUEST_BLOCKED_MESSAGE } from '../../../packages/together-domain/src/photo-request-policy.ts';
import { AppError } from './types.ts';

export function assertPhotoRequestAllowed(
  input: Parameters<typeof photoRequestRestriction>[0],
  diagnostics: { userId?: string; characterInstanceId?: string; conversationId?: string; requestId?: string; offerId?: string; clientSurface?: string; stage: string },
) {
  const restriction = photoRequestRestriction(input);
  if (!restriction) return;
  // Never include intimate prompt text in operational logs.
  console.warn(JSON.stringify({ operation: 'photo_request_blocked', ...diagnostics, ...restriction }));
  throw new AppError('PHOTO_CONTENT_BLOCKED', PHOTO_REQUEST_BLOCKED_MESSAGE, 403, false);
}
