import {assert} from 'jsr:@std/assert';
import {buildCompanionPrompt,KIVELLE_HIGH_STAKES_STORY_RULES,KIVELLE_STORY_IMPROVISATION_RULES} from './kivelle-intelligence.ts';

const baseContext={
  userMessage:'Any luck?',
  queryIntent:'general',
  character:{name:'Elena',age:34,occupation:'Spa director',character_bible:{}},
  currentScene:{location:'Aurora Spa',activity:'running the floor',interactionMode:'remote'},
  relationship:{relationship_stage:'friend'},
  recent:[
    {role:'user',content:'Please check with billing about my massage.'},
    {role:'assistant',content:'I will ask when the floor settles.'},
  ],
  memoryContext:{silent:[],callbacks:[],directRecall:[],callbackAllowance:0},
  subscription:{intelligenceProfile:'core'},
};

Deno.test('companion prompt allows low-stakes fictional off-screen progress',()=>{
  const prompt=buildCompanionPrompt(baseContext);
  assert(prompt.includes('natural story progression is not dishonesty'));
  assert(prompt.includes('speak with an unnamed coworker'));
  assert(prompt.includes('advance that thread instead of repeatedly saying nothing happened'));
  assert(!prompt.includes('Never contradict or invent events, dates, plans, locations'));
});

Deno.test('story improvisation cannot forge user actions or structured and real-world state',()=>{
  assert(KIVELLE_STORY_IMPROVISATION_RULES.includes("Never invent the user's words, decisions, attendance, consent, or physical actions."));
  assert(KIVELLE_STORY_IMPROVISATION_RULES.includes('never mutate structured Kivelle state'));
  assert(KIVELLE_STORY_IMPROVISATION_RULES.includes('real insurers'));
  assert(KIVELLE_STORY_IMPROVISATION_RULES.includes('without requesting sensitive identifiers'));
});

Deno.test('high-stakes fictional decisions remain possible but earned and persistent',()=>{
  assert(KIVELLE_HIGH_STAKES_STORY_RULES.includes('A ruler may march an army'));
  assert(KIVELLE_HIGH_STAKES_STORY_RULES.includes("does not control another character's will"));
  assert(KIVELLE_HIGH_STAKES_STORY_RULES.includes('canonical world turning point'));
  const prompt=buildCompanionPrompt({...baseContext,userMessage:'March the army to war.',character:{...baseContext.character,occupation:'Queen of the Cinder Crown',biography:'She commands the royal host.'},relationship:{relationship_stage:'friend',trust:65,respect:70},place:{path:'Vharadren → Cinder Court',world:{id:'world-vharadren',name:'Vharadren',description:'A realm of rival crowns.'},clock:{weekday:'Oathday',localTime:'20:00'},location:{id:'cinder-court',name:'Cinder Court',description:'The seat of the Cinder Crown.',possibleActivities:[]}}});
  assert(prompt.includes('eligible for a world military decision'));
});
