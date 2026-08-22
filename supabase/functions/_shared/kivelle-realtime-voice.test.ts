import { assert } from 'jsr:@std/assert@1';
import { buildKivelleRealtimeInstructions, companionCallGreeting } from './kivelle-realtime-voice.ts';

Deno.test('call greetings use the companion first name with stable natural variations',()=>{
  const greetings=new Set(Array.from({length:20},(_,index)=>companionCallGreeting({character:{name:'Brooke Sullivan'}},`call-${index}`)));
  assert(greetings.has('Hey, this is Brooke.'));
  assert(greetings.size>=4);
  assert([...greetings].every((greeting)=>greeting.includes('Brooke')&&!greeting.includes('Sullivan')));
  assert(companionCallGreeting({character:{}},'missing-name')==="Hey, it's me.");
});

Deno.test('realtime Explicit calls use the shared receptive intimacy policy', () => {
  const instructions = buildKivelleRealtimeInstructions({
    character: { name: 'Brooke', age: 29, spice_level: 3, personality_config: { directness: .8 } },
    relationship: { relationship_stage: 'long_term', romance_enabled: true, romance_path_status: 'open', trust: 80, comfort: 82, attraction: 78, respect: 80, romantic_interest: 74, chemistry_heat: 70 },
    currentScene: { availability: 'available' },
    contentMode: 'explicit',
  });
  assert(instructions.includes('reciprocate clearly and continue as explicit spoken dialogue'));
  assert(instructions.includes('"shouldReciprocate":true'));
  assert(instructions.includes('A voice call remains verbal'));
});

Deno.test('realtime intimacy preserves friends-only boundaries', () => {
  const instructions = buildKivelleRealtimeInstructions({
    character: { name: 'Brooke', age: 29, spice_level: 3 },
    relationship: { relationship_stage: 'long_term', romance_enabled: true, romance_path_status: 'friends_only', trust: 90, comfort: 90, attraction: 90 },
    currentScene: { availability: 'available' },
    contentMode: 'explicit',
  });
  assert(!instructions.includes('reciprocate clearly and continue as explicit spoken dialogue'));
  assert(instructions.includes('"shouldReciprocate":false'));
  assert(instructions.includes('friends_only'));
});

Deno.test('realtime calls inherit the required companion curiosity and reciprocity contract',()=>{
  const instructions=buildKivelleRealtimeInstructions({
    character:{name:'Brooke',age:29,character_bible:{voice:{curiosity:{domains:['art','ambition'],style:'direct_specific',disclosureBeforeQuestion:'sometimes',preferredMoves:{casual:['Notice what the user chose before asking why.']},avoids:['stacked questions']}}}},
    relationship:{relationship_stage:'friend'},currentScene:{availability:'available'},contentMode:'standard',
  });
  assert(instructions.includes('Keep the call reciprocal'));
  assert(instructions.includes('After two substantive companion turns'));
  assert(instructions.includes('"style":"direct_specific"'));
});

Deno.test('realtime calls keep identity and geography inside Kivelle context',()=>{
  const instructions=buildKivelleRealtimeInstructions({
    character:{name:'Brooke',age:29,boundaries:['fictional adult','mutual consent'],character_bible:{fictional:true,background:'American'}},
    relationship:{relationship_stage:'friend'},currentScene:{availability:'available'},
    currentWorld:{name:'Juniper City',timezone:'America/New_York'},contentMode:'standard',
    recentConversation:[{role:'user',content:'Have you ever been to the United States?'}],
  });
  assert(instructions.includes('complete geographic and public-knowledge reality'));
  assert(instructions.includes("A name appearing only in the user's message does not make it known"));
  assert(instructions.includes('Never identify the companion as fictional'));
  assert(!instructions.includes('as the fictional Kivelle companion'));
  assert(!instructions.includes('consenting fictional adult'));
  assert(!instructions.includes('"fictional adult"'));
  assert(!instructions.includes('"fictional":true'));
  assert(!instructions.includes('"background":"American"'));
  assert(!instructions.includes('America/New_York'));
});
