import{describe,expect,it}from'vitest';
import type{GeneratedMedia}from'../types';
import{isMediaOfferBusy,latestMediaOfferPreviewUri}from'./mediaOfferPresentation';

describe('photo confirmation busy state',()=>{
  it('keeps a new offer actionable when no acceptance or retry is running',()=>{
    expect(isMediaOfferBusy({id:'freya-selfie',generated_media_id:null},null,null)).toBe(false);
    expect(isMediaOfferBusy({id:'freya-selfie'},null,null)).toBe(false);
  });
  it('marks only the offer whose acceptance is in flight as busy',()=>{
    const offer={id:'freya-selfie',generated_media_id:null};
    expect(isMediaOfferBusy(offer,'freya-selfie',null)).toBe(true);
    expect(isMediaOfferBusy(offer,'other-offer',null)).toBe(false);
  });
  it('marks a retry busy only for its actual generated media',()=>{
    const offer={id:'freya-selfie',generated_media_id:'failed-image'};
    expect(isMediaOfferBusy(offer,null,'failed-image')).toBe(true);
    expect(isMediaOfferBusy(offer,null,'other-image')).toBe(false);
    expect(isMediaOfferBusy(offer,null,null)).toBe(false);
    // Group chat shares one busy ID for acceptance and retry actions.
    expect(isMediaOfferBusy(offer,'failed-image','failed-image')).toBe(true);
  });
  it('does not invent a busy photo card without an offer',()=>{
    expect(isMediaOfferBusy(undefined,null,null)).toBe(false);
    expect(isMediaOfferBusy(null,'offer','image')).toBe(false);
  });
});

const image=(id:string,conversationId:string,createdAt:string,signedUrl?:string):GeneratedMedia=>({id,character_instance_id:'brooke',conversation_id:conversationId,media_type:'image',content_level:'standard',status:signedUrl?'ready':'generating',signed_url:signedUrl,created_at:createdAt});

describe('media offer preview',()=>{
  it('prefers the newest ready photo from the current conversation',()=>{
    const media=[image('other','other-chat','2026-08-21T12:00:00Z','other.jpg'),image('old','chat','2026-08-20T12:00:00Z','old.jpg'),image('new','chat','2026-08-21T10:00:00Z','new.jpg')];
    expect(latestMediaOfferPreviewUri(media,'brooke','chat')).toBe('new.jpg');
  });

  it('falls back to the latest companion photo and ignores unfinished media',()=>{
    const media=[image('pending','chat','2026-08-21T13:00:00Z'),image('ready','other-chat','2026-08-21T12:00:00Z','ready.jpg')];
    expect(latestMediaOfferPreviewUri(media,'brooke','chat')).toBe('ready.jpg');
    expect(latestMediaOfferPreviewUri(media,'someone-else','chat')).toBeNull();
  });
});
