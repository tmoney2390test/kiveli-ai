import{isFictionalCompanion,MEDIA_OFFER_COMPANION_SELECT}from'./together-media-character.ts';

function assertEquals(actual:unknown,expected:unknown,message:string){if(actual!==expected)throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);}

Deno.test('authored companions default to fictional',()=>{
  assertEquals(isFictionalCompanion({discovery_metadata:{}},{visual_identity:{},character_bible:{}}),true,'implicit fictional companion');
});

Deno.test('media offers request only canonical character schema columns',()=>{
  assertEquals(MEDIA_OFFER_COMPANION_SELECT.includes('together_character_templates(name,age,discovery_metadata)'),true,'template select');
  assertEquals(MEDIA_OFFER_COMPANION_SELECT.includes('together_character_versions(visual_identity,character_bible)'),true,'version select');
  assertEquals(MEDIA_OFFER_COMPANION_SELECT.includes('templates(name,age,metadata)'),false,'removed nonexistent metadata column');
});

Deno.test('a canonical non-fictional flag blocks media eligibility',()=>{
  assertEquals(isFictionalCompanion({discovery_metadata:{fictional:false}},{visual_identity:{fictional:true}}),false,'template flag');
  assertEquals(isFictionalCompanion({discovery_metadata:{fictional:true}},{visual_identity:{fictional:false}}),false,'visual identity flag');
  assertEquals(isFictionalCompanion({}, {character_bible:{fictional:false}}),false,'character bible flag');
});
