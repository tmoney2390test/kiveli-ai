import { describe, expect, it } from 'vitest';
import type { CharacterInstance, Snapshot } from '../types';
import { planningCompanionsForWorld } from './planningCompanions';

function companion(id: string, name: string, versionId: string): CharacterInstance {
  return {id,user_id:'user',character_template_id:`${id}-template`,character_version_id:versionId,relationship_stage:'acquaintance',current_mood:'calm',current_activity:'relaxing',current_location_id:null,current_energy:'medium',contact_added_at:'2026-08-01T12:00:00Z',introduced_at:'2026-08-01T12:00:00Z',met_at:'2026-08-01T12:00:00Z',last_simulated_at:'2026-08-01T12:00:00Z',together_character_templates:{id:`${id}-template`,name,slug:id,age:26,occupation:'Artist',biography:'',can_be_selected:true,lifecycle_status:'published'},together_character_versions:{id:versionId,portrait_asset_key:id,interests:[],personality_config:{}}};
}

describe('planning companions', () => {
  it('keeps only known residents of the selected world and orders them by recent conversation', () => {
    const becka=companion('becka','Becka','becka-version');
    const brooke=companion('brooke','Brooke','brooke-version');
    const chloe=companion('chloe','Chloe','chloe-version');
    const snapshot={
      characters:[becka,brooke,chloe],
      conversations:[
        {id:'becka-chat',character_instance_id:becka.id,kind:'direct',title:null,last_message_at:'2026-08-20T12:00:00Z'},
        {id:'brooke-chat',character_instance_id:brooke.id,kind:'direct',title:null,last_message_at:'2026-08-21T12:00:00Z',archived_at:'2026-08-22T08:00:00Z'},
        {id:'chloe-chat',character_instance_id:chloe.id,kind:'direct',title:null,last_message_at:'2026-08-22T12:00:00Z'},
      ],
      worlds:[{id:'juniper',slug:'juniper-city',name:'Juniper City'},{id:'vervelle',slug:'port-vervelle',name:'Port Vervelle'}],
      locations:[],discoverableCharacters:[],
      characterWorldPresence:[
        {id:'becka-home',character_version_id:becka.character_version_id,world_id:'juniper',presence_type:'resident'},
        {id:'brooke-home',character_version_id:brooke.character_version_id,world_id:'juniper',presence_type:'resident'},
        {id:'chloe-home',character_version_id:chloe.character_version_id,world_id:'vervelle',presence_type:'resident'},
      ],
    } as unknown as Snapshot;

    expect(planningCompanionsForWorld(snapshot,'juniper').map((item)=>item.id)).toEqual(['brooke','becka']);
  });

  it('does not expose instantiated strangers without a conversation or introduction', () => {
    const known=companion('known','Known','known-version');
    const stranger={...companion('stranger','Stranger','stranger-version'),contact_added_at:null,introduced_at:null};
    const snapshot={characters:[known,stranger],conversations:[],worlds:[{id:'juniper',slug:'juniper-city',name:'Juniper City'}],locations:[],discoverableCharacters:[],characterWorldPresence:[{id:'known-home',character_version_id:known.character_version_id,world_id:'juniper',presence_type:'resident'},{id:'stranger-home',character_version_id:stranger.character_version_id,world_id:'juniper',presence_type:'resident'}]} as unknown as Snapshot;
    expect(planningCompanionsForWorld(snapshot,'juniper').map((item)=>item.id)).toEqual(['known']);
  });
});
