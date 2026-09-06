import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import type { AutoDialogueInput } from '../../../packages/together-domain/src/auto-dialogue.ts';
import { ConfiguredAutoDialogueProvider } from './together-auto-dialogue.ts';

const baseInput:AutoDialogueInput={
  characterName:'Elena',latestAssistantMessage:'Tell me what you want.',recent:[{role:'assistant',content:'Tell me what you want.'}],
  scene:{interactionMode:'remote',location:'Home',activity:'relaxing'},relationshipStage:'dating',contentMode:'mature',latestContentRating:'suggestive',relationship:{romanceEnabled:true},
};

Deno.test({name:'an authorized explicit reply draft uses Grok and the configured suggestion model',permissions:{env:true},fn:async()=>{
  const previous=saveEnv(['XAI_API_KEY','OPENAI_API_KEY','GEMINI_API_KEY','KIVELLE_XAI_SUGGESTION_MODEL','KIVELLE_XAI_ENABLED','KIVELLE_XAI_EXPLICIT_ENABLED','KIVELLE_PRIVATE_ADULT_TEXT_MODE']);
  try{
    enableSpicyGrok();Deno.env.set('OPENAI_API_KEY','openai-secret');Deno.env.set('GEMINI_API_KEY','gemini-secret');Deno.env.set('KIVELLE_XAI_SUGGESTION_MODEL','grok-suggestion-test');
    const calls:Array<{url:string;body:Record<string,unknown>}>=[];
    const provider=new ConfiguredAutoDialogueProvider(async(input,init)=>{
      calls.push({url:String(input),body:JSON.parse(String(init?.body))});
      return new Response(JSON.stringify({output_text:JSON.stringify({text:'I want to keep going with you.'}),usage:{input_tokens:20,output_tokens:8}}),{status:200,headers:{'Content-Type':'application/json'}});
    });
    const result=await provider.generate({...baseInput,contentMode:'explicit',latestContentRating:'explicit',explicitContinuationAllowed:true});
    assertEquals(result.source,'xai');assertEquals(calls.length,1);
    assertEquals(calls[0]?.url,'https://api.x.ai/v1/responses');
    assertEquals(calls[0]?.body.model,'grok-suggestion-test');
    assertStringIncludes(String(calls[0]?.body.input),'controlling conversational anchor');
  }finally{restoreEnv(previous);}
}});

Deno.test({name:'a failed spicy Grok request does not send explicit context to another provider',permissions:{env:true},fn:async()=>{
  const previous=saveEnv(['XAI_API_KEY','OPENAI_API_KEY','GEMINI_API_KEY','KIVELLE_XAI_ENABLED','KIVELLE_XAI_EXPLICIT_ENABLED','KIVELLE_PRIVATE_ADULT_TEXT_MODE']);
  try{
    enableSpicyGrok();Deno.env.set('OPENAI_API_KEY','openai-secret');Deno.env.set('GEMINI_API_KEY','gemini-secret');
    const urls:string[]=[];
    const provider=new ConfiguredAutoDialogueProvider(async(input)=>{urls.push(String(input));return new Response('{}',{status:503});});
    const result=await provider.generate({...baseInput,contentMode:'explicit',latestContentRating:'explicit',explicitContinuationAllowed:true});
    assertEquals(urls,['https://api.x.ai/v1/responses']);
    assertEquals(result.source,'deterministic');
  }finally{restoreEnv(previous);}
}});

Deno.test({name:'a disabled spicy Grok route fails closed without using a safe provider',permissions:{env:true},fn:async()=>{
  const previous=saveEnv(['XAI_API_KEY','OPENAI_API_KEY','GEMINI_API_KEY','KIVELLE_XAI_ENABLED','KIVELLE_XAI_EXPLICIT_ENABLED','KIVELLE_PRIVATE_ADULT_TEXT_MODE']);
  try{
    Deno.env.set('XAI_API_KEY','xai-secret');Deno.env.set('OPENAI_API_KEY','openai-secret');Deno.env.set('GEMINI_API_KEY','gemini-secret');Deno.env.set('KIVELLE_XAI_ENABLED','false');Deno.env.set('KIVELLE_XAI_EXPLICIT_ENABLED','true');Deno.env.set('KIVELLE_PRIVATE_ADULT_TEXT_MODE','on');
    const urls:string[]=[];
    const provider=new ConfiguredAutoDialogueProvider(async(input)=>{urls.push(String(input));return new Response('{}',{status:200});});
    const result=await provider.generate({...baseInput,contentMode:'explicit',latestContentRating:'explicit',explicitContinuationAllowed:true});
    assertEquals(urls,[]);assertEquals(result.source,'deterministic');
  }finally{restoreEnv(previous);}
}});

Deno.test({name:'a non-explicit latest message keeps the normal OpenAI suggestion route',permissions:{env:true},fn:async()=>{
  const previous=saveEnv(['XAI_API_KEY','OPENAI_API_KEY','GEMINI_API_KEY','KIVELLE_SUGGESTION_MODEL']);
  try{
    Deno.env.set('XAI_API_KEY','xai-secret');Deno.env.set('OPENAI_API_KEY','openai-secret');Deno.env.delete('GEMINI_API_KEY');Deno.env.set('KIVELLE_SUGGESTION_MODEL','openai-suggestion-test');
    const urls:string[]=[];
    const provider=new ConfiguredAutoDialogueProvider(async(input)=>{urls.push(String(input));return new Response(JSON.stringify({output_text:JSON.stringify({text:'I want to hear more about that.'}),usage:{input_tokens:20,output_tokens:8}}),{status:200});});
    const result=await provider.generate(baseInput);
    assertEquals(urls,['https://api.openai.com/v1/responses']);
    assertEquals(result.source,'openai');
  }finally{restoreEnv(previous);}
}});

function saveEnv(names:string[]):Map<string,string|undefined>{return new Map(names.map((name)=>[name,Deno.env.get(name)]));}
function restoreEnv(values:Map<string,string|undefined>):void{for(const[name,value]of values)if(value===undefined)Deno.env.delete(name);else Deno.env.set(name,value);}
function enableSpicyGrok():void{Deno.env.set('XAI_API_KEY','xai-secret');Deno.env.set('KIVELLE_XAI_ENABLED','true');Deno.env.set('KIVELLE_XAI_EXPLICIT_ENABLED','true');Deno.env.set('KIVELLE_PRIVATE_ADULT_TEXT_MODE','on');}
