import { describe, expect, it } from 'vitest';
import type { ConversationAttachment, GeneratedMedia, Message } from '../types';
import { chatMediaGalleryItems } from './chatMediaGallery';

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
});
