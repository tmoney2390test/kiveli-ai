import { describe, expect, it } from 'vitest';
import { mediaOfferActionBusy } from './mediaOfferBusy';

describe('mediaOfferActionBusy', () => {
  const pending = { id: 'offer-1', generated_media_id: null };
  const accepted = { id: 'offer-1', generated_media_id: 'media-1' };

  it('does not mark an unconfirmed offer as starting while idle', () => {
    expect(mediaOfferActionBusy(null, pending)).toBe(false);
  });

  it('marks only the active offer or media as busy', () => {
    expect(mediaOfferActionBusy('offer-1', pending)).toBe(true);
    expect(mediaOfferActionBusy('media-1', accepted)).toBe(true);
    expect(mediaOfferActionBusy('another-offer', accepted)).toBe(false);
  });
});
