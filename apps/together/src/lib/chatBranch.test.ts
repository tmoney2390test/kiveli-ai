import {describe,expect,it} from 'vitest';
import {canOfferChatBranch} from './chatBranch';

const latest={conversationKind:'direct',isBranch:false,latestAssistantMessageId:'reply-2',
  candidateMessageId:'reply-2',candidateIsPrefix:false,replyPending:false,pendingImage:false,branching:false};

describe('subscriber chat branch entry',()=>{
  it('offers the action only on the newest completed direct reply',()=>{
    expect(canOfferChatBranch(latest)).toBe(true);
    expect(canOfferChatBranch({...latest,candidateMessageId:'reply-1'})).toBe(false);
    expect(canOfferChatBranch({...latest,latestAssistantMessageId:null})).toBe(false);
  });
  it('never treats copied history or a child path as a new branch anchor',()=>{
    expect(canOfferChatBranch({...latest,candidateIsPrefix:true})).toBe(false);
    expect(canOfferChatBranch({...latest,isBranch:true})).toBe(false);
  });
  it('waits for in-flight responses and does not appear in group chat',()=>{
    expect(canOfferChatBranch({...latest,replyPending:true})).toBe(false);
    expect(canOfferChatBranch({...latest,pendingImage:true})).toBe(false);
    expect(canOfferChatBranch({...latest,conversationKind:'group'})).toBe(false);
  });
});
