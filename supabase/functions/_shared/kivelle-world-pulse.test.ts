import{assertEquals}from'jsr:@std/assert@1';
import type{SupabaseClient}from'@supabase/supabase-js';
import{WORLD_PULSE_EVENT_SELECT,loadAroundTown,worldPulseCharactersBySlug}from'./kivelle-world-pulse.ts';

Deno.test('world pulse scopes introduced characters by their current location world',()=>{
  const characters=[
    {id:'local',together_character_templates:{slug:'local-character',name:'Local Character'},together_locations:{world_id:'world-a'}},
    {id:'visitor',together_character_templates:[{slug:'visiting-character',name:'Visiting Character'}],together_locations:[{world_id:'world-a'}]},
    {id:'elsewhere',together_character_templates:{slug:'elsewhere-character',name:'Elsewhere Character'},together_locations:{world_id:'world-b'}},
    {id:'unplaced',together_character_templates:{slug:'unplaced-character',name:'Unplaced Character'},together_locations:null},
  ];
  const indexed=worldPulseCharactersBySlug(characters,'world-a');
  assertEquals([...indexed.keys()],['local-character','visiting-character']);
  assertEquals(indexed.get('local-character')?.template?.name,'Local Character');
});

Deno.test('world pulse disambiguates the public event location relationship',()=>{
  assertEquals(WORLD_PULSE_EVENT_SELECT.includes('together_locations!together_world_event_instances_location_id_fkey(name,slug)'),true);
  assertEquals(WORLD_PULSE_EVENT_SELECT.includes('together_locations(name,slug)'),false);
});

Deno.test('home reads an already materialized pulse without rewriting it and derives its current status',async()=>{
  const now=new Date('2026-09-29T12:00:00Z');
  const event={id:'event',template_id:'template',world_id:'world',location_id:null,district_location_id:null,
    starts_at:'2026-09-29T11:00:00Z',ends_at:'2026-09-29T13:00:00Z',status:'scheduled',simulation_key:'world-pulse-v1:template:2026-09-29',
    public_summary:'A gathering is underway.',metadata:{},together_world_event_templates:{title:'The gathering',event_type:'community',knowledge_scope:'public',significance:.7},together_world_event_participants:[]};
  let materializationReads=0;
  const db={from:(table:string)=>{
    if(table!=='together_world_event_instances')materializationReads++;
    return{select:(columns:string)=>{
      const query:Record<string,unknown>={};
      for(const method of ['eq','neq','gte','lte','order','like'])query[method]=()=>query;
      query.limit=async()=>({data:columns==='id'?[{id:'event'}]:[event],error:null});
      return query;
    }};
  }} as unknown as SupabaseClient;
  const pulse=await loadAroundTown({db,userId:'user',continuityId:'life',worldId:'world',timezone:'UTC',now});
  assertEquals(pulse.events[0]?.status,'active');
  assertEquals(pulse.items[0]?.kind,'happening_now');
  assertEquals(materializationReads,0);
});
