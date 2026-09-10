import {describe,it,expect} from 'vitest';
import type {Snapshot} from '../types';
import {homeFeaturedCompanions,homeSnapshotForWorld} from './homeFeatured';
import {mostRecentHomeConversation} from './homeViewModel';
import {homeChatHref} from './compactHome';
import type {HomeViewModel} from './homeViewModel';
const now=new Date('2026-09-10T12:00:00Z');
function fixture(){
 const worlds=['a','b','c','d'].map((id,sort_order)=>({id,slug:id,name:id,published:true,sort_order}));
 const discoverableCharacters=worlds.flatMap(w=>Array.from({length:5},(_,i)=>({id:`${w.id}${i}`,slug:`${w.id}${i}`,name:`${w.id}${i}`,can_be_selected:true,discovery_metadata:{featured:i===0,gender:i===4?'male':'female'},first_meeting:{world_id:w.id},together_character_versions:{id:`${w.id}${i}-v`,pronouns:i===4?'he/him':'she/her'}})));
 const characters=['a','b'].map(w=>({id:`${w}-instance`,character_template_id:`${w}1`,character_version_id:`${w}1-v`,together_character_templates:discoverableCharacters.find(t=>t.id===`${w}1`)}));
 return {worlds,discoverableCharacters,characters,characterWorldPresence:[],locations:[],profile:{privacy_settings:{}},relationships:[{character_instance_id:'b-instance',interaction_turn_count:100}],favoriteCharacterTemplateIds:['b1'],conversations:[{id:'a-chat',character_instance_id:'a-instance',kind:'direct',last_message_at:'2026-08-01T10:00:00Z'},{id:'b-chat',character_instance_id:'b-instance',kind:'direct',last_message_at:now.toISOString()}]} as unknown as Snapshot;
}
describe('Home world continuation and featured recommendations',()=>{
 it('favors used worlds while representing every eligible world and capping repeats',()=>{
  const s=fixture(),before=JSON.stringify(s),picks=homeFeaturedCompanions(s,'female',undefined,undefined,now);
  expect(picks[0]?.world.id).toBe('b');expect(picks[0]?.companion.id).toBe('b0');expect(new Set(picks.map(p=>p.world.id)).size).toBe(4);expect(picks).toHaveLength(10);expect(picks.filter(p=>p.world.id==='b')).toHaveLength(3);expect(new Set(picks.map(p=>p.companion.id)).size).toBe(10);expect(JSON.stringify(s)).toBe(before);
 });
 it('honors gender and publication filters and leaves out the active hero',()=>{
  const s=fixture();s.worlds[3]!.published=false;s.discoverableCharacters[0]!.lifecycle_status='draft';
  const picks=homeFeaturedCompanions(s,'female','a','a1',now);
  expect(picks.every(p=>p.world.id!=='d'&&p.companion.id!=='a0'&&p.companion.id!=='a1'&&p.companion.discovery_metadata?.gender==='female')).toBe(true);
 });
 it('does not use relationship history when personalization is disabled',()=>{
  const s=fixture();s.profile!.privacy_settings={personalization:false};expect(homeFeaturedCompanions(s,'any',undefined,undefined,now)[0]?.world.id).toBe('a');expect(homeFeaturedCompanions(s,'any','c',undefined,now)[0]?.world.id).toBe('c');
 });
 it('continues the selected world’s chat, never the globally newest chat',()=>{
  const s=fixture(),scoped=homeSnapshotForWorld(s,'a');expect(mostRecentHomeConversation(scoped)?.id).toBe('a-chat');expect(homeSnapshotForWorld(s,'c').conversations).toEqual([]);expect(s.conversations).toHaveLength(2);
 });
 it('keeps a scenario pinned to its matching world and conversation while browsing elsewhere',()=>{
  const s=fixture();s.characters[0]!.scenario_state={worldId:'c',conversationId:'scenario-chat',title:'An invitation'} as NonNullable<typeof s.characters[0]['scenario_state']>;
  expect(homeSnapshotForWorld(s,'a').characters).toHaveLength(0);
  const scoped=homeSnapshotForWorld(s,'c');expect(scoped.characters[0]?.id).toBe('a-instance');
  const model={companion:scoped.characters[0]} as HomeViewModel;
  expect(homeChatHref(scoped,model,true)).toBe('/chat?character=a-instance&conversationId=scenario-chat&plan=1');expect(s.characters[0]!.scenario_state?.conversationId).toBe('scenario-chat');
 });
});
