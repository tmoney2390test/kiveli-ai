import {readFileSync,writeFileSync} from 'node:fs';
const pack=JSON.parse(readFileSync('content/calders-run/calders_run_content_pack.json','utf8'));
const direction=JSON.parse(readFileSync('content/calders-run/art-direction.json','utf8'));
const allowed=new Set(direction.bridgeAllowedAssets);
const districtViews={
  'main-street':'Eye-level view along the brick commercial terrace, with boardwalks, hotel balconies, a print-shop window and shoppers. Frame inward along the street with buildings closing the distant view.',
  'lantern-row':'Intimate evening view of painted entertainment-house facades, a lamplit theater entrance and a planted courtyard. Frame the near buildings and courtyard rather than a town panorama.',
  'cottonwood-valley':'A pastoral view through cottonwood trees toward irrigated orchards, ranch fencing and cultivated fields, with red bluffs in the distance.',
  'cinder-bluffs':'An upland view among red rocky bluffs, mule paths and small mining structures. Compose toward the high desert, with the town and river outside the frame.'
};
function environmentPrompt(kind,slug,source){
  const bridge=allowed.has(`${kind}:${slug}`);
  let prompt=source.replace(pack.world.visualContext.hero,'');
  if(districtViews[slug])prompt+=` ${districtViews[slug]}`;
  prompt+=' Single landscape 3:2 cinematic photographic image, realistic materials and clear fine detail, historically consistent 1888 clothing and objects. No modern objects, watermarks or lettering.';
  if(bridge)prompt+=' The railway bridge may appear here, visibly unfinished with a missing central span and construction work. It is not yet usable.';
  else prompt+=kind==='home'?' Camera faces inward into the room. Any window shows only soft sky, foliage or an adjacent courtyard wall. Exclude railway bridges and distant town panoramas.':' Keep the view local to this specific place. Any window or doorway opens onto a nearby wall, vegetation or local street. The railway bridge is completely outside the picture.';
  return prompt.replace(/\s+/g,' ').trim();
}
const jobs=[
  ...pack.locations.map(p=>({kind:'location',slug:p.slug,bridgeAllowed:allowed.has(`location:${p.slug}`),prompt:environmentPrompt('location',p.slug,p.imagePrompt)})),
  ...pack.homes.map(h=>{const slug=pack.characters.find(c=>c.id===h.ownerCharacterId).slug;return {kind:'home',slug,bridgeAllowed:false,prompt:environmentPrompt('home',slug,h.imagePrompt)};})
];
writeFileSync('content/calders-run/art-prompts-v2.json',JSON.stringify({generator:'built-in image_gen',directionVersion:direction.version,jobs},null,2)+'\n');
console.log(JSON.stringify({jobs:jobs.length,bridgeAllowed:jobs.filter(j=>j.bridgeAllowed).map(j=>j.slug)}));
