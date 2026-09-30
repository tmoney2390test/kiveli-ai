import type { GeneratedMedia, MediaOffer } from '../types';

type StatusResult = { media?: GeneratedMedia | null; offer?: MediaOffer };
/** Checking recovery must never accept an offer, retry generation, or reserve credits. */
export function checkExistingMediaRequest(
  input: { mediaId?: string | null; offerId?: string | null },
  invoke: (input: Record<string, unknown>) => Promise<StatusResult>,
): Promise<StatusResult> {
  if (input.offerId && !input.offerId.startsWith('local-')) return invoke({ action: 'offer_status', offerId: input.offerId });
  if (input.mediaId) return invoke({ action: 'status', mediaId: input.mediaId });
  return Promise.reject(new Error('Your request is still being confirmed. Please wait before requesting another photo.'));
}
