// Explicit admin catalog tooling. Drafts stay local; image jobs must be queued
// by a reviewed migration. No user credits or private conversations are used.
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {editWorldHome,withResidenceSource} from '../content/homes/worlds/editorial.mjs';
const project='mfysnlghlhxxcwnwpxog',base=`https://${project}.supabase.co`;
const [command='inventory',worldArgument,...args]=process.argv.slice(2);
const world=worldArgument==='all'?undefined:worldArgument;
const output=resolve('.test-tmp/world-home-artwork'),catalog=resolve('content/homes/worlds');
const keys=JSON.parse(execFileSync(process.execPath,[resolve('node_modules/supabase/dist/supabase.js'),'projects','api-keys','--project-ref',project,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const key=keys.find(k=>k.name==='service_role')?.api_key;if(!key)throw Error('CLI service credential unavailable.');
const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
async function readRetry(operation){for(let attempt=0;;attempt++){try{return await operation();}catch(error){if(attempt>=3||!/fetch failed|socket|timed?\s*out|timeout|ECONN|^50[234]:/i.test(error.message))throw error;await new Promise(r=>setTimeout(r,1200*(attempt+1)));}}}
async function api(path,options={}){const run=async()=>{const response=await fetch(`${base}${path}`,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(210000)});const body=await response.json().catch(()=>null);if(!response.ok)throw Error(`${response.status}: ${body?.error?.message??body?.message??'Home release request failed'}`);return body;};return !options.method||options.method==='GET'?readRetry(run):run();}
let dispatchSecret;
async function dispatch(body){if(!dispatchSecret){const vault=JSON.parse(execFileSync(process.execPath,[resolve('node_modules/supabase/dist/supabase.js'),'db','query','--linked','--project-ref',project,'--output','json',"select decrypted_secret as value from vault.decrypted_secrets where name='together_media_dispatch_secret' limit 1"],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));dispatchSecret=vault.rows?.[0]?.value;}if(!dispatchSecret)throw Error('Home dispatch credential unavailable.');return api('/functions/v1/together-home-artwork-dispatch',{method:'POST',headers:{'x-kivelli-home-dispatch-secret':dispatchSecret},body:JSON.stringify(body)});}
const homes=(await api('/rest/v1/together_character_homes?select=*,world:together_worlds!inner(slug,name,published,description,visual_context),version:together_character_versions!inner(version,interests,template:together_character_templates!inner(slug,name,occupation,biography,creator_id,published,current_published_version))&active=eq.true&world.published=eq.true&world.slug=neq.eos-meridian&version.template.creator_id=is.null&version.template.published=eq.true&order=id.asc')).filter(h=>h.world.published&&h.version.template.creator_id===null&&h.version.template.published&&h.version.version===h.version.template.current_published_version&&h.world.slug!=='eos-meridian').map(h=>({...h,slug:h.version.template.slug,worldSlug:h.world.slug})).sort((a,b)=>a.worldSlug.localeCompare(b.worldSlug)||a.slug.localeCompare(b.slug));
const selected=world?homes.filter(h=>h.worldSlug===world):homes;if(world&&!selected.length)throw Error('Unknown catalog world.');
await mkdir(output,{recursive:true});await mkdir(catalog,{recursive:true});
// Preserve the pre-expansion source for household and era regression checks.
if(!await stat(resolve(output,'catalog-source.json')).catch(()=>null))await writeFile(resolve(output,'catalog-source.json'),JSON.stringify(homes,null,2));
await writeFile(resolve(output,'catalog-current.json'),JSON.stringify(homes,null,2));
const byId=new Map(homes.map(h=>[h.id,h]));
async function jobs(){return(await api('/rest/v1/together_home_artwork?select=*&order=created_at.asc&limit=1000')).filter(j=>byId.has(j.home_id)&&(!world||byId.get(j.home_id).worldSlug===world));}
async function saveImage(job){const home=byId.get(job.home_id),dir=resolve(output,home.worldSlug);await mkdir(dir,{recursive:true});const path=resolve(dir,`${home.slug}--${job.id}.${job.storage_path.split('.').at(-1)}`),storage=`${base}/storage/v1/object/public/${job.storage_bucket}/`,url=storage+job.storage_path;if(!(await stat(path).catch(()=>null))?.size){const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`Image ${r.status}`);await writeFile(path,Buffer.from(await r.arrayBuffer()));}return{world:home.worldSlug,slug:home.slug,homeId:home.id,artworkId:job.id,file:path,url,thumbnailUrl:job.thumbnail_path?storage+job.thumbnail_path:null,width:job.width,height:job.height,model:job.model};}
if(command==='inventory'){console.log(JSON.stringify({total:homes.length,worlds:homes.reduce((acc,h)=>(acc[h.worldSlug]=(acc[h.worldSlug]??0)+1,acc),{})}));}
else if(command==='draft'){
 const cacheDir=resolve(output,'drafts-v2');await mkdir(cacheDir,{recursive:true});
 const limit=Number(args.find(a=>a.startsWith('--limit='))?.split('=')[1]??Infinity);
 const pending=[];for(const h of selected){if(!await stat(resolve(cacheDir,`${h.id}.json`)).catch(()=>null))pending.push(h);}
 const chosen=pending.slice(0,limit),batches=[];for(const slug of [...new Set(chosen.map(h=>h.worldSlug))]){const residents=chosen.filter(h=>h.worldSlug===slug);for(let i=0;i<residents.length;i+=4)batches.push(residents.slice(i,i+4));}
 let cursor=0,failed=0;
 await Promise.all(Array.from({length:Math.min(3,batches.length)},async()=>{while(cursor<batches.length){const batch=batches[cursor++];try{const response=await dispatch({action:'draft_content',homeIds:batch.map(h=>h.id)});for(const draft of response.data.homes)await writeFile(resolve(cacheDir,`${draft.homeId}.json`),JSON.stringify({...draft,draftModel:response.data.model},null,2));console.log(`DRAFT ${batch[0].worldSlug}: ${batch.map(h=>h.slug).join(', ')}`);}catch(error){failed++;console.log(`CHECK DRAFT ${batch[0].worldSlug}: ${batch.map(h=>h.slug).join(', ')}: ${error.message}`);if(error.message.includes('(429)'))await new Promise(r=>setTimeout(r,30000));}}}));
 for(const slug of [...new Set(selected.map(h=>h.worldSlug))]){const entries=[];for(const h of homes.filter(h=>h.worldSlug===slug)){try{entries.push(editWorldHome(withResidenceSource(JSON.parse(await readFile(resolve(cacheDir,`${h.id}.json`),'utf8')),h)));}catch{}}await writeFile(resolve(catalog,`${slug}.json`),JSON.stringify(entries,null,2));console.log(`SAVED ${slug}: ${entries.length} drafts`);}
 if(failed)process.exitCode=1;
}
else if(command==='generate'){
 const limit=Number(args.find(a=>a.startsWith('--limit='))?.split('=')[1]??Infinity);
 const excluded=args.find(a=>a.startsWith('--exclude='))?.split('=')[1];
 const only=args.find(a=>a.startsWith('--only='))?.slice(7).split(',');
 if(only&&(!world||only.some(s=>!selected.some(h=>h.slug===s))))throw Error('A targeted render requires a specific world and resident(s)');
 const parallel=Math.max(1,Math.min(6,Number(args.find(a=>a.startsWith('--concurrency='))?.split('=')[1]??3)));
 const queued=(await jobs()).filter(j=>j.status==='queued'&&byId.get(j.home_id).worldSlug!==excluded&&(!only||only.includes(byId.get(j.home_id).slug))).slice(0,limit);let cursor=0,failed=0,stop=false;
 console.log(`Generating ${queued.length} explicitly queued homes, concurrency ${parallel}.`);
 await Promise.all(Array.from({length:Math.min(parallel,queued.length)},async()=>{while(!stop&&cursor<queued.length){const job=queued[cursor++],home=byId.get(job.home_id);try{await dispatch({action:'generate',jobId:job.id});const deadline=Date.now()+360000;let finished=false;while(Date.now()<deadline){await new Promise(r=>setTimeout(r,8000));const [state]=await api(`/rest/v1/together_home_artwork?id=eq.${job.id}&select=*`);if(state?.status==='ready'){await saveImage(state);console.log(`READY ${home.worldSlug}/${home.slug}`);finished=true;break;}if(state?.status==='failed'){console.log(`FAILED ${home.worldSlug}/${home.slug}: ${state.error_code}`);failed++;if(/billing|credit|quota|balance|payment|authentication|unauthorized|429|rate.limit|provider_unavailable/i.test(state.error_code)||failed>=3)stop=true;finished=true;break;}}if(!finished){console.log(`PENDING ${home.worldSlug}/${home.slug}`);failed++;}}catch(error){console.log(`CHECK ART ${home.worldSlug}/${home.slug}: ${error.message}`);failed++;if(failed>=3)stop=true;}}}));if(failed)process.exitCode=1;
}
else if(command==='review'){
 const manifest=[];for(const job of(await jobs()).filter(j=>j.status==='ready'))manifest.push(await saveImage(job));await writeFile(resolve(output,`${world??'all'}-manifest.json`),JSON.stringify(manifest,null,2));console.log(`Downloaded ${manifest.length} images for visual review.`);
}
else if(command==='repair-thumbnail'){
 if(!world||!args.length)throw Error('Use repair-thumbnail <world> <specific resident slug(s)>');
 const {default:sharp}=await import('sharp'),history=await jobs();
 for(const slug of args){
  const h=selected.find(x=>x.slug===slug);if(!h||h.source!=='authored'||h.visits_enabled)throw Error('Only staged authored homes are eligible');
  const candidates=history.filter(j=>j.home_id===h.id&&j.status==='ready');if(candidates.length!==1)throw Error('Expected exactly one inspected original for '+slug);
  const job=candidates[0];if(job.thumbnail_path)continue;
  const original=await saveImage(job),bytes=await sharp(original.file).resize(640,360,{fit:'cover'}).webp({quality:78}).toBuffer();
  const path=h.id+'/'+job.id+'-preview-repaired.webp',object='/storage/v1/object/'+job.storage_bucket+'/'+path;
  const r=await fetch(base+object,{method:'POST',headers:{...headers,'Content-Type':'image/webp','cache-control':'31536000','x-upsert':'false'},body:bytes});
  if(!r.ok){const existing=await fetch(base+object.replace('/object/','/object/public/'));if(!existing.ok||!bytes.equals(Buffer.from(await existing.arrayBuffer())))throw Error('Could not save the specific thumbnail: '+r.status);}
  const updated=await api('/rest/v1/together_home_artwork?id=eq.'+job.id+'&home_id=eq.'+h.id+'&status=eq.ready&thumbnail_path=is.null',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({thumbnail_path:path})});
  if(updated.length!==1)throw Error('Artwork changed while repairing its thumbnail');console.log('Recovered thumbnail from existing original: '+world+'/'+slug);
 }
}
else if(command==='retry'){
 if(!world||!args.length)throw Error('Use retry <world> <explicit failed resident slug(s)>');
 const history=await jobs();
 for(const slug of args){const h=selected.find(x=>x.slug===slug);if(!h||h.visits_enabled||h.approved_artwork_id||h.source!=='authored')throw Error(`Not a staged home: ${slug}`);
  const records=history.filter(j=>j.home_id===h.id);if(records.length!==1||records[0].status!=='failed')throw Error(`Expected just one unsuccessful job for ${slug}; inspect the history`);
  await api('/rest/v1/together_home_artwork',{method:'POST',body:JSON.stringify({home_id:h.id,prompt_text:h.artwork_prompt??h.prompt_text})});console.log(`QUEUED reviewed retry: ${world}/${slug}`);
 }
}
else if(command==='approve'){
 const file=args[0];if(!world||!file)throw Error('Use approve <world> <reviewed-manifest.json>.');const reviewed=JSON.parse(await readFile(resolve(file),'utf8')),ready=await jobs();
 for(const entry of reviewed){if(entry.approved!==true)continue;const home=byId.get(entry.homeId);if(!home||home.worldSlug!==world)throw Error('Review world mismatch');if(home.approved_artwork_id===entry.artworkId)continue;if(!ready.some(j=>j.id===entry.artworkId&&j.home_id===entry.homeId&&j.status==='ready'))throw Error('Artwork is not ready for this home');await dispatch({action:'approve',homeId:entry.homeId,artworkId:entry.artworkId});console.log(`APPROVED ${world}/${home.slug}`);}
}
else if(command==='status'){console.log(JSON.stringify({homes:selected.length,enabled:selected.filter(h=>h.visits_enabled).length,approved:selected.filter(h=>h.approved_artwork_id).length,jobs:(await jobs()).reduce((a,j)=>(a[j.status]=(a[j.status]??0)+1,a),{})}));}
else throw Error('Use inventory, draft, generate, review, approve or status.');
