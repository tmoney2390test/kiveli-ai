import assert from 'node:assert/strict';
import { runKivelleDirector } from './kivelle-director.ts';
import { directorRequest } from './kivelle-director-request.ts';
import { requestClient, requestRead } from './request-context.ts';
import { contextReservation, setContextReservation } from './kivelle-context-pricing-state.ts';
import { collectApprovedReply } from './group-reply-stream.ts';
import type { DialogueStreamEvent, DialogueRunMetadata } from './together-ai.ts';

const brief={mode:'casual',emotionalPosture:'Natural',initiative:'medium',selfDisclosure:'none',shouldAskQuestion:false,handoff:{mode:'none',source:'none',reciprocityDebt:0},avoid:[],autonomy:'Independent'} as const;
const directorInput={context:{userMessage:'Hello'},baseBrief:{...brief,avoid:[]},policy:'normal_and_up' as const,interactionQuality:'normal' as const};

Deno.test('Fast bypasses both Director providers even for significant interactions; rollback retains the call',async()=>{
  const fetchBefore=globalThis.fetch, key=Deno.env.get('OPENAI_API_KEY'), flag=Deno.env.get('KIVELLE_CHAT_DIRECTOR_BYPASS');
  let calls=0;
  Deno.env.set('OPENAI_API_KEY','test-key');
  Deno.env.delete('KIVELLE_CHAT_DIRECTOR_BYPASS');
  globalThis.fetch=(()=>{calls++;return Promise.resolve(Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(brief)}]}]}));}) as typeof fetch;
  try{
    for(const interactionQuality of ['normal','major_relationship_event'] as const){
      const result=await runKivelleDirector({...directorInput,interactionQuality,reasoningPreference:'none',activeConflict:true});
      assert.equal(result.directorUsed,false);assert.deepEqual(result.brief,directorInput.baseBrief);
    }
    assert.equal(calls,0);
    Deno.env.set('KIVELLE_CHAT_DIRECTOR_BYPASS','off');
    assert.equal((await runKivelleDirector({...directorInput,reasoningPreference:'none'})).directorUsed,true);
    assert.equal(calls,1);
    for(const reasoningPreference of ['low','medium','high','auto'])assert.equal((await runKivelleDirector({...directorInput,reasoningPreference})).directorUsed,true);
  }finally{globalThis.fetch=fetchBefore;for(const [name,value] of [['OPENAI_API_KEY',key],['KIVELLE_CHAT_DIRECTOR_BYPASS',flag]]){if(value===undefined)Deno.env.delete(name!);else Deno.env.set(name!,value);}}
});

Deno.test('Director timeout aborts a pending fetch and a stalled response body',async()=>{
  for(const stage of ['headers','body']){
    let signal:AbortSignal|undefined;
    const fetcher=(_url:unknown,init?:RequestInit)=>{
      signal=init?.signal as AbortSignal;
      if(stage==='headers')return new Promise<Response>((_resolve,reject)=>signal!.addEventListener('abort',()=>reject(signal!.reason),{once:true}));
      return Promise.resolve({json:()=>new Promise((_resolve,reject)=>signal!.addEventListener('abort',()=>reject(signal!.reason),{once:true}))} as Response);
    };
    await assert.rejects(directorRequest('https://example.invalid',{},10,fetcher as typeof fetch));
    assert.equal(signal?.aborted,true);
  }
});

Deno.test('repeated Director failures enter a bounded cooldown and recover',async()=>{
  const oldFetch=globalThis.fetch,oldNow=Date.now;
  const names=['OPENAI_API_KEY','GEMINI_API_KEY','KIVELLE_CHAT_DIRECTOR_BYPASS'];
  const previous=names.map(name=>Deno.env.get(name));
  let now=oldNow(),calls=0;
  Date.now=()=>now;
  Deno.env.set(names[0]!, 'test');Deno.env.set(names[1]!, 'test');Deno.env.delete(names[2]!);
  globalThis.fetch=(()=>{calls++;return Promise.resolve(Response.json({error:'unavailable'},{status:503}));}) as typeof fetch;
  try{
    for(let i=0;i<3;i++)assert.equal((await runKivelleDirector({...directorInput,reasoningPreference:'low'})).directorUsed,false);
    assert.equal(calls,6);
    await runKivelleDirector({...directorInput,reasoningPreference:'low'});assert.equal(calls,6);
    now+=60_001;
    globalThis.fetch=(()=>{calls++;return Promise.resolve(Response.json({output_text:JSON.stringify(brief)}));}) as typeof fetch;
    assert.equal((await runKivelleDirector({...directorInput,reasoningPreference:'low'})).directorUsed,true);
    assert.equal(calls,7);
  }finally{globalThis.fetch=oldFetch;Date.now=oldNow;names.forEach((name,index)=>{const value=previous[index];if(value===undefined)Deno.env.delete(name);else Deno.env.set(name,value);});}
});

