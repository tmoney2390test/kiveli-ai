import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
const manifestPath='content/calders-run/art-review.json';
const direction=JSON.parse(readFileSync('content/calders-run/art-direction.json','utf8'));
const manifest=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):{version:1,assets:[]};
const [command,kind,slug,file,bridge]=process.argv.slice(2);
const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
if(command==='record'){
  if(!['world','portrait','location','home'].includes(kind)||!slug||!file||!['true','false'].includes(bridge))throw Error('Usage: record <world|portrait|location|home> <slug> <file> <bridge-visible:true|false>. Record only after visual review.');
  const normalized=relative(process.cwd(),resolve(file)).replaceAll('\\','/');
  if(normalized.startsWith('../')||!normalized.startsWith('apps/together/assets/'))throw Error('Review only project assets.');
  const item={key:`${kind}:${slug}`,file:normalized,sha256:digest(file),bridgeVisible:bridge==='true',reviewedAt:new Date().toISOString()};
  const assets=[...manifest.assets.filter(a=>a.key!==item.key),item];
  if(assets.filter(a=>a.bridgeVisible).length>direction.maximumPhotosWithRailwayBridge)throw Error('Railway bridge photo limit exceeded.');
  manifest.assets=assets.sort((a,b)=>a.key.localeCompare(b.key));
  writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
}else if(command==='check'){
  for(const a of manifest.assets)if(!existsSync(a.file)||digest(a.file)!==a.sha256)throw Error(`Image changed or missing; review again: ${a.key}`);
  const count=manifest.assets.filter(a=>a.bridgeVisible).length;
  if(count>direction.maximumPhotosWithRailwayBridge)throw Error('Railway bridge photo limit exceeded.');
  if(process.argv.includes('--release')){
    const pack=JSON.parse(readFileSync('content/calders-run/calders_run_content_pack.json','utf8'));
    const expected=['world:calders-run-hero',...pack.characters.map(c=>`portrait:${c.slug}`),...pack.locations.map(l=>`location:${l.slug}`),...pack.homes.map(h=>`home:${pack.characters.find(c=>c.id===h.ownerCharacterId).slug}`)];
    const keys=new Set(manifest.assets.map(a=>a.key));
    const missing=expected.filter(k=>!keys.has(k));
    if(missing.length)throw Error(`Unreviewed release images (${missing.length}): ${missing.join(', ')}`);
  }
  console.log(JSON.stringify({reviewed:manifest.assets.length,photosWithRailwayBridge:count,maximum:direction.maximumPhotosWithRailwayBridge}));
}else throw Error('Use record or check [--release].');
