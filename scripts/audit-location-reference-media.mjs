import {createClient} from '@supabase/supabase-js';
import {readFile} from 'node:fs/promises';
import {basename, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bucket, manifestPath, registryFiles, sha256} from './catalog-artwork.mjs';

// Audit the same images displayed by the app against the generation registry.
// --repair-missing or --repair-stale requires --world=<slug>. Corrections use
// verified public artwork and new revisions, preserving historical references.
// This never edits user media or starts generation.
export async function locationArtworkRegistry() {
  const registry=new Map();
  for(const file of await registryFiles()) {
    if(!file.replaceAll('\\','/').includes('/location-assets/'))continue;
    const world=basename(file,'.ts'),source=await readFile(file,'utf8');
    for(const match of source.matchAll(/['"]([^'"]+)['"]\s*:\s*catalogArtwork\('([^']+)'\)/g)) {
      if(!match[2].startsWith(`locations/${world}/`))throw Error(`Unexpected location artwork: ${match[2]}`);
      const key=`${world}:${match[1]}`;
      if(registry.has(key))throw Error(`Duplicate location artwork: ${key}`);
      registry.set(key,match[2]);
    }
  }
  return registry;
}

export async function allPages(query) {
  const rows=[];
  for(let start=0;;start+=500) {
    const {data,error}=await query().order('id').range(start,start+499);
    if(error)throw error;
    rows.push(...(data??[]));
    if((data??[]).length<500)return rows;
  }
}

export async function loadLocationReferenceState(db,{worldSlug}={}) {
  const worlds=await allPages(()=>{
    const query=db.from('together_worlds').select('id,slug').eq('published',true);
    return worldSlug?query.eq('slug',worldSlug):query;
  });
  if(!worlds.length)throw Error('No published worlds match this audit');
  const worldById=new Map(worlds.map(world=>[world.id,world.slug]));
  const locations=(await allPages(()=>db.from('together_locations')
    .select('id,slug,world_id,owner_user_id,archived_at')
    .in('world_id',worlds.map(world=>world.id)).is('owner_user_id',null).is('archived_at',null)))
    .map(location=>({...location,world_slug:worldById.get(location.world_id)}));
  const references=[];
  for(let start=0;start<locations.length;start+=100) {
    references.push(...await allPages(()=>db.from('together_media_reference_assets')
      .select('id,asset_role,location_id,character_version_id,world_id,active,source_key,revision,storage_bucket,storage_path,sha256,content_type,byte_size,metadata')
      .in('location_id',locations.slice(start,start+100).map(location=>location.id)).eq('asset_role','location_canonical')));
  }
  return {locations,references};
}

export function locationReferenceGaps({locations,references},registry,manifest) {
  return locations.flatMap(location=>{
    if(location.owner_user_id||location.archived_at)return [];
    const key=`${location.world_slug}:${location.slug}`,path=registry.get(key),entry=manifest[path];
    if(!entry?.display?.file)return [{location,key,reason:'missing app artwork'}];
    const ready=currentLocationReference(location.id,references);
    if(!ready)return [{location,key,path,entry,reason:'missing generation reference'}];
    return expectedArtworkHashes(entry).includes(ready.sha256)?[]:
      [{location,key,path,entry,reason:'stale generation reference'}];
  });
}

export function currentLocationReference(locationId,references) {
  return references.filter(reference=>reference.active&&reference.asset_role==='location_canonical'
    &&reference.location_id===locationId&&!reference.character_version_id&&!reference.world_id
    &&reference.storage_bucket&&reference.storage_path).sort((a,b)=>b.revision-a.revision)[0];
}

function expectedArtworkHashes(entry) {
  return [entry?.sourceHash,/^v1\/([a-f0-9]{64})\.webp$/.exec(entry?.display?.file??'')?.[1]].filter(Boolean);
}

export async function verifyLocationReferenceDelivery(state,registry,manifest,{download,concurrency=6}) {
  const failures=[];
  let next=0,verified=0;
  await Promise.all(Array.from({length:Math.min(concurrency,state.locations.length)},async()=>{
    while(next<state.locations.length) {
      const location=state.locations[next++],key=`${location.world_slug}:${location.slug}`;
      const reference=currentLocationReference(location.id,state.references),entry=manifest[registry.get(key)];
      if(!reference){failures.push({key,reason:'missing generation reference'});continue;}
      try {
        const bytes=await download(reference.storage_bucket,reference.storage_path);
        const actual=sha256(bytes);
        if(!expectedArtworkHashes(entry).includes(actual)||actual!==reference.sha256)throw Error('image content does not match current catalog');
        verified++;
      }catch(error){failures.push({key,reason:error instanceof Error?error.message:'download failed'});}
    }
  }));
  return {verified,failures};
}

