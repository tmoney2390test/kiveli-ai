import type { GeneratedMedia, MediaOffer } from '../types';
import { mergeReconciledMedia } from './mediaReconciliation';

export function mediaProgressPresentation(media?: GeneratedMedia, offer?: MediaOffer, now = Date.now()) {
  const stage = media?.status === 'ready' ? 'opening' : media?.progress_stage ??
    (media?.status === 'queued' ? 'queued' : media?.status === 'generating' ? 'generating' : 'confirming');
  const noun = media?.media_type === 'video' ? 'video' : 'photo';
  const title = ({
    queued: `Your ${noun} is queued`, preparing: `Preparing your ${noun}…`,
    generating: `Creating your ${noun}…`, finalizing: `Finishing your ${noun}…`,
    retrying: 'Waiting to try again…', opening: `Opening your ${noun}…`,
    confirming: 'Confirming your request…', ready: `Opening your ${noun}…`, failed: 'Request interrupted',
  })[stage];
  const startedAt = Date.parse(media?.created_at ?? String(offer?.preview_metadata?.acceptQueuedAt ?? offer?.updated_at ?? ''));
  const elapsed = Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : 0;
  const delayed = elapsed >= (noun === 'video' ? 180_000 : 60_000);
  return { title, delayed, hint: delayed
    ? 'Taking longer than usual. Check this request without starting another.'
    : stage === 'confirming' ? 'Checking that your request was accepted.'
    : stage === 'opening' ? 'Your result is saved. Refresh its link to open it.'
    : stage === 'retrying' ? 'We’ll continue this request automatically. You can keep chatting.'
    : 'You can keep chatting. Your result will appear here.' };
}

export function mediaFailurePresentation(media?: GeneratedMedia, offer?: MediaOffer) {
  const code = (media?.failure_code ?? offer?.failure_code ?? '').toLowerCase();
  const blocked = /blocked|moderation|content_ceiling|prohibited|safety|adult_authorization|consent/.test(code);
  const exhausted = Number(media?.attempt_count ?? 0) >= 3;
  const metadata = media?.metadata ?? {};
  const refunded = metadata.creditRefunded === true || offer?.credit_refunded === true;
  const retryCostsCredits = metadata.includedBenefit !== true &&
    (refunded || code === 'insufficient_credits' || typeof metadata.creditTransactionId !== 'string');
  return {
    title: blocked ? 'This request needs a change' : 'That photo didn’t come through',
    message: blocked ? 'Review the prompt and your content settings before requesting another photo.'
      : exhausted ? 'This request could not be completed after several attempts. Start a new request or contact support.'
      : 'We couldn’t finish this request. You can check its status or try again.',
    retryable: !blocked && !exhausted && media?.status === 'failed' && media.media_type === 'image',
    refund: refunded ? 'Credits returned.' : metadata.dailyPhotoBenefitReleasedAt ? 'Your included photo was returned.' : '',
    retryLabel: metadata.includedBenefitType === 'daily_companion_photo' ? 'Review retry'
      : retryCostsCredits ? `Retry · ${Number(metadata.creditCost) > 0 ? Number(metadata.creditCost) : 10} credits` : 'Retry photo',
    retryNotice: metadata.includedBenefitType === 'daily_companion_photo'
      ? 'Retry uses an available daily photo, or 10 credits if today’s photo has already been used.'
      : retryCostsCredits ? 'Retry starts another attempt using credits.' : 'Retry continues this paid request.',
  };
}

/** A local status check can beat a background poll; don't regress it to stale props. */
export function newestMedia(current: GeneratedMedia | undefined, checked: GeneratedMedia | undefined) {
  if (!checked || checked.id !== current?.id) return current ?? checked;
  return mergeReconciledMedia(current, checked);
}
