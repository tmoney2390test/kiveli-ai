import { describe, expect, it } from 'vitest';
import { buildExploreContext, locationsForExploreCategory } from './explore';
import type { CharacterInstance, Snapshot } from '../types';

const companion={
  id:'maya-instance',character_template_id:'maya-template',character_version_id:'maya-v1',relationship_stage:'dating',current_mood:'playful',current_activity:'Editing photos',current_location_id:'studio',current_energy:'medium',contact_added_at:'2026-08-01T00:00:00Z',introduced_at:'2026-08-01T00:00:00Z',met_at:'2026-08-01T00:00:00Z',last_simulated_at:'2026-08-16T12:00:00Z',user_id:'user',
  together_character_templates:{id:'maya-template',name:'Maya',slug:'maya',age:26,occupation:'Photographer',biography:'Photographer'},
  together_character_versions:{id:'maya-v1',portrait_asset_key:'maya',interests:['music','coffee'],personality_config:{playful:.8}},
} as unknown as CharacterInstance;

const snapshot={
  profile:{display_name:'Tim',interests:['books'],experience_goals:[],memory_categories:{}},
  worlds:[{id:'vesper',slug:'vesper-city',name:'Vesper City',description:'City',access_type:'free',timezone:'America/New_York',sort_order:1,featured:true,published:true,visual_context:{},metadata:{}}],
  locations:[
    {id:'studio',world_id:'vesper',name:'Studio',slug:'studio',location_type:'venue',description:'Work',category:'work',possible_activities:['editing'],metadata:{}},
    {id:'velvet',world_id:'vesper',name:'Velvet Hour',slug:'velvet-hour',location_type:'venue',description:'Cocktail lounge',category:'lounge',hours:{open:'17:00',close:'01:00'},possible_activities:['cocktails','music'],metadata:{tags:['nightlife','romantic']}},
    {id:'paper',world_id:'vesper',name:'Paper Trail',slug:'paper-trail',location_type:'venue',description:'Bookstore',category:'bookstore',hours:{open:'09:00',close:'21:00'},possible_activities:['books','coffee'],metadata:{tags:['quiet','books']}},
    {id:'other',world_id:'other-world',name:'Other Place',slug:'other-place',location_type:'venue',description:'Other',category:'cafe',possible_activities:['coffee'],metadata:{}},
  ],
  characters:[companion],discoverableCharacters:[],memories:[],sharedPlans:[],lifeEvents:[],
} as unknown as Snapshot;

describe('Explore view model',()=>{
  it('keeps Explore scoped to the browsed world and removes private/work locations',()=>{
    const result=buildExploreContext(snapshot,companion,'vesper');
    expect(result.locations.map((item)=>item.id)).toEqual(expect.arrayContaining(['velvet','paper']));
    expect(result.locations.map((item)=>item.id)).not.toContain('studio');
    expect(result.locations.map((item)=>item.id)).not.toContain('other');
  });

  it('builds useful place categories from canonical location metadata',()=>{
    const result=buildExploreContext(snapshot,companion,'vesper');
    expect(result.categories.map((item)=>item.id)).toEqual(expect.arrayContaining(['coffee','nightlife','quiet']));
    expect(locationsForExploreCategory(result.locations,'nightlife').map((item)=>item.id)).toContain('velvet');
    expect(locationsForExploreCategory(result.locations,'quiet').map((item)=>item.id)).toContain('paper');
  });

  it('deduplicates personalized recommendation cards',()=>{
    const result=buildExploreContext(snapshot,companion,'vesper');
    expect(new Set(result.recommendations.map((item)=>item.option.id)).size).toBe(result.recommendations.length);
  });
});
