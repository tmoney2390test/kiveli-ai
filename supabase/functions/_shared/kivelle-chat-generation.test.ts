import { assertEquals } from 'jsr:@std/assert';
import { chatGenerationControlsMode,dialogueReasoningSignals,resolveDialogueRunGenerationProfile } from './kivelle-chat-generation.ts';

const context=(overrides:Record<string,unknown>={})=>({
  userMessage:'hello',interactionQuality:'normal',relationship:{conflict:0},responseBrief:{mode:'casual'},memoryContext:{directRecall:[],callbacks:[]},openThreads:[],queryIntent:'general',director:{used:false},conversationStyle:'texting',generationPreferences:{chatDynamism:50,reasoningPreference:'auto'},subscription:{tier:'kivelle_max'},...overrides,
} as never);

Deno.test('generation-control mode fails closed',()=>{
  assertEquals(chatGenerationControlsMode(undefined),'off');
  assertEquals(chatGenerationControlsMode('invalid'),'off');
  assertEquals(chatGenerationControlsMode('shadow'),'shadow');
  assertEquals(chatGenerationControlsMode('on'),'on');
});

Deno.test('signals keep greetings light and recognize complex turns',()=>{
  assertEquals(dialogueReasoningSignals(context()).isGreetingOrAcknowledgement,true);
  const signals=dialogueReasoningSignals(context({userMessage:'I am sorry. Can we work through what happened?',interactionQuality:'major_relationship_event',relationship:{conflict:60},director:{used:true}}),3);
  assertEquals(signals.hasActiveConflict,true);
  assertEquals(signals.hasRepairOpportunity,true);
  assertEquals(signals.interactionQuality,'critical');
  assertEquals(signals.activeSpeakerCount,3);
});

Deno.test('run profile preserves group speaker hierarchy and independent style budget',()=>{
  const primary=resolveDialogueRunGenerationProfile({context:context({userMessage:'Let us resolve this together',interactionQuality:'major_relationship_event',conversationStyle:'paragraph'}),provider:'xai',model:'grok-4.3',generationContext:{mode:'group',speakerRole:'primary',activeSpeakerCount:3}});
  const secondary=resolveDialogueRunGenerationProfile({context:context({userMessage:'Let us resolve this together',interactionQuality:'major_relationship_event',conversationStyle:'paragraph'}),provider:'xai',model:'grok-4.3',generationContext:{mode:'group',speakerRole:'secondary',activeSpeakerCount:3}});
  assertEquals(primary.effectiveReasoning,'medium');
  assertEquals(secondary.effectiveReasoning,'low');
  assertEquals(primary.visibleTokenBudget,secondary.visibleTokenBudget);
});

Deno.test('main dialogue preferences remain independent from Director reasoning configuration',()=>{
  const prior=Deno.env.get('KIVELLE_DIRECTOR_REASONING_EFFORT');
  try{
    Deno.env.set('KIVELLE_DIRECTOR_REASONING_EFFORT','none');
    const first=resolveDialogueRunGenerationProfile({context:context({generationPreferences:{chatDynamism:75,reasoningPreference:'medium'}}),provider:'xai',model:'grok-4.3'});
    Deno.env.set('KIVELLE_DIRECTOR_REASONING_EFFORT','high');
    const second=resolveDialogueRunGenerationProfile({context:context({generationPreferences:{chatDynamism:75,reasoningPreference:'medium'}}),provider:'xai',model:'grok-4.3'});
    assertEquals(first,second);
  }finally{if(prior===undefined)Deno.env.delete('KIVELLE_DIRECTOR_REASONING_EFFORT');else Deno.env.set('KIVELLE_DIRECTOR_REASONING_EFFORT',prior);}
});
