import { expect, it, vi } from 'vitest';
import type { Conversation, Message, Snapshot } from '../types';
import { useMessageRewrite } from './useMessageRewrite';

const mocks=vi.hoisted(()=>({
  quote:vi.fn(),rewrite:vi.fn(),confirm:vi.fn(),busy:vi.fn(),
}));
vi.mock('react',()=>({
  useRef:(value:unknown)=>({current:value}),
  useState:()=>[false,mocks.busy],
  useEffect:()=>undefined,
}));
vi.mock('../lib/api',()=>({quoteDialogueContext:mocks.quote,rewriteDialogueMessage:mocks.rewrite}));
vi.mock('../lib/dialogs',()=>({confirmAction:mocks.confirm}));
vi.mock('../lib/requestId',()=>({createClientRequestId:()=> 'same-request'}));

it('keeps the paid rewrite locked when web confirmation starts work synchronously',async()=>{
  let finish!:(value:unknown)=>void;
  let confirmed:Promise<void>|undefined;
  const response=new Promise(resolve=>{finish=resolve;});
  mocks.quote.mockResolvedValue({maximumCredits:2,quoteId:'quote'});
  mocks.rewrite.mockReturnValue(response);
  mocks.confirm.mockImplementation(({onConfirm}:{onConfirm:()=>Promise<void>})=>{confirmed=onConfirm();});
  const target:Message={id:'reply',conversation_id:'chat',role:'assistant',content:'Original',delivery_status:'complete',created_at:'2026-09-11'};
  const onMessage=vi.fn(),onFinished=vi.fn();
  const hook=useMessageRewrite({
    userId:'owner',conversation:{id:'chat',kind:'direct'} as Conversation,
    profile:{age_verified_at:'2026-09-11',content_preferences:{contentMode:'explicit'}} as unknown as Snapshot['profile'],
    messages:[target],pending:false,onMessage,onFinished,onError:vi.fn(),
  });
  await hook.spice(target);
  expect(mocks.busy).toHaveBeenLastCalledWith(true);
  await hook.spice(target);
  expect(mocks.quote).toHaveBeenCalledTimes(1);
  expect(mocks.rewrite).toHaveBeenCalledTimes(1);
  finish({message:{...target,content:'Revised',provider_metadata:{rewriteVersion:1}}});
  await confirmed;
  expect(onMessage).toHaveBeenCalledTimes(1);
  expect(onFinished).toHaveBeenCalledTimes(1);
  expect(mocks.busy).toHaveBeenLastCalledWith(false);
});
