import { buildImagePrompt, type CanonicalImageGenerationRequest } from './together-media-base.ts';
import { isHomePresenceActivity, type PlaceContext } from './together-place.ts';

function assert(condition:boolean,message:string){if(!condition)throw new Error(message);}

Deno.test('home presence distinguishes being home from traveling home',()=>{
  assert(isHomePresenceActivity('Having a quiet evening at home'),'at-home activity should resolve the virtual home');
  assert(isHomePresenceActivity('Home'),'explicit Home should resolve the virtual home');
  assert(isHomePresenceActivity('Sleeping','sleep'),'sleep schedule blocks should resolve the virtual home');
  assert(!isHomePresenceActivity('Driving home after work'),'travel home should remain in transit');
  assert(!isHomePresenceActivity('Working at Soba Miyako'),'ordinary venues should remain physical places');
});

Deno.test('home media prompts use text for environment and the portrait only for identity',()=>{
  const place:PlaceContext={
    contextVersion:1,
    world:{id:'world',slug:'neon-kyo',name:'NEON KYO',description:'A hyperconnected city.',timezone:'Asia/Tokyo',accessType:'subscription',visualContext:{setting:'Near-future urban life.',architecture:['vertical density'],climate:'rainy',recurringElements:['layered transit'],avoid:['generic dystopia']}},
    location:{id:'character-home:version',slug:'aya-mori-s-home',name:"Aya Mori's Home",type:'residence',description:'A private apartment shaped by Aya’s work and routines.',category:'home',hours:null,possibleActivities:['rest'],virtualType:'character_home',referencePolicy:'text_only',visualContext:{canonicalPrompt:'Photorealistic private NEON KYO apartment with warm timber, smoked glass, practical lamps, a precise worktable, and accumulated personal objects.',indoorOutdoor:'indoor',materials:['warm timber','smoked glass'],lighting:['soft practical lamps'],visualAnchors:['precise worktable'],avoid:['all-neon room']},lore:{summary:'Aya’s private and carefully inhabited apartment.'}},
    ancestry:[],nearby:[],path:"NEON KYO → Aya Mori's Home",clock:{timezone:'Asia/Tokyo',localIso:'2026-08-20T21:15',weekday:'Thursday',localTime:'21:15',daypart:'evening'},
  };
  const request:CanonicalImageGenerationRequest={
    mediaId:'home-test',companion:{templateId:'template',versionId:'version',name:'Aya Mori',age:29},
    visualIdentity:{canonicalDescription:'A fictional adult Japanese woman with a stable canonical appearance.',age:29,referenceStoragePaths:['aya/main.png']},
    referenceImages:[{role:'character_identity',signedUrl:'https://signed.test/aya.png',contentType:'image/png',name:'aya.png'}],
    context:{place,activity:'relaxing at home',mood:'quietly focused',timeOfDay:'evening'},
    composition:{shotType:'candid',aspectRatio:'4:5'},contentLevel:'standard',qualityTier:'standard',
  };
  const prompt=buildImagePrompt(request);
  assert(prompt.includes('has no location reference image by design'),'home environment must explicitly use text-only grounding');
  assert(prompt.includes('never borrow its room, décor, lighting, or layout from the character identity portrait'),'portrait must not leak into the home design');
  assert(prompt.includes('Photorealistic private NEON KYO apartment'),'canonical home prompt must reach the provider');
  assert(prompt.includes('Image 1 defines only face, hair, eyes, skin tone'),'portrait remains the character identity reference');
});
