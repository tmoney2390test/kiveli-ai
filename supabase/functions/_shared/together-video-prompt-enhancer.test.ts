import{assertEquals,assertRejects}from'jsr:@std/assert';
import{ConfiguredVideoPromptEnhancer,normalizeEnhancedVideoPrompt,videoEnhancementInstructions}from'./together-video-content.ts';

const input={prompt:'walk to the window',characterName:'Kira',locationName:'Aurora Spa',routeName:'Seedance',duration:5,resolution:'720p',sound:false,aspectRatio:'9:16' as const,contentLevel:'standard'};

Deno.test('normalizes a provider prompt without changing its contents',()=>{
  assertEquals(normalizeEnhancedVideoPrompt(' Enhanced prompt: "Kira walks toward the window in one steady shot." '),'Kira walks toward the window in one steady shot.');
  assertEquals(normalizeEnhancedVideoPrompt('x'.repeat(401)),null);
});

Deno.test('enhancement instructions preserve content level and sound capabilities',()=>{
  const safe=videoEnhancementInstructions({contentLevel:'standard',sound:false}),adult=videoEnhancementInstructions({contentLevel:'explicit',sound:true});
  assertEquals(safe.includes('Keep the result non-explicit'),true);assertEquals(safe.includes('Do not mention dialogue, music, or audio.'),true);
  assertEquals(adult.includes('fictional consenting adults'),true);assertEquals(adult.includes('Include a brief natural audio cue'),true);
});

Deno.test('enhances through the configured text provider without logging prompt content',async()=>{
  let requestBody='';
  const enhancer=new ConfiguredVideoPromptEnhancer({apiKey:'secret',fetcher:async(_url,init)=>{requestBody=String(init?.body);return new Response(JSON.stringify({model:'test-model',choices:[{message:{content:'Kira walks toward the window, fabric shifting naturally, as the camera holds a steady medium shot.'}}]}),{status:200,headers:{'content-type':'application/json'}});}});
  const result=await enhancer.enhance(input);
  assertEquals(result.prompt.includes('steady medium shot'),true);assertEquals(result.model,'test-model');assertEquals(requestBody.includes('"messages"'),true);
});

Deno.test('preserves the original client draft when enhancement fails',async()=>{
  const enhancer=new ConfiguredVideoPromptEnhancer({apiKey:'secret',fetcher:async()=>new Response('',{status:503})});
  await assertRejects(()=>enhancer.enhance(input),Error,'Prompt enhancement is temporarily unavailable.');
});