export async function verifiedLocationReferenceRows(gaps,references,{baseUrl,fetcher=fetch}={}) {
  const rows=[];
  // Verify the complete repair set before inserting anything.
  for(const gap of gaps) {
    if(!['missing generation reference','stale generation reference'].includes(gap.reason))throw Error(`${gap.key}: ${gap.reason}`);
    const {file,width,height,bytes}=gap.entry.display;
    const hash=/^v1\/([a-f0-9]{64})\.webp$/.exec(file)?.[1];
    if(!hash||!(width>0&&height>0&&bytes>0))throw Error(`Invalid catalog entry: ${gap.key}`);
    const response=await fetcher(`${baseUrl}/storage/v1/object/public/${bucket}/${file}`,{signal:AbortSignal.timeout(20000)});
    if(!response.ok||!response.headers.get('content-type')?.includes('image/webp'))throw Error(`Artwork unavailable: ${gap.key}`);
    const content=Buffer.from(await response.arrayBuffer());
    if(content.length!==bytes||sha256(content)!==hash)throw Error(`Artwork integrity mismatch: ${gap.key}`);
    const sourceKey=`location:${gap.location.world_slug}:${gap.location.slug}:canonical`;
    const revisions=references.filter(reference=>reference.source_key===sourceKey).map(reference=>Number(reference.revision)||0);
    rows.push({asset_role:'location_canonical',location_id:gap.location.id,source_key:sourceKey,
      storage_bucket:bucket,storage_path:file,content_type:'image/webp',width,height,byte_size:bytes,sha256:hash,
      revision:Math.max(0,...revisions)+1,active:true,
      metadata:{syncedBy:'audit-location-reference-media',catalogPath:gap.path,sourceHash:gap.entry.sourceHash}});
  }
  return rows;
}

export async function auditLocationReferenceMedia(db,{worldSlug,repairMissing=false,repairStale=false,verifyDelivery=false,baseUrl=process.env.SUPABASE_URL}={}) {
  if((repairMissing||repairStale)&&!worldSlug)throw Error('A world slug is required for a repair');
  const registry=await locationArtworkRegistry(),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  let state=await loadLocationReferenceState(db,{worldSlug});
  const gaps=locationReferenceGaps(state,registry,manifest);
  let repaired=0;
  if((repairMissing||repairStale)&&gaps.length) {
    const unsupported=gaps.find(gap=>!(repairMissing&&gap.reason==='missing generation reference')&&!(repairStale&&gap.reason==='stale generation reference'));
    if(unsupported)throw Error(`${unsupported.key}: ${unsupported.reason} is outside the requested repair`);
    const rows=await verifiedLocationReferenceRows(gaps,state.references,{baseUrl});
    const {error}=await db.from('together_media_reference_assets').insert(rows);
    if(error)throw error;
    // Insert the full verified batch first. Queues select the newest revision;
    // older jobs can still load their original row by ID after retirement.
    const repairedIds=new Set(rows.map(row=>row.location_id));
    const previous=state.references.filter(reference=>reference.active&&repairedIds.has(reference.location_id)).map(reference=>reference.id);
    if(previous.length) {
      const {error:retireError}=await db.from('together_media_reference_assets').update({active:false,updated_at:new Date().toISOString()}).in('id',previous);
      if(retireError)throw retireError;
    }
    repaired=rows.length;
    state=await loadLocationReferenceState(db,{worldSlug});
  }
  const remaining=locationReferenceGaps(state,registry,manifest);
  if(remaining.length)throw Error(`Public places without current photo references (${remaining.length}): ${remaining.map(gap=>`${gap.key} (${gap.reason})`).join(', ')}`);
  let delivery;
  if(verifyDelivery) {
    delivery=await verifyLocationReferenceDelivery(state,registry,manifest,{download:async(storageBucket,path)=>{
      const {data,error}=await db.storage.from(storageBucket).download(path);
      if(error||!data)throw Error('Registered image could not be downloaded');
      return Buffer.from(await data.arrayBuffer());
    }});
    if(delivery.failures.length)throw Error(`Location image delivery failures: ${JSON.stringify(delivery.failures)}`);
  }
  return {locations:state.locations.length,missing:0,repaired,...(delivery?{imagesVerified:delivery.verified}:{})};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw Error('Server-only Supabase credentials are required');
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  console.log(JSON.stringify(await auditLocationReferenceMedia(db,{
    worldSlug:process.argv.find(argument=>argument.startsWith('--world='))?.slice(8),
    repairMissing:process.argv.includes('--repair-missing'),repairStale:process.argv.includes('--repair-stale'),verifyDelivery:process.argv.includes('--verify-delivery'),baseUrl:url,
  })));
}
