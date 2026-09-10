import type {Snapshot,World} from '../types';
import {characterResidentWorld} from './place';
import {featuredCompanionsForWorld,featuredCompanionsMatchingGender,type FeaturedCompanion,type FeaturedGenderFilter} from './featuredCompanions';

export function homeSnapshotForWorld(snapshot:Snapshot,worldId?:string):Snapshot{
 if(!worldId)return snapshot;
 const characters=snapshot.characters.filter(c=>(c.scenario_state?.worldId??characterResidentWorld(snapshot,c)?.id)===worldId);
 const ids=new Set(characters.map(c=>c.id));
 return {...snapshot,characters,conversations:snapshot.conversations.filter(c=>ids.has(c.character_instance_id))};
}
export type HomeFeaturedPick={companion:FeaturedCompanion;world:World};
/** Existing editorial featured/trending ranks, with private, on-device world affinity.
 * Reserve a place for every available world before adding extra preferred-world picks.
 */
export function homeFeaturedCompanions(snapshot:Snapshot,gender:FeaturedGenderFilter,selectedWorldId?:string,activeTemplateId?:string,now=new Date()):HomeFeaturedPick[]{
 const weights=new Map<string,number>();
 if(selectedWorldId)weights.set(selectedWorldId,4);
 if(snapshot.profile?.privacy_settings?.personalization!==false){
  const favorites=new Set(snapshot.favoriteCharacterTemplateIds??[]);
  for(const c of snapshot.characters){
   const world=c.scenario_state?.worldId??characterResidentWorld(snapshot,c)?.id;if(!world)continue;
   const chats=snapshot.conversations.filter(chat=>chat.character_instance_id===c.id&&!chat.archived_at&&chat.kind==='direct');
   const last=Math.max(0,...chats.map(chat=>Date.parse(chat.last_message_at??'')||0));
   const days=Math.max(0,(+now-last)/86400000);
   const turns=snapshot.relationships.find(r=>r.character_instance_id===c.id)?.interaction_turn_count??0;
   const affinity=(last?6/(1+days/7):0)+Math.min(3,Math.log2(1+Math.max(0,turns)))+(favorites.has(c.character_template_id)?2:0);
   weights.set(world,(weights.get(world)??0)+affinity);
  }
 }
 const groups=snapshot.worlds.filter(w=>w.published).map(world=>({world,weight:1+(weights.get(world.id)??0),items:featuredCompanionsMatchingGender(featuredCompanionsForWorld(snapshot,world.id,activeTemplateId),gender),used:0})).filter(g=>g.items.length).sort((a,b)=>b.weight-a.weight||a.world.sort_order-b.world.sort_order||a.world.id.localeCompare(b.world.id));
 const result:HomeFeaturedPick[]=[],seen=new Set<string>(),limit=Math.min(24,Math.max(10,groups.length));
 const take=(group:typeof groups[number])=>{while(group.items.length){const companion=group.items.shift()!;if(seen.has(companion.id))continue;seen.add(companion.id);group.used++;result.push({companion,world:group.world});return true;}return false;};
 for(const group of groups){if(result.length>=limit)break;take(group);}
 while(result.length<limit){const next=groups.filter(g=>g.items.length&&g.used<3).sort((a,b)=>b.weight/(b.used+1)-a.weight/(a.used+1)||a.world.sort_order-b.world.sort_order)[0];if(!next)break;take(next);}
 return result;
}
