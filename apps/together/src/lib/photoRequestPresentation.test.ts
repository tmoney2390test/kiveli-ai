import { describe, expect, it } from 'vitest';
import type { MediaOffer } from '../types';
import { photoOfferForMessage, photoOffersWithoutVisibleMessages, shouldShowPhotoGenerationPending } from './photoRequestPresentation';

function offer(id: string, status: MediaOffer['status'], source: MediaOffer['source'], createdAt: string): MediaOffer {
  return {id,continuity_id:'life',character_instance_id:'character',message_id:id.includes('orphan')?null:'photo-message',source,status,content_level:'standard',quality_tier:'standard',shot_type:'selfie',credit_action:'companion_photo',credit_cost:10,title:'Picture request',companion_message:'A picture is ready to confirm',preview_metadata:{},included_subscription_benefit:false,created_at:createdAt,updated_at:createdAt};
}

describe('photo request presentation', () => {
  it('shows immediate progress for ordinary contextual photo requests', () => {
    expect(shouldShowPhotoGenerationPending('send me a selfie')).toBe(true);
    expect(shouldShowPhotoGenerationPending('show me your outfit')).toBe(true);
  });

  it('shows progress while server policy decides an adult photo request', () => {
    expect(shouldShowPhotoGenerationPending('send me a picture of your boobs')).toBe(true);
    expect(shouldShowPhotoGenerationPending('send me a zoomed in picture of your boobies')).toBe(true);
    expect(shouldShowPhotoGenerationPending('send me a nude photo')).toBe(true);
    expect(shouldShowPhotoGenerationPending('show me your boobs')).toBe(true);
    expect(shouldShowPhotoGenerationPending('can I see your breasts?')).toBe(true);
    expect(shouldShowPhotoGenerationPending('sbow me a picjtre of youe boobs')).toBe(true);
    expect(shouldShowPhotoGenerationPending('Show me your pussy sitting on the couch legs spread open')).toBe(true);
    expect(shouldShowPhotoGenerationPending('show me your vajayjay')).toBe(true);
    expect(shouldShowPhotoGenerationPending('send me a picture of your c0ck')).toBe(true);
    expect(shouldShowPhotoGenerationPending('show me your b**bs')).toBe(true);
  });

  it('does not imply generation for a hard-blocked request', () => {
    expect(shouldShowPhotoGenerationPending('send me an underage photo')).toBe(false);
    expect(shouldShowPhotoGenerationPending('send me a photo that looks exactly like a celebrity')).toBe(false);
  });

  it('ignores ordinary conversation that is not requesting media', () => {
    expect(shouldShowPhotoGenerationPending('what are you doing tonight?')).toBe(false);
    expect(shouldShowPhotoGenerationPending('you showed me your boobs yesterday')).toBe(false);
  });

  it('binds the newest active offer to its inline photo message', () => {
    const older=offer('older','pending','user_request','2026-08-21T12:00:00.000Z');
    const newer=offer('newer','pending','user_request','2026-08-21T12:01:00.000Z');
    const result=photoOfferForMessage([older,newer,offer('accepted','accepted','story','2026-08-21T11:59:00.000Z')],'photo-message');
    expect(result?.id).toBe('newer');
  });

  it('ignores terminal offers and unrelated messages', () => {
    const terminal=offer('declined','declined','user_request','2026-08-21T12:03:00.000Z');
    const unrelated={...offer('unrelated','pending','user_request','2026-08-21T12:02:00.000Z'),message_id:'another-message'};
    const result=photoOfferForMessage([terminal,unrelated],'photo-message');
    expect(result).toBeNull();
  });

  it('keeps a failed request attached so the inline card can explain and retry it', () => {
    const failed={...offer('failed','failed','user_request','2026-08-21T12:03:00.000Z'),generated_media_id:'media-failed'};
    expect(photoOfferForMessage([failed],'photo-message')).toMatchObject({id:'failed',generated_media_id:'media-failed'});
  });

  it('keeps only offers without an inline card in the fallback list', () => {
    const attached=offer('attached','pending','user_request','2026-08-21T12:00:00.000Z');
    const orphan=offer('orphan-offer','pending','story','2026-08-21T12:01:00.000Z');
    expect(photoOffersWithoutVisibleMessages([attached,orphan],new Set(['photo-message']))).toEqual([orphan]);
  });
});
