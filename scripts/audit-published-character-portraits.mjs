import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {manifestPath,registryFiles,root} from './catalog-artwork.mjs';

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

export async function auditPublishedCharacterPortraits(db,{roster}={}){
  const published=roster??await productionRoster(db);
  const registry=await portraitRegistry();
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  const missing=missingPortraits(published,registry,manifest);
  if(missing.length)throw new Error(`Published characters without usable portraits (${missing.length}): ${missing.map(item=>`${item.world??'world?'}:${item.slug} — ${item.reason}`).join('; ')}`);
  return{characters:published.length,portraitMappings:registry.size,missing:0};
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
  console.log(JSON.stringify(await auditPublishedCharacterPortraits(db,{roster})));
}
