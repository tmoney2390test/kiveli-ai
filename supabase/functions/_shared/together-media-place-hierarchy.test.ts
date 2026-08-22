import { buildImagePrompt, type CanonicalImageGenerationRequest } from './together-media-base.ts';
import type { PlaceContext } from './together-place.ts';

function assert(condition:boolean,message:string){if(!condition)throw new Error(message);}

Deno.test('media prompts layer world, district, then stronger exact-location visuals',()=>{
  const districtVisual='Northside old brick music district with murals and worn neon';
  const locationVisual='Northline Motor Lodge exterior corridors and compact courtyard pool';
  const place:PlaceContext={
    contextVersion:1,
    world:{id:'juniper',slug:'juniper-city',name:'Juniper City',description:'A grounded contemporary American city.',timezone:'America/New_York',accessType:'free',visualContext:{setting:'contemporary American city',architecture:['brick mixed-use blocks']}},
    location:{id:'northline',slug:'northline-motor-lodge',name:'Northline Motor Lodge',type:'residence',description:'A revived mid-century motor lodge.',category:'hotel',hours:{open:'00:00',close:'23:59'},possibleActivities:['stay'],visualContext:{canonicalPrompt:locationVisual,indoorOutdoor:'mixed',visualAnchors:['glowing NORTHLINE roadside sign']},lore:{summary:'An unpretentious Northside motor lodge.'}},
    district:{id:'northside',slug:'northside',name:'Northside',type:'district',description:'Juniper music and neighborhood nightlife.',visualContext:{canonicalPrompt:districtVisual,visualAnchors:['layered music posters']},lore:{}},
    ancestry:[{id:'northside',slug:'northside',name:'Northside',type:'district',description:'Juniper music and neighborhood nightlife.',visualContext:{canonicalPrompt:districtVisual},lore:{}}],
    adjacentDistricts:[],nearby:[],path:'Juniper City → Northside → Northline Motor Lodge',clock:{timezone:'America/New_York',localIso:'2026-08-21T22:00',weekday:'Friday',localTime:'22:00',daypart:'late_night'},
  };
  const request:CanonicalImageGenerationRequest={
    mediaId:'district-place-test',companion:{templateId:'template',versionId:'version',name:'Maya',age:26},
    visualIdentity:{canonicalDescription:'A fictional adult woman with a stable canonical appearance.',age:26,referenceStoragePaths:[]},
    referenceImages:[],context:{place,activity:'arriving after a concert',mood:'tired but amused',timeOfDay:'late night'},
    composition:{shotType:'candid',aspectRatio:'4:5'},contentLevel:'standard',qualityTier:'standard',
  };
  const prompt=buildImagePrompt(request);
  assert(prompt.includes('DISTRICT / AREA'),'prompt must include a district layer');
  assert(prompt.includes(districtVisual),'district visual context must reach the provider');
  assert(prompt.includes(locationVisual),'exact location visual context must reach the provider');
  assert(prompt.indexOf(districtVisual)<prompt.indexOf(locationVisual),'district context must be established before exact-location anchors');
  assert(prompt.includes('subordinate to stronger exact-location anchors'),'prompt must explicitly preserve location precedence');
});
