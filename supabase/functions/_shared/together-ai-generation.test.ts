import { assertEquals } from 'jsr:@std/assert';
import { executeResponsesWithTemperatureFallback,geminiDialogueRequestBody,isUnsupportedServiceTierResponse,openAIDialogueModel,openAIFastServiceTier,xaiDialogueModel } from './together-ai.ts';

Deno.test('temperature compatibility retry removes only temperature and runs once',async()=>{
  const bodies:Record<string,unknown>[]=[];
  const fetchImpl=(async(_input:RequestInfo|URL,init?:RequestInit)=>{
    bodies.push(JSON.parse(String(init?.body)));
    return bodies.length===1
      ?new Response(JSON.stringify({error:{message:'temperature is not supported with this model'}}),{status:400})
      :new Response(JSON.stringify({output_text:'hello'}),{status:200});
  }) as typeof fetch;
  const options={route:{provider:'openai'},unsupportedTemperatureFallback:false} as never;
  const response=await executeResponsesWithTemperatureFallback(fetchImpl,'openai','secret',{model:'test',temperature:.85,reasoning:{effort:'low'}},options);
  assertEquals(response.status,200);
  assertEquals(bodies.length,2);
  assertEquals(bodies[0]?.temperature,.85);
  assertEquals('temperature' in (bodies[1]??{}),false);
  assertEquals((options as {unsupportedTemperatureFallback:boolean}).unsupportedTemperatureFallback,true);
});

Deno.test('other provider validation failures are not retried',async()=>{
  let calls=0;
  const fetchImpl=(async()=>{calls+=1;return new Response(JSON.stringify({error:{message:'invalid request'}}),{status:400});}) as typeof fetch;
  const response=await executeResponsesWithTemperatureFallback(fetchImpl,'xai','secret',{temperature:1},{} as never);
  assertEquals(response.status,400);
  assertEquals(calls,1);
});

Deno.test('premium delivery stays opt-in and falls back safely when unavailable',async()=>{
  assertEquals(openAIFastServiceTier(undefined),undefined);
  assertEquals(openAIFastServiceTier('fast'),'fast');
  assertEquals(openAIFastServiceTier('priority'),'priority');
  assertEquals(openAIFastServiceTier('off'),undefined);
  assertEquals(isUnsupportedServiceTierResponse(403,{error:{message:'Fast mode access is unavailable'}}),true);
  const bodies:Record<string,unknown>[]=[];
  const fetchImpl=(async(_input:RequestInfo|URL,init?:RequestInit)=>{
    bodies.push(JSON.parse(String(init?.body)));
    return bodies.length===1
      ?new Response(JSON.stringify({error:{message:'service_tier fast is not available for this project'}}),{status:403})
      :new Response(JSON.stringify({output_text:'hello'}),{status:200});
  }) as typeof fetch;
  const options={route:{provider:'openai'},serviceTierFallback:false} as never;
  const response=await executeResponsesWithTemperatureFallback(fetchImpl,'openai','secret',{model:'test',service_tier:'fast'},options);
  assertEquals(response.status,200);
  assertEquals(bodies.length,2);
  assertEquals(bodies[0]?.service_tier,'fast');
  assertEquals('service_tier' in (bodies[1]??{}),false);
  assertEquals((options as {serviceTierFallback:boolean}).serviceTierFallback,true);
});

Deno.test('Fast reasoning selects the cheaper lightweight dialogue model',()=>{
  assertEquals(openAIDialogueModel({generationPreferences:{reasoningPreference:'none'}} as never),'gpt-4.1-nano');
});

Deno.test('Fast Grok uses the dedicated model seam and safely defaults to Grok 4.3',()=>{
  const previousStandard=Deno.env.get('KIVELLE_XAI_DIALOGUE_MODEL');
  const previousFast=Deno.env.get('KIVELLE_XAI_FAST_DIALOGUE_MODEL');
  try{
    Deno.env.delete('KIVELLE_XAI_DIALOGUE_MODEL');
    Deno.env.delete('KIVELLE_XAI_FAST_DIALOGUE_MODEL');
    assertEquals(xaiDialogueModel({generationPreferences:{reasoningPreference:'none'}} as never),'grok-4.3');
    Deno.env.set('KIVELLE_XAI_DIALOGUE_MODEL','grok-standard-test');
    Deno.env.set('KIVELLE_XAI_FAST_DIALOGUE_MODEL','grok-fast-test');
    assertEquals(xaiDialogueModel({generationPreferences:{reasoningPreference:'none'}} as never),'grok-fast-test');
    assertEquals(xaiDialogueModel({generationPreferences:{reasoningPreference:'low'}} as never),'grok-standard-test');
  }finally{
    if(previousStandard===undefined)Deno.env.delete('KIVELLE_XAI_DIALOGUE_MODEL');else Deno.env.set('KIVELLE_XAI_DIALOGUE_MODEL',previousStandard);
    if(previousFast===undefined)Deno.env.delete('KIVELLE_XAI_FAST_DIALOGUE_MODEL');else Deno.env.set('KIVELLE_XAI_FAST_DIALOGUE_MODEL',previousFast);
  }
});

Deno.test('Gemini fallback applies dynamism, group hierarchy, reasoning, and visible budget',()=>{
  const context={
    userMessage:'Help us work through this together.',conversationStyle:'texting',chatLanguage:'en',
    character:{name:'Mara',age:30,personality_config:{traits:['warm']},communication_style:{}},
    persona:{},relationship:{conflict:30},generationPreferences:{chatDynamism:100,reasoningPreference:'high'},
    subscription:{tier:'kivelle_max'},interactionQuality:'major_relationship_event',responseBrief:{mode:'repair'},director:{used:false},
    memoryContext:{silent:[],callbacks:[],directRecall:[],callbackAllowance:0},memories:[],openThreads:[],sharedPlans:[],commitments:[],
    dates:{active:null,upcoming:[],unlocked:[],recentCompleted:[]},planningCatalog:[],social:[],worldPulse:[],knownLifeEvents:[],recentEpisodes:[],
    currentScene:{location:'Home',activity:'Talking',mood:'calm',energy:'steady',availability:'open',interactionMode:'remote',sceneBehavior:{}},
    clock:{},experienceCapabilities:{},relationshipStance:{},characterGoals:{},characterUserView:{},characterVoice:{},antiRepetition:[],
  } as never;
  const options={
    route:{provider:'gemini',requestedMode:'standard',resolvedMode:'standard',reason:'provider_fallback',explicit:false,adultEligible:false,hardBlocked:false,classification:'safe'},
    chatGenerationControlsMode:'on',generationContext:{mode:'group',speakerRole:'secondary',activeSpeakerCount:3},
  } as never;
  const body=geminiDialogueRequestBody(context,options,'gemini-2.5-flash') as {contents:Array<{parts:Array<{text:string}>}>;generationConfig:Record<string,unknown>};
  assertEquals(body.generationConfig.temperature,1.15);
  assertEquals(body.generationConfig.thinkingConfig,{thinkingBudget:2048,includeThoughts:false});
  assertEquals(body.generationConfig.maxOutputTokens,1324);
  assertEquals(body.contents[0]?.parts[0]?.text.includes('<CHAT_DYNAMISM>'),true);
  assertEquals(body.contents[0]?.parts[0]?.text.includes('Do not make the participants sound alike.'),true);
});
