import{assertEquals}from'jsr:@std/assert@1';
import{WORLD_PULSE_EVENT_SELECT,worldPulseCharactersBySlug}from'./kivelle-world-pulse.ts';

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
