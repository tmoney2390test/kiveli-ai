import { describe, expect, it } from 'vitest';
import type { ConversationAttachment, GeneratedMedia, Message } from '../types';
import { chatMediaGalleryItems, chatMediaVideoPreview } from './chatMediaGallery';

const generated=(input:Partial<GeneratedMedia> & Pick<GeneratedMedia,'id'>):GeneratedMedia=>({
  character_instance_id:'character',media_type:'image',content_level:'standard',status:'ready',signed_url:'https://media.example.test/item',created_at:'2026-09-03T12:00:00.000Z',...input,
});
const attachment=(input:Partial<ConversationAttachment> & Pick<ConversationAttachment,'id'>):ConversationAttachment=>({
  user_id:'user',continuity_id:'life',conversation_id:'conversation',kind:'image',source:'user',storage_path:'private/item',mime_type:'image/jpeg',byte_size:100,upload_status:'uploaded',analysis_status:'ready',analysis_metadata:{},metadata:{},signed_url:'https://media.example.test/attachment',created_at:'2026-09-03T13:00:00.000Z',updated_at:'2026-09-03T13:00:00.000Z',...input,
});

describe('chatMediaGalleryItems',()=>{
  it('returns ready photos and videos from the active conversation in newest-first order',()=>{
    const messages=[{id:'message',conversation_id:'conversation',attachments:[attachment({id:'shared'})]}] as Message[];
    const items=chatMediaGalleryItems([
      generated({id:'photo',conversation_id:'conversation'}),
      generated({id:'video',conversation_id:'conversation',media_type:'video',created_at:'2026-09-03T14:00:00.000Z'}),
      generated({id:'voice',conversation_id:'conversation',media_type:'voice_note'}),
      generated({id:'other',conversation_id:'other'}),
      generated({id:'failed',conversation_id:'conversation',status:'failed'}),
    ],messages,'conversation');

    expect(items.map((item)=>item.id)).toEqual(['generated:video','attachment:shared','generated:photo']);
  });

  it('keeps in-progress videos visible and merges attachments loaded outside the message page',()=>{
    const items=chatMediaGalleryItems([
      generated({id:'working-video',conversation_id:'conversation',media_type:'video',status:'generating',signed_url:null}),
      generated({id:'failed-video',conversation_id:'conversation',media_type:'video',status:'failed',signed_url:null}),
    ],[],'conversation',[attachment({id:'older-shared',created_at:'2026-08-30T13:00:00.000Z'})]);

    expect(items.map((item)=>item.id)).toEqual(['generated:working-video','attachment:older-shared']);
  });
});


describe('conversation video previews', () => {
  const video = generated({id:'video', conversation_id:'conversation', media_type:'video', parent_media_id:'photo'});
  const item = {kind:'generated' as const,id:'generated:video',createdAt:video.created_at,media:video};
  it('loads the video itself when its source photo is missing from this gallery', () => {
    expect(chatMediaVideoPreview(item,new Map())).toEqual({uri:video.signed_url,poster:null});
  });
  it('keeps an authorized source image as a loading poster', () => {
    const photo=generated({id:'photo',conversation_id:'conversation'});
    expect(chatMediaVideoPreview(item,new Map([['photo',photo]]))).toEqual({uri:video.signed_url,poster:photo});
  });
  it('does not reuse withheld, unfinished, cross-conversation or video parents as image posters', () => {
    for(const changes of [{signed_url:null},{status:'failed' as const},{conversation_id:'other'},{media_type:'video' as const}]){
      const photo=generated({id:'photo',conversation_id:'conversation',...changes});
      expect(chatMediaVideoPreview(item,new Map([['photo',photo]])).poster).toBeNull();
    }
  });
  it('does not load a generated video before it is ready', () => {
    expect(chatMediaVideoPreview({...item,media:{...video,status:'generating'}},new Map()).uri).toBeNull();
  });
  it('uses uploaded videos directly without needing a generated parent', () => {
    const upload=attachment({id:'uploaded-video',kind:'video',mime_type:'video/mp4'});
    expect(chatMediaVideoPreview({kind:'attachment',id:upload.id,createdAt:upload.created_at,attachment:upload},new Map())).toEqual({uri:upload.signed_url,poster:null});
  });
  it('leaves photos out of the video decoder', () => {
    expect(chatMediaVideoPreview({...item,media:generated({id:'photo'})},new Map()).uri).toBeNull();
  });
});
