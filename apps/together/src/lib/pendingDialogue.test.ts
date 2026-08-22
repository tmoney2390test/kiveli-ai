import{describe,expect,it}from'vitest';
import{beginPendingDialogue,finishPendingDialogue,type PendingDialogueMap}from'./pendingDialogue';

describe('pending dialogue registry',()=>{
  const reply={conversationId:'brooke-chat',characterInstanceId:'brooke',clientRequestId:'request-2',startedAt:'2026-08-21T18:00:00.000Z',showTyping:true};

  it('keeps replies scoped independently while users move between chats',()=>{
    const chloe={conversationId:'chloe-chat',characterInstanceId:'chloe',clientRequestId:'request-1',startedAt:'2026-08-21T17:59:00.000Z',showTyping:true};
    const pending=beginPendingDialogue(beginPendingDialogue({},chloe),reply);
    expect(Object.keys(pending)).toEqual(['chloe-chat','brooke-chat']);
    expect(pending['brooke-chat']).toEqual(reply);
  });

  it('only lets the matching request clear its conversation indicator',()=>{
    const pending=beginPendingDialogue({},reply);
    expect(finishPendingDialogue(pending,'brooke-chat','older-request')).toBe(pending);
    expect(finishPendingDialogue(pending,'brooke-chat','request-2')).toEqual({});
  });

  it('can keep photo-offer work silent without losing its in-flight lock',()=>{
    const silent:PendingDialogueMap=beginPendingDialogue({}, {...reply,showTyping:false});
    expect(silent['brooke-chat']?.showTyping).toBe(false);
  });
});
