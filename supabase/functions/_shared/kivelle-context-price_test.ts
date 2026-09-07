const assert=Object.assign((condition:unknown)=>{if(!condition)throw new Error('Assertion failed');},{equal:(a:unknown,b:unknown)=>{if(a!==b)throw new Error(`${a} !== ${b}`);},notEqual:(a:unknown,b:unknown)=>{if(a===b)throw new Error('Expected different values');},ok:(v:unknown)=>{if(!v)throw new Error('Expected truthy value');},throws:(fn:()=>unknown,pattern:RegExp)=>{try{fn();}catch(error){if(pattern.test(String(error)))return;throw error;}throw new Error('Expected failure');}});
import { contextCredits } from './kivelle-context-price.ts';
import { contextChargeForUsage } from './kivelle-context-charge.ts';
import { contextDraftFingerprint } from './kivelle-context-authorization.ts';
Deno.test('price depends on input, model, output and actual cache use',()=>{
  const luna={provider:'openai',model:'gpt-5.6-luna',inputTokens:32000,outputTokens:200};
  assert.equal(contextCredits(luna),2);assert.equal(contextCredits({...luna,inputTokens:64000}),3);
  assert.equal(contextCredits({...luna,provider:'xai',model:'grok-4.3'}),5);
  assert.ok(contextCredits({...luna,cachedInputTokens:30000})<contextCredits(luna));
  assert.ok(contextCredits({...luna,serviceTier:'priority'})>contextCredits(luna));
  assert.throws(()=>contextCredits({...luna,model:'unpriced-model'}),/pricing is being updated/);
});
Deno.test('final settlement never exceeds the displayed maximum and failures cost zero',()=>{
  const payment={quoteId:'quote',replyKey:'reply',preference:'extended_32k',estimatedTokens:32000,paid:true,slot:{speakerId:'speaker',provider:'xai',model:'grok-4.3',inputTokens:32000,maxOutputTokens:2000,maximumCredits:5,paidExpansion:true}};
  assert.equal(contextChargeForUsage(payment,{inputTokens:64000,outputTokens:2000,cachedInputTokens:0},false)?.credits,5);
  assert.equal(contextChargeForUsage(payment,null,true)?.credits,0);
  assert.equal(contextChargeForUsage({...payment,paid:false},null,false)?.credits,0);
});
Deno.test('quote fingerprints reject changed drafts, recipients, attachments and continuations',async()=>{
 const draft={conversationId:'conversation',message:'Hello',mentionedCharacterInstanceIds:['one']};
 const first=await contextDraftFingerprint(draft);
 assert.equal(first,await contextDraftFingerprint({...draft,clientRequestId:'retry'}));
 for(const change of [{message:'Edited'},{mentionedCharacterInstanceIds:['two']},{attachmentIds:['photo']},{messageAction:'continue',anchorMessageId:'reply'}])assert.notEqual(first,await contextDraftFingerprint({...draft,...change}));
});
