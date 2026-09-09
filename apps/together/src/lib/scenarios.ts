import {bootstrap,manageConversation,manageScenario,meetCompanion} from './api';
import {quickStartProfile} from './quickStart';
import {useTogether} from '../store/useTogether';
import type {Scenario} from './scenarioCatalog';
import type {Snapshot} from '../types';
import {clearConversationMessageWarmup} from './conversationMessageWarmup';

export type ScenarioSession={id:string;scenario_id:string;conversation_id:string;character_instance_id:string;status:'active'|'paused'|'completed';updated_at:string};
export function scenarioAvailable(scenario:Scenario,snapshot:Snapshot):boolean{
 return snapshot.worlds.some(w=>w.id===scenario.worldId&&w.published)&&
  (!scenario.requiredState||snapshot.discoverableCharacters.some(c=>c.id===scenario.characterTemplateId)||snapshot.characters.some(c=>c.character_template_id===scenario.characterTemplateId));
}
export async function startScenario(scenario:Scenario,onboarding=false,existing?:ScenarioSession):Promise<string>{
 const state=useTogether.getState(),scope=state.snapshot?.activeContinuity?.id;
 if(existing){
  await manageScenario<ScenarioSession>({action:'start',scenarioId:scenario.id,conversationId:existing.conversation_id,characterInstanceId:existing.character_instance_id});
  clearConversationMessageWarmup();
  return `/chat?character=${existing.character_instance_id}&conversationId=${existing.conversation_id}`;
 }
 const next=onboarding?await bootstrap(quickStartProfile(scenario.characterTemplateId,scenario.worldId,{ageConfirmed:true})):await meetCompanion(scenario.characterTemplateId);
 const character=next.characters.find(c=>c.character_template_id===scenario.characterTemplateId);
 if(!character)throw new Error('Your companion could not be opened. Please try again.');
 const {conversation}=await manageConversation<{conversation:{id:string}}>({action:'open',characterInstanceId:character.id});
 await manageScenario<ScenarioSession>({action:'start',scenarioId:scenario.id,conversationId:conversation.id,characterInstanceId:character.id});
 clearConversationMessageWarmup();
 if(scope&&useTogether.getState().snapshot?.activeContinuity?.id!==scope)throw new Error('Your Life changed. Reopen Scenarios in your current Life.');
 state.setSnapshot(next);state.setBrowsedWorldId(scenario.worldId);
 return `/chat?character=${character.id}&conversationId=${conversation.id}`;
}