Deno.test('request reads coalesce, clone per speaker, retry failures, and isolate billing across simultaneous requests',async()=>{
  const transport={value:7,read(){return this.value;}};
  const one=requestClient(transport as never),two=requestClient(transport as never);
  assert.notEqual(one,two);assert.equal((one as unknown as typeof transport).read(),7);
  let calls=0;
  const loader=async()=>{calls++;return {data:{facts:['original']}};};
  const [a,b]=await Promise.all([requestRead(one,['authored','one'],loader),requestRead(one,['authored','one'],loader)]);
  assert.equal(calls,1);a.data.facts.push('speaker private');assert.deepEqual(b.data.facts,['original']);
  await requestRead(two,['authored','one'],loader);assert.equal(calls,2);
  await assert.rejects(requestRead(one,['retry'],()=>Promise.reject(new Error('transient'))));
  assert.equal(await requestRead(one,['retry'],async()=>42),42);
  await requestRead(one,['query-error'],async()=>({error:{code:'temporary'}}));
  assert.equal(await requestRead(one,['query-error'],async()=>42),42);
  setContextReservation(one,{quoteId:'one',usedReplies:new Set()} as never);
  setContextReservation(two,{quoteId:'two',usedReplies:new Set()} as never);
  contextReservation(one)!.usedReplies.add('only-one');
  assert.equal(contextReservation(one)?.quoteId,'one');assert.equal(contextReservation(two)?.quoteId,'two');assert.equal(contextReservation(two)?.usedReplies.size,0);
});

const metadata:DialogueRunMetadata={provider:'openai',model:'test',routeReason:'test',contentMode:'standard',cachedInputTokens:0,inputTokens:1,outputTokens:1,reasoningTokens:0,latencyMs:1};
const sentence='This complete sentence is long enough for a moderated streaming segment. ';
Deno.test('group text is approved and visible before provider completion',async()=>{
  let emitted=false;const approved:string[]=[],chunks:string[]=[];
  async function* events():AsyncGenerator<DialogueStreamEvent>{yield{type:'token',token:sentence};assert.equal(emitted,true);yield{type:'token',token:'The end.'};yield{type:'complete',metadata};}
  const result=await collectApprovedReply({events:events(),approve:async text=>{approved.push(text);return true;},onDelta:(text,sequence)=>{assert.equal(approved.at(-1),chunks.join('')+text);chunks.push(text);assert.equal(sequence,chunks.length);emitted=true;}});
  assert.equal(result.text,sentence+'The end.');assert.equal(result.approved,true);assert.equal(chunks.join(''),result.text);
});
Deno.test('blocked or interrupted group text cannot become a completed draft',async()=>{
  const visible:string[]=[];
  async function* events():AsyncGenerator<DialogueStreamEvent>{yield{type:'token',token:sentence};yield{type:'token',token:'Blocked ending.'};yield{type:'complete',metadata};}
  const result=await collectApprovedReply({events:events(),approve:async text=>!text.includes('Blocked'),onDelta:text=>visible.push(text)});
  assert.equal(result.approved,false);assert.equal(visible.join(''),sentence);
  async function* interrupted():AsyncGenerator<DialogueStreamEvent>{yield{type:'token',token:'partial'};}
  await assert.rejects(collectApprovedReply({events:interrupted(),approve:async()=>true,onDelta:()=>assert.fail('Uncommitted short text must stay buffered')}),/without completion/);
});
Deno.test('takeover during moderation stops even an otherwise approved delta',async()=>{
  const controller=new AbortController();
  async function* events():AsyncGenerator<DialogueStreamEvent>{yield{type:'token',token:sentence};yield{type:'complete',metadata};}
  await assert.rejects(collectApprovedReply({events:events(),signal:controller.signal,approve:async()=>{controller.abort();return true;},onDelta:()=>assert.fail('stale text emitted')}));
});
