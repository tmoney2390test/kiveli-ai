import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {bucket,manifestPath,registryFiles,root} from './catalog-artwork.mjs';

/** Keep this check tied to the actual app registry, not the metadata's "ready" flag. */
export async function portraitRegistry(){
  const entries=new Map();
  for(const file of await registryFiles()){
    const source=await readFile(file,'utf8');
    const pattern=/(?:^|\n)\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z0-9_-]+))\s*:\s*catalogArtwork\('([^']+)'\)/g;
    for(const match of source.matchAll(pattern)){
      const key=match[1]??match[2]??match[3],path=match[4];
      if(!path.startsWith('characters/'))continue;
      if(entries.has(key)&&entries.get(key)!==path)throw new Error(`Conflicting portrait artwork for ${key}`);
      entries.set(key,path);
    }
  }
  return entries;
}

export function missingPortraits(roster,registry,manifest){
  return roster.flatMap(character=>{
    const key=character.portrait_key??character.portrait_asset_key??character.slug;
    const path=registry.get(key)||registry.get(character.slug);
    if(!path)return[{slug:character.slug,world:character.world_slug??null,reason:'no app portrait mapping'}];
    if(!manifest[path])return[{slug:character.slug,world:character.world_slug??null,reason:`no catalog artwork for ${path}`}];
    return[];
  });
}

/** A registry/manifest match is insufficient if its immutable files were never uploaded. */
export async function missingDeliveredPortraits(roster,registry,manifest,{
  baseUrl=process.env.SUPABASE_URL??'https://mfysnlghlhxxcwnwpxog.supabase.co',
  fetcher=fetch,
}={}){
  const required=new Map();
  for(const character of roster){
    const key=character.portrait_key??character.portrait_asset_key??character.slug;
    const path=registry.get(key)||registry.get(character.slug);
    const entry=manifest[path];
    if(!entry)continue;
    for(const variant of ['display','thumbnail']){
      const file=entry[variant]?.file;
      if(!/^v1\/[a-f0-9]{64}\.webp$/.test(file??'')){
        required.set(`${character.slug}:${variant}`,{slug:character.slug,variant,reason:'invalid manifest file'});
        continue;
      }
      const owners=required.get(file)??[];
      owners.push({slug:character.slug,variant});
      required.set(file,owners);
    }
  }
  const files=[...required.entries()].filter(([file])=>file.startsWith('v1/'));
  const missing=[...required.entries()].filter(([file])=>!file.startsWith('v1/')).map(([,item])=>item);
  let next=0;
  await Promise.all(Array.from({length:Math.min(12,files.length)},async()=>{
    while(next<files.length){
      const[file,owners]=files[next++];
      let response;
      try{response=await fetcher(`${baseUrl}/storage/v1/object/public/${bucket}/${file}`,{method:'HEAD',signal:AbortSignal.timeout(15000)});}
      catch{missing.push(...owners.map(owner=>({...owner,reason:'delivery request failed'})));continue;}
      if(!response.ok||!response.headers.get('content-type')?.includes('image/webp'))
        missing.push(...owners.map(owner=>({...owner,reason:`catalog delivery HTTP ${response.status}`})));
    }
  }));
  return missing;
}

async function productionRoster(db){
  const templates=[];
  for(let start=0;;start+=500){
    const {data,error}=await db.from('together_character_templates')
      .select('id,slug,current_published_version')
      .eq('published',true).eq('can_be_selected',true).is('creator_id',null)
      .order('id').range(start,start+499);
    if(error)throw error;
    templates.push(...(data??[]));
    if((data??[]).length<500)break;
  }
  const versions=[];
  for(let start=0;start<templates.length;start+=100){
    const ids=templates.slice(start,start+100).map(item=>item.id);
    const {data,error}=await db.from('together_character_versions')
      .select('character_template_id,version,portrait_asset_key')
      .in('character_template_id',ids);
    if(error)throw error;
    versions.push(...(data??[]));
  }
  const byVersion=new Map(versions.map(item=>[`${item.character_template_id}:${item.version}`,item]));
  return templates.map(item=>({
    slug:item.slug,
    portrait_key:byVersion.get(`${item.id}:${item.current_published_version}`)?.portrait_asset_key??item.slug,
  }));
}

export async function auditPublishedCharacterPortraits(db,{roster,verifyDelivery=false,fetcher,baseUrl}={}){
  const published=roster??await productionRoster(db);
  const registry=await portraitRegistry();
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  const missing=missingPortraits(published,registry,manifest);
  if(missing.length)throw new Error(`Published characters without usable portraits (${missing.length}): ${missing.map(item=>`${item.world??'world?'}:${item.slug} — ${item.reason}`).join('; ')}`);
  if(verifyDelivery){
    const undelivered=await missingDeliveredPortraits(published,registry,manifest,{fetcher,baseUrl});
    if(undelivered.length)throw new Error(`Published portrait variants missing from delivery (${undelivered.length}): ${undelivered.map(item=>`${item.slug}:${item.variant} — ${item.reason}`).join('; ')}`);
  }
  return{characters:published.length,portraitMappings:registry.size,missing:0,deliveryVerified:verifyDelivery};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const rosterArg=process.argv.find(arg=>arg.startsWith('--roster='));
  const roster=rosterArg?JSON.parse(await readFile(resolve(root,rosterArg.slice('--roster='.length)),'utf8')):undefined;
  let db;
  if(!roster){
    const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key)throw new Error('Set server-only Supabase credentials or pass --roster=<exported JSON>');
    db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  }
  console.log(JSON.stringify(await auditPublishedCharacterPortraits(db,{roster,verifyDelivery:process.argv.includes('--verify-delivery') })));
}
