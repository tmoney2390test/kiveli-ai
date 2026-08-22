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
  worlds:[{id:'neon',slug:'neon-kyo',name:'Neon Kyo',description:'City',access_type:'subscription',timezone:'Asia/Tokyo',sort_order:80,featured:true,published:true,visual_context:{},metadata:{}}],
  locations:[
    {id:'studio',world_id:'neon',name:'Studio',slug:'studio',location_type:'venue',description:'Work',category:'work',possible_activities:['editing'],metadata:{}},
    {id:'velvet',world_id:'neon',name:'Velvet Static',slug:'velvet-static',location_type:'venue',description:'Nightclub',category:'nightlife',hours:{open:'21:00',close:'05:00'},possible_activities:['cocktails','music'],metadata:{tags:['nightlife','romantic']}},
    {id:'paper',world_id:'neon',name:'Kissaten 88',slug:'kissaten-88',location_type:'venue',description:'Cafe',category:'cafe',hours:{open:'07:00',close:'03:00'},possible_activities:['books','coffee'],metadata:{tags:['quiet','books']}},
    {id:'hotel',world_id:'neon',name:'Moonlight Inn',slug:'moonlight-inn',location_type:'residence',description:'A small inn',category:'hotel',hours:{open:'00:00',close:'23:59'},possible_activities:['stay'],metadata:{tags:['lodging']}},
    {id:'district',world_id:'neon',name:'Hikari Core',slug:'hikari-core',location_type:'district',description:'District',category:'district',possible_activities:['walk'],metadata:{}},
    {id:'station',world_id:'neon',name:'Central Station',slug:'central-station',location_type:'transit',description:'Station',category:'transit',possible_activities:['train'],metadata:{}},
    {id:'other',world_id:'other-world',name:'Other Place',slug:'other-place',location_type:'venue',description:'Other',category:'cafe',possible_activities:['coffee'],metadata:{}},
  ],
  characters:[companion],discoverableCharacters:[],memories:[],sharedPlans:[],lifeEvents:[],
} as unknown as Snapshot;

describe('Explore view model',()=>{
  it('keeps Explore scoped to the browsed world and removes private/work locations',()=>{
    const result=buildExploreContext(snapshot,companion,'neon');
    expect(result.locations.map((item)=>item.id)).toEqual(expect.arrayContaining(['velvet','paper']));
    expect(result.locations.map((item)=>item.id)).not.toContain('studio');
    expect(result.locations.map((item)=>item.id)).not.toContain('district');
    expect(result.locations.map((item)=>item.id)).toContain('station');
    expect(result.locations.map((item)=>item.id)).not.toContain('other');
  });

  it('shows only canonical residents in People in World, excluding visitors',()=>{
    const scoped={
      ...snapshot,
      discoverableCharacters:[
        {id:'kyo-template',name:'Kyo Resident',slug:'kyo-resident',age:28,occupation:'Designer',biography:'',can_be_selected:true,lifecycle_status:'published',together_character_versions:{id:'kyo-version',portrait_asset_key:'kyo-resident',interests:[],personality_config:{}}},
        {id:'visitor-template',name:'Juniper Visitor',slug:'juniper-visitor',age:29,occupation:'Writer',biography:'',can_be_selected:true,lifecycle_status:'published',together_character_versions:{id:'visitor-version',portrait_asset_key:'juniper-visitor',interests:[],personality_config:{}}},
      ],
      characterWorldPresence:[
        {id:'kyo-home',character_version_id:'kyo-version',world_id:'neon',presence_type:'resident',familiarity:1,visited_count:1,metadata:{}},
        {id:'visitor-home',character_version_id:'visitor-version',world_id:'other-world',presence_type:'resident',familiarity:1,visited_count:1,metadata:{}},
        {id:'visitor-trip',character_version_id:'visitor-version',world_id:'neon',presence_type:'visitor',familiarity:.4,visited_count:1,metadata:{}},
      ],
    } as unknown as Snapshot;
    const people=buildExploreContext(scoped,companion,'neon').people;
    expect(people.map((person)=>person.name)).toEqual(['Kyo Resident']);
    expect(people[0]?.together_character_versions.portrait_asset_key).toBe('kyo-resident');
  });

  it('builds useful place categories from canonical location metadata',()=>{
    const result=buildExploreContext(snapshot,companion,'neon');
    expect(result.categories.map((item)=>item.id)).toEqual(expect.arrayContaining(['food','nightlife','lodging','quiet']));
    expect(locationsForExploreCategory(result.locations,'food').map((item)=>item.id)).toContain('paper');
    expect(locationsForExploreCategory(result.locations,'nightlife').map((item)=>item.id)).toContain('velvet');
    expect(locationsForExploreCategory(result.locations,'lodging').map((item)=>item.id)).toEqual(['hotel']);
    expect(locationsForExploreCategory(result.locations,'quiet').map((item)=>item.id)).toContain('paper');
  });

  it('deduplicates personalized recommendation cards',()=>{
    const result=buildExploreContext(snapshot,companion,'neon');
    expect(new Set(result.recommendations.map((item)=>item.option.id)).size).toBe(result.recommendations.length);
  });
});
