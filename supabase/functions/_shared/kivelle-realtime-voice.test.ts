import { assert } from 'jsr:@std/assert@1';
import { buildKivelleRealtimeInstructions, companionCallGreeting } from './kivelle-realtime-voice.ts';

Deno.test('call greetings use the companion first name with stable natural variations',()=>{
  const greetings=new Set(Array.from({length:20},(_,index)=>companionCallGreeting({character:{name:'Brooke Sullivan'}},`call-${index}`)));
  assert(greetings.has('Hey, this is Brooke.'));
  assert(greetings.size>=4);
  assert([...greetings].every((greeting)=>greeting.includes('Brooke')&&!greeting.includes('Sullivan')));
  assert(companionCallGreeting({character:{}},'missing-name')==="Hey, it's me.");
});

Deno.test('call greetings and instructions honor the selected chat language',()=>{
  assert(companionCallGreeting({character:{name:'Brooke Sullivan'},chatLanguage:'fr'},'call-fr').includes('Brooke'));
  assert(companionCallGreeting({character:{name:'Brooke Sullivan'},chatLanguage:'auto',recent:[{role:'user',content:'今日はどうだった？'}]},'call-ja').includes('Brooke'));
  assert(/[。、]/u.test(companionCallGreeting({character:{name:'Brooke Sullivan'},chatLanguage:'auto',recent:[{role:'user',content:'今日はどうだった？'}]},'call-ja')));
  const instructions=buildKivelleRealtimeInstructions({character:{name:'Brooke',age:29},relationship:{relationship_stage:'friend'},currentScene:{availability:'available'},contentMode:'standard',chatLanguage:'fr'});
  assert(instructions.includes('Reply in French'));
  assert(instructions.includes('"chatLanguage":"fr"'));
});

Deno.test('realtime calls keep a receptive romantic stance non-sexual', () => {
  const instructions = buildKivelleRealtimeInstructions({
    character: { name: 'Brooke', age: 29, spice_level: 3, personality_config: { directness: .8 } },
    relationship: { relationship_stage: 'long_term', romance_enabled: true, romance_path_status: 'open', trust: 80, comfort: 82, attraction: 78, respect: 80, romantic_interest: 74, chemistry_heat: 70 },
    currentScene: { availability: 'available' },
    contentMode: 'explicit',
  });
  assert(instructions.includes('sexual or explicit spoken dialogue is not'));
  assert(instructions.includes('must not describe sexual acts'));
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
    character:{name:'Brooke',age:29,pronouns:'she/her',occupation:'Gallery coordinator',biography:'Direct, observant, and ambitious.',interests:['art','climbing'],character_bible:{voice:{curiosity:{domains:['art','ambition'],style:'direct_specific',disclosureBeforeQuestion:'sometimes',preferredMoves:{casual:['Notice what the user chose before asking why.']},avoids:['stacked questions']}}}},
    relationship:{relationship_stage:'friend'},currentScene:{availability:'available'},contentMode:'standard',
  });
  assert(instructions.includes('Keep the call reciprocal'));
  assert(instructions.includes('After two substantive companion turns'));
  assert(instructions.includes('"style":"direct_specific"'));
  assert(instructions.includes('"age":29'));
  assert(instructions.includes('"pronouns":"she/her"'));
  assert(instructions.includes('"occupation":"Gallery coordinator"'));
  assert(instructions.includes('"interests":["art","climbing"]'));
});

Deno.test('realtime calls receive the same complete active Persona as text chat',()=>{
  const instructions=buildKivelleRealtimeInstructions({character:{name:'Brooke',age:29},persona:{display_name:'Jordan',pronouns:'they/them',age:41,occupation:'Architect',biography:'Restores old buildings.',interests:['design','travel'],communication_config:{responseLength:'detailed',questionFrequency:'high',tone:'direct'}},relationship:{relationship_stage:'friend'},currentScene:{availability:'available'},contentMode:'standard'});
  assert(instructions.includes('"display_name":"Jordan"'));
  assert(instructions.includes('"age":41'));
  assert(instructions.includes('"occupation":"Architect"'));
  assert(instructions.includes('"biography":"Restores old buildings."'));
  assert(instructions.includes('"responseLength":"detailed"'));
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
