import { capabilitiesForTier, creditCosts } from '@together/domain/src/entitlements';
import type { MediaOffer } from '../types';

export type OptimisticPhotoRequest = {
  requestId: string;
  startedAt: string;
  offer: MediaOffer;
};

export function queueOptimisticPhotoOfferAcceptance(
  request: OptimisticPhotoRequest,
): OptimisticPhotoRequest {
  return {
    ...request,
    offer: {
      ...request.offer,
      // Keep the offer cancelable until the server has actually accepted it.
      // `accepted` means a real media job exists; using it for a queued tap
      // strands the UI in a false generating state if reconciliation is late.
      status: 'pending',
      preview_metadata: { ...request.offer.preview_metadata, acceptQueued: true },
    },
  };
}

export function createOptimisticPhotoRequest(input: {
  requestId: string;
  conversationId: string;
  characterInstanceId: string;
  continuityId?: string | null;
  characterName: string;
  subscriptionTier?: string | null;
  lastKnownDailyRemaining?: number | null;
}): OptimisticPhotoRequest {
  const startedAt = new Date().toISOString();
  const configuredDailyAllowance = capabilitiesForTier(input.subscriptionTier ?? 'free')
    .includedCompanionPhotoDailyLimit;
  const dailyPhotoAllowanceRemaining = Number.isFinite(input.lastKnownDailyRemaining)
    ? Math.max(0, Number(input.lastKnownDailyRemaining))
    : configuredDailyAllowance;
  const firstName = input.characterName.trim().split(/\s+/)[0] || 'Your companion';
  return {
    requestId: input.requestId,
    startedAt,
    offer: {
      id: `local-photo-offer-${input.requestId}`,
      continuity_id: input.continuityId ?? '',
      character_instance_id: input.characterInstanceId,
      conversation_id: input.conversationId,
      message_id: null,
      generated_media_id: null,
      source: 'user_request',
      status: 'pending',
      content_level: 'standard',
      quality_tier: 'standard',
      shot_type: 'selfie',
      credit_action: 'companion_photo',
      credit_cost: creditCosts.companion_photo,
      title: 'Photo request',
      companion_message: `${firstName} can make that photo. Confirm to start.`,
      preview_metadata: { dailyPhotoAllowanceRemaining, optimistic: true },
      included_subscription_benefit: false,
      included_benefit_type: null,
      created_at: startedAt,
      updated_at: startedAt,
    },
  };
}

export function matchingServerPhotoOffer(
  offers: MediaOffer[],
  request: Pick<OptimisticPhotoRequest, 'requestId' | 'startedAt' | 'offer'>,
): MediaOffer | undefined {
  const earliest = new Date(request.startedAt).getTime() - 2_000;
  return [...offers]
    .filter((offer) =>
      !offer.id.startsWith('local-photo-offer-') &&
      offer.source === 'user_request' &&
      offer.character_instance_id === request.offer.character_instance_id &&
      offer.conversation_id === request.offer.conversation_id &&
      (offer.preview_metadata?.clientRequestId === request.requestId ||
        (!offer.preview_metadata?.clientRequestId && new Date(offer.created_at).getTime() >= earliest))
    )
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())[0];
}

export async function waitForMatchingServerPhotoOffer(input: {
  request: Pick<OptimisticPhotoRequest, 'requestId' | 'startedAt' | 'offer'>;
  loadOffers: () => Promise<MediaOffer[]>;
  delays?: number[];
  wait?: (delayMs: number) => Promise<void>;
}): Promise<{ offer?: MediaOffer; offers: MediaOffer[] }> {
  const delays = input.delays ?? [0, 400, 900, 1_800];
  const wait = input.wait ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  let offers: MediaOffer[] = [];
  let lastError: unknown;
  let loaded = false;
  for (const delay of delays) {
    if (delay > 0) await wait(delay);
    try {
      offers = await input.loadOffers();
      loaded = true;
      const offer = matchingServerPhotoOffer(offers, input.request);
      if (offer) return { offer, offers };
    } catch (error) {
      lastError = error;
    }
  }
  if (!loaded && lastError) throw lastError instanceof Error ? lastError : new Error('The photo confirmation could not be loaded.');
  return { offers };
}
