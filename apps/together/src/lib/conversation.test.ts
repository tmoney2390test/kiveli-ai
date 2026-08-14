import { describe, expect, it } from 'vitest';
import { activeConversationFor, mergeOlderMessages } from './conversation';
import type { Conversation, Message } from '../types';

const message=(id:string,created_at:string):Message=>({id,conversation_id:'conversation',role:'user',content:id,delivery_status:'complete',created_at});

describe('conversation continuity helpers',()=>{
  it('never selects an archived conversation as active',()=>{const conversations:Conversation[]=[{id:'old',character_instance_id:'maya',kind:'direct',title:null,last_message_at:'2026-08-14T10:00:00Z',archived_at:'2026-08-14T11:00:00Z'},{id:'new',character_instance_id:'maya',kind:'direct',title:null,last_message_at:null,archived_at:null}];expect(activeConversationFor(conversations,'maya')?.id).toBe('new');});
  it('isolates conversations by companion',()=>{const conversations:Conversation[]=[{id:'maya-chat',character_instance_id:'maya',kind:'direct',title:null,last_message_at:null},{id:'sofia-chat',character_instance_id:'sofia',kind:'direct',title:null,last_message_at:null}];expect(activeConversationFor(conversations,'sofia')?.id).toBe('sofia-chat');});
  it('reverses older pages, prepends them, and removes duplicates',()=>{const current=[message('3','2026-08-14T03:00:00Z'),message('4','2026-08-14T04:00:00Z')];const older=[message('3','2026-08-14T03:00:00Z'),message('2','2026-08-14T02:00:00Z'),message('1','2026-08-14T01:00:00Z')];expect(mergeOlderMessages(older,current).map((item)=>item.id)).toEqual(['1','2','3','4']);});
});
