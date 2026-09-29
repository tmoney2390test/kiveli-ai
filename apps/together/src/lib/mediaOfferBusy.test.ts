import { describe, expect, it } from 'vitest';
import { mediaOfferActionBusy } from './mediaOfferBusy';

describe('mediaOfferActionBusy', () => {
  const pending = { id: 'offer-1', generated_media_id: null };
  const accepted = { id: 'offer-1', generated_media_id: 'media-1' };

  it('does not mark an unconfirmed offer as starting while idle', () => {
    expect(mediaOfferActionBusy(null, pending)).toBe(false);
    expect(mediaOfferActionBusy(null, pending, null)).toBe(false);
    expect(mediaOfferActionBusy(null, { id: 'offer-1' }, null)).toBe(false);
  });

  it('marks only the active offer or media as busy', () => {
    expect(mediaOfferActionBusy('offer-1', pending)).toBe(true);
    expect(mediaOfferActionBusy('media-1', accepted)).toBe(true);
    expect(mediaOfferActionBusy('another-offer', accepted)).toBe(false);
  });

  it('tracks separate acceptance and retry requests without disabling unrelated offers', () => {
    expect(mediaOfferActionBusy('offer-1', pending, null)).toBe(true);
    expect(mediaOfferActionBusy(null, accepted, 'media-1')).toBe(true);
    expect(mediaOfferActionBusy('another-offer', accepted, 'media-1')).toBe(true);
    expect(mediaOfferActionBusy('another-offer', pending, 'another-media')).toBe(false);
    expect(mediaOfferActionBusy(null, pending, 'another-media')).toBe(false);
  });

  it('does not invent a busy card when a message has no photo offer', () => {
    expect(mediaOfferActionBusy(null, null, null)).toBe(false);
    expect(mediaOfferActionBusy('offer-1', undefined, 'media-1')).toBe(false);
  });
});
