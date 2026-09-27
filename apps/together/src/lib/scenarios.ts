import {bootstrap,manageConversation,manageScenario,meetCompanion} from './api';
import {quickStartProfile} from './quickStart';
import {useTogether} from '../store/useTogether';
import type {Scenario} from './scenarioCatalog';
import type {Snapshot} from '../types';
import {clearConversationMessageWarmup} from './conversationMessageWarmup';
import {canAccessWorld} from './place';
export type ScenarioSession={id:string;scenario_id:string;conversation_id:string;character_instance_id:string;status:'active'|'paused'|'completed';updated_at:string;revision:number;current_location_id?:string;chapter?:{index:number;title:string;count:number;arcTitle:string}|null;story_progress?:{chapterIndex:number;checkpoints:Array<{chapterIndex:number;note:string;savedAt:string;locationId:string}>}};
export function scenarioAvailable(scenario:Scenario,snapshot:Snapshot):boolean{
 const world=snapshot.worlds.find(w=>w.id===scenario.worldId);
 return Boolean(world?.published&&canAccessWorld(snapshot,world))&&(!scenario.requiredState||snapshot.discoverableCharacters.some(c=>c.id===scenario.characterTemplateId)||snapshot.characters.some(c=>c.character_template_id===scenario.characterTemplateId));
}
export async function startScenario(scenario:Scenario,onboarding=false,existing?:ScenarioSession):Promise<string>{
 const state=useTogether.getState(),scope=state.snapshot?.activeContinuity?.id;
 const assertScope=()=>{if(scope&&useTogether.getState().snapshot?.activeContinuity?.id!==scope)throw new Error('Your Life changed. Reopen Scenarios in your current Life.');};
 let characterId=existing?.character_instance_id,conversationId=existing?.conversation_id;
 if(!existing){
  const next=onboarding?await bootstrap(quickStartProfile(scenario.characterTemplateId,scenario.worldId,{ageConfirmed:true})):await meetCompanion(scenario.characterTemplateId);
  assertScope();state.setSnapshot(next);
  const character=next.characters.find(c=>c.character_template_id===scenario.characterTemplateId);
  if(!character)throw new Error('Your companion could not be opened. Please try again.');
  characterId=character.id;
  const {conversation}=await manageConversation<{conversation:{id:string}}>({action:'open',characterInstanceId:character.id});
  conversationId=conversation.id;
 }
 assertScope();
 const continuityId=useTogether.getState().snapshot?.activeContinuity?.id;
 if(!continuityId)throw new Error('Your Life could not be loaded. Please try again.');
 await manageScenario<ScenarioSession>({action:'start',scenarioId:scenario.id,conversationId,characterInstanceId:characterId,continuityId});
 assertScope();clearConversationMessageWarmup();state.setBrowsedWorldId(scenario.worldId);
 await state.refresh({force:true});assertScope();
 return `/chat?character=${characterId}&conversationId=${conversationId}`;
}
