import { describe, expect, it } from 'vitest';
import type { GeneratedMedia, MediaOffer } from '../types';
import { customPhotoRequestText, includedPhotoWasFree, mediaWithoutActivePhotoOffer, photoCardAspectRatio, photoMediaForOffer, photoOfferDismissAction, photoOfferForMessage, photoOfferPaymentMethod, photoOffersAtTimelineTail, photoOffersWithoutVisibleMessages, shouldShowPhotoGenerationPending, visibleChatPhotoMedia } from './photoRequestPresentation';

function offer(id: string, status: MediaOffer['status'], source: MediaOffer['source'], createdAt: string): MediaOffer {
  return {id,continuity_id:'life',character_instance_id:'character',message_id:id.includes('orphan')?null:'photo-message',source,status,content_level:'standard',quality_tier:'standard',shot_type:'selfie',credit_action:'companion_photo',credit_cost:10,title:'Picture request',companion_message:'A picture is ready to confirm',preview_metadata:{},included_subscription_benefit:false,created_at:createdAt,updated_at:createdAt};
}

describe('photo request presentation', () => {
  it('uses the included daily photo automatically, then returns to disclosed credits', () => {
    const pending = offer('daily', 'pending', 'user_request', '2026-09-29T12:00:00.000Z');
    expect(photoOfferPaymentMethod({...pending, preview_metadata:{dailyPhotoAllowanceRemaining:1}})).toBe('daily_included');
    expect(photoOfferPaymentMethod({...pending, preview_metadata:{dailyPhotoAllowanceRemaining:0}})).toBe('credits');
    expect(photoOfferPaymentMethod({...pending, source:'story', preview_metadata:{dailyPhotoAllowanceRemaining:1}})).toBe('credits');
    expect(photoOfferPaymentMethod({...pending, included_subscription_benefit:true, preview_metadata:{dailyPhotoAllowanceRemaining:1}})).toBe('credits');
  });

  it('marks only photos that actually used an included benefit as free', () => {
    const base: GeneratedMedia = {id:'photo', character_instance_id:'character', media_type:'image', content_level:'standard', status:'ready', created_at:'2026-09-29T12:00:00.000Z'};
    const included = {...base, metadata:{includedBenefit:true, includedBenefitType:'daily_companion_photo', creditCost:0}};
    expect(includedPhotoWasFree(included)).toBe(true);
    expect(includedPhotoWasFree({...base, metadata:{includedBenefit:false, creditCost:10}})).toBe(false);
    expect(includedPhotoWasFree({...base, metadata:{includedBenefit:true, creditCost:10}})).toBe(false);
    expect(includedPhotoWasFree({...base, status:'generating', metadata:included.metadata})).toBe(false);
    expect(includedPhotoWasFree({...base, metadata:{}}, {...offer('offer', 'fulfilled', 'date', base.created_at), generated_media_id:base.id, included_subscription_benefit:true, credit_cost:0})).toBe(true);
  });

  it('sizes a finished photo card to its actual image shape', () => {
    expect(photoCardAspectRatio({ width: 1376, height: 768 })).toBeCloseTo(1376 / 768);
    expect(photoCardAspectRatio({ width: 1024, height: 1280 })).toBe(0.8);
    expect(photoCardAspectRatio({ width: null, height: 768 })).toBeNull();
  });
  it('lets users cancel unpaid offers and remove failed requests, but not active generations', () => {
    expect(photoOfferDismissAction('pending')).toBe('cancel');
    expect(photoOfferDismissAction('failed')).toBe('remove');
    expect(photoOfferDismissAction('pending',true,false)).toBeNull();
    expect(photoOfferDismissAction('accepted',false,true)).toBeNull();
    expect(photoOfferDismissAction(undefined)).toBeNull();
  });

  it('shows immediate progress for ordinary contextual photo requests', () => {
    expect(shouldShowPhotoGenerationPending('send me a selfie')).toBe(true);
    expect(shouldShowPhotoGenerationPending('show me your outfit')).toBe(true);
  });

  it('does not advertise a generation path for adult photo requests on native', () => {
    expect(shouldShowPhotoGenerationPending('send me a nude photo')).toBe(false);
    expect(shouldShowPhotoGenerationPending('send me an explicit image')).toBe(false);
  });

  it('turns an exact description into an unambiguous photo request', () => {
    const request=customPhotoRequestText('  sitting by the window in a red dress  ');
    expect(request).toBe('Send me a photo showing exactly this: sitting by the window in a red dress');
    expect(shouldShowPhotoGenerationPending(request)).toBe(true);
    expect(customPhotoRequestText('   ')).toBe('');
  });

  it('does not imply generation for a hard-blocked request', () => {
    expect(shouldShowPhotoGenerationPending('send me an underage photo')).toBe(false);
    expect(shouldShowPhotoGenerationPending('send me a photo that looks exactly like a celebrity')).toBe(false);
  });

  it('ignores ordinary conversation that is not requesting media', () => {
    expect(shouldShowPhotoGenerationPending('what are you doing tonight?')).toBe(false);
    expect(shouldShowPhotoGenerationPending('you showed me your boobs yesterday')).toBe(false);
    expect(shouldShowPhotoGenerationPending('I take my penis out. Care to touch?')).toBe(false);
    expect(shouldShowPhotoGenerationPending('Sora you don’t want to see me you said it yourself')).toBe(false);
    expect(shouldShowPhotoGenerationPending('Don’t send me a photo.')).toBe(false);
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

  it('keeps a failed request owned by its source message for one retry card', () => {
    const failed={...offer('failed','failed','user_request','2026-08-21T12:03:00.000Z'),generated_media_id:'media-failed'};
    expect(photoOfferForMessage([failed],'photo-message')).toEqual(failed);
  });

  it('keeps only offers without an inline card in the fallback list', () => {
    const attached=offer('attached','pending','user_request','2026-08-21T12:00:00.000Z');
    const orphan=offer('orphan-offer','pending','story','2026-08-21T12:01:00.000Z');
    expect(photoOffersWithoutVisibleMessages([attached,orphan],new Set(['photo-message']))).toEqual([orphan]);
  });

  it('does not collect failed requests at the bottom when their source message is not visible', () => {
    const failed={...offer('orphan-failed','failed','user_request','2026-08-21T12:02:00.000Z'),generated_media_id:'failed-media'};
    const pending=offer('orphan-pending','pending','story','2026-08-21T12:03:00.000Z');
    expect(photoOffersWithoutVisibleMessages([failed,pending],new Set())).toEqual([pending]);
  });

  it('does not append a historical photo request after newer messages', () => {
    const oldOffer=offer('orphan-old','pending','story','2026-09-01T10:00:00.000Z');
    const currentOffer=offer('orphan-current','pending','story','2026-09-03T14:00:00.000Z');

    expect(photoOffersAtTimelineTail(
      [currentOffer,oldOffer],
      new Set(),
      ['2026-09-03T13:00:00.000Z'],
    )).toEqual([currentOffer]);
  });

  it('does not render the legacy media loader beside an active blurred offer card', () => {
    const linked={id:'linked',character_instance_id:'character',media_type:'image' as const,content_level:'standard',status:'generating' as const,created_at:'2026-08-21T12:00:00.000Z'};
    const unrelated={...linked,id:'unrelated'};
    expect(mediaWithoutActivePhotoOffer([linked,unrelated],'linked')).toEqual([unrelated]);
  });

  it('hides persisted failed image records while retaining active and ready photos', () => {
    const base={character_instance_id:'character',media_type:'image' as const,content_level:'standard',created_at:'2026-08-21T12:00:00.000Z'};
    const failed={...base,id:'failed',status:'failed' as const};
    const generating={...base,id:'generating',status:'generating' as const};
    const ready={...base,id:'ready',status:'ready' as const,signed_url:'https://example.test/photo.jpg'};
    expect(visibleChatPhotoMedia([failed,generating,ready])).toEqual([generating,ready]);
  });

  it('replaces an original chat photo with its newest active edit', () => {
    const original={id:'original',character_instance_id:'character',message_id:'message',media_type:'image' as const,content_level:'standard',status:'ready' as const,signed_url:'https://example.test/original.jpg',created_at:'2026-08-21T12:00:00.000Z'};
    const edit={...original,id:'edit',parent_media_id:'original',status:'generating' as const,signed_url:null,created_at:'2026-08-21T12:05:00.000Z',metadata:{rootMediaId:'original',editDepth:1}};
    expect(visibleChatPhotoMedia([original,edit])).toEqual([edit]);
    expect(photoMediaForOffer([original,edit],'original')).toEqual(edit);
  });

  it('keeps the last usable photo when its newest edit fails', () => {
    const original={id:'original',character_instance_id:'character',message_id:'message',media_type:'image' as const,content_level:'standard',status:'ready' as const,signed_url:'https://example.test/original.jpg',created_at:'2026-08-21T12:00:00.000Z'};
    const failedEdit={...original,id:'edit',parent_media_id:'original',status:'failed' as const,signed_url:null,created_at:'2026-08-21T12:05:00.000Z',metadata:{rootMediaId:'original',editDepth:1}};
    expect(visibleChatPhotoMedia([failedEdit,original])).toEqual([original]);
    expect(photoMediaForOffer([failedEdit,original],'original')).toEqual(original);
  });
});
