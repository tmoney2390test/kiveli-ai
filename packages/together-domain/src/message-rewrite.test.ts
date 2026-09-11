import { describe, expect, it } from 'vitest';
import { canRewriteMessage, messageRewriteVersion, type RewriteMessage } from './message-rewrite';
const reply:RewriteMessage={id:'reply',role:'assistant',content:'The library opens at noon.',delivery_status:'complete'};
describe('single-message revisions',()=>{
  it('allows the latest completed character text reply',()=>expect(canRewriteMessage(reply,[reply])).toBe(true));
  it.each(['user','assistant','system'])('rejects a reply with a later visible %s row',role=>expect(canRewriteMessage(reply,[reply,{...reply,id:'later',role}])).toBe(false));
  it.each([{role:'user'},{delivery_status:'pending'},{delivery_status:'failed'},{content:'[Photo]'},{content:''},{id:'local-1'},{provider_metadata:{mediaOnly:true}},{provider_metadata:{characterDead:true}}])('rejects an invalid target %o',patch=>{const target={...reply,...patch};expect(canRewriteMessage(target,[target])).toBe(false);});
  it('ignores hidden transport rows, not later visible user requests',()=>expect(canRewriteMessage(reply,[reply,{...reply,id:'hidden',provider_metadata:{uiHidden:true}}])).toBe(true));
  it('handles legacy and malformed revision versions conservatively',()=>{expect(messageRewriteVersion(reply)).toBe(0);expect(messageRewriteVersion({...reply,provider_metadata:{rewriteVersion:-1}})).toBe(0);expect(messageRewriteVersion({...reply,provider_metadata:{rewriteVersion:2}})).toBe(2);});
});
