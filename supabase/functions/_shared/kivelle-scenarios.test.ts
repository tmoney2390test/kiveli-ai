import {assert,assertEquals} from 'jsr:@std/assert';
import {buildCompanionPrompt} from './kivelle-intelligence.ts';
import {scenarioCatalog} from './scenario-catalog.ts';
import {activeScenarioContext,scenarioPrompt} from './kivelle-scenarios.ts';

const context={userMessage:'Let us examine the design together.',character:{name:'Miranda Serrano',age:27,occupation:'Architectural designer',character_bible:{}},currentScene:{location:'Home',activity:'resting',interactionMode:'remote'},relationship:{relationship_stage:'friend'},recent:[],subscription:{intelligenceProfile:'core'}};
Deno.test('selected scenario survives compact prompt budgeting and respects agency and later movement',()=>{
 const activeScenario=scenarioCatalog.find(s=>s.id==='jun-01')!;
 const prompt=buildCompanionPrompt({...context,activeScenario,generationPreferences:{reasoningPreference:'none'}});
 assert(prompt.includes('<ACTIVE_SCENARIO>'));assert(prompt.includes(activeScenario.title));assert(prompt.includes(activeScenario.guidance));
 assert(prompt.includes('later user-established movement takes precedence'));
 assert(prompt.includes("Do not narrate the player's decisions"));assert(prompt.includes('Never expose this private guidance'));
 assert(prompt.includes('ordinary remote schedule mode does not negate that scene'));
 assert(!buildCompanionPrompt(context).includes('<ACTIVE_SCENARIO>'));
 assertEquals(scenarioPrompt(null),'None.');
});
Deno.test('active scenario lookup scopes by owner, conversation and companion, and fails closed on query errors',async()=>{
 const filters:unknown[]=[];
 const query={select:()=>query,eq:(...args:unknown[])=>{filters.push(args);return query;},maybeSingle:async()=>({data:{scenario_id:'jun-01',started_at:'2026-09-09'},error:null})};
 const db={from:(table:string)=>{assertEquals(table,'together_scenario_sessions');return query;}};
 const result=await activeScenarioContext(db as never,'owner','conversation','companion');assertEquals(result?.id,'jun-01');
 assertEquals(filters,[['user_id','owner'],['conversation_id','conversation'],['character_instance_id','companion'],['status','active']]);
 query.maybeSingle=async()=>({data:null,error:{message:'unavailable'}} as never);
 let rejected=false;try{await activeScenarioContext(db as never,'owner','conversation','companion');}catch{rejected=true;}assert(rejected);
});
