import{describe,expect,it}from'vitest';
import type{GeneratedMedia}from'../types';
import{latestMediaOfferPreviewUri}from'./mediaOfferPresentation';

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
