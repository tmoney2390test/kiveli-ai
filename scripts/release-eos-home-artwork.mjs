// Explicit catalog release tool. Credentials stay in memory; no user credits are charged.
// generate [slug...] starts only existing queued jobs; failed jobs require a deliberate new request.
// review downloads ready images; approve <review.json> accepts only visually reviewed artwork IDs.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
const project = 'mfysnlghlhxxcwnwpxog';
const base = `https://${project}.supabase.co`;
const output = resolve('.test-tmp/eos-home-artwork');
const [command = 'status', ...args] = process.argv.slice(2);
if (!['status', 'generate', 'review', 'approve'].includes(command)) throw new Error('Use status, generate, review or approve.');
const keys = JSON.parse(execFileSync(process.execPath, [resolve('node_modules/supabase/dist/supabase.js'), 'projects', 'api-keys', '--project-ref', project, '--output', 'json'], {encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const key = keys.find(k => k.name === 'service_role')?.api_key;
if (!key) throw new Error('The authenticated CLI did not provide a server credential.');
const headers = {apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
async function api(path, options={}) {
  for(let attempt=0;attempt<4;attempt++) {
    let response;
    try { response = await fetch(`${base}${path}`, {...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(60000)}); }
    catch(error) { if(attempt===3)throw new Error(`Home release network request failed: ${error.cause?.code??error.name}`);await new Promise(r=>setTimeout(r,1000*(attempt+1)));continue; }
    const body = await response.json().catch(()=>null);
    if (!response.ok) {
      if(attempt<3 && [429,502,503,504].includes(response.status)){await new Promise(r=>setTimeout(r,1000*(attempt+1)));continue;}
      throw new Error(`Home release request failed (${response.status}; ${body?.code ?? body?.error?.code ?? 'request'}).`);
    }
    return body;
  }
}
let dispatchSecret = process.env.TOGETHER_MEDIA_DISPATCH_SECRET;
async function dispatch(body) {
  if(!dispatchSecret) {
    const vault = JSON.parse(execFileSync(process.execPath,[resolve('node_modules/supabase/dist/supabase.js'),'db','query','--linked','--project-ref',project,'--output','json',"select decrypted_secret as value from vault.decrypted_secrets where name='together_media_dispatch_secret' limit 1"],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
    dispatchSecret = vault.rows?.[0]?.value;
  }
  if(!dispatchSecret)throw new Error('The existing server media-dispatch credential is unavailable.');
  return api('/functions/v1/together-home-artwork-dispatch',{method:'POST',headers:{'x-kivelli-home-dispatch-secret':dispatchSecret},body:JSON.stringify(body)});
}
const homes = (await api('/rest/v1/together_character_homes?select=id,name,approved_artwork_id,together_worlds!inner(slug),together_character_versions!inner(version,together_character_templates!inner(slug,current_published_version))&active=eq.true&visits_enabled=eq.true&together_worlds.slug=eq.eos-meridian')).filter(h=>h.together_character_versions.version===h.together_character_versions.together_character_templates.current_published_version).map(h=>({...h,slug:h.together_character_versions.together_character_templates.slug}));
if (homes.length !== 67) throw new Error(`Expected exactly 67 Eos homes; got ${homes.length}.`);
const byId = new Map(homes.map(h=>[h.id,h]));
async function jobs() { return (await api('/rest/v1/together_home_artwork?select=*&order=created_at.asc')).filter(j=>byId.has(j.home_id)); }
await mkdir(output,{recursive:true});
async function saveImage(job) {
  const home = byId.get(job.home_id);
  const file = resolve(output,`${home.slug}--${job.id}.${job.storage_path.split('.').at(-1)}`);
  const url = `${base}/storage/v1/object/public/${job.storage_bucket}/${job.storage_path}`;
  const cached = await stat(file).catch(()=>null);
  if(!cached?.size) {
    const response = await fetch(url,{signal:AbortSignal.timeout(60000)});
    if (!response.ok) throw new Error(`Image download failed (${response.status}).`);
    await writeFile(file,Buffer.from(await response.arrayBuffer()));
  }
  return {slug:home.slug,homeId:home.id,artworkId:job.id,file,url,width:job.width,height:job.height,model:job.model,costUsd:job.cost_usd};
}
if (command==='generate') {
  const selected = (await jobs()).filter(j=>j.status==='queued' && (!args.length || args.includes(byId.get(j.home_id).slug)));
  console.log(`Starting ${selected.length} explicitly queued Eos interiors, concurrency 3.`);
  let cursor=0, failures=0;
  await Promise.all(Array.from({length:Math.min(3,selected.length)},async()=>{
    while(cursor<selected.length) {
      const job=selected[cursor++], home=byId.get(job.home_id);
      try {
      await dispatch({action:'generate',jobId:job.id});
      const deadline=Date.now()+360000;
      let finished=false;
      while(Date.now()<deadline) {
        await new Promise(r=>setTimeout(r,8000));
        const [state]=await api(`/rest/v1/together_home_artwork?id=eq.${job.id}&select=*`);
        if(state?.status==='ready') { await saveImage(state); console.log(`READY ${home.slug} (${state.width}x${state.height}, ${state.model})`); finished=true; break; }
        if(state?.status==='failed') { console.log(`FAILED ${home.slug}: ${state.error_code}`); failures++; finished=true; break; }
      }
      if(!finished) {console.log(`PENDING ${home.slug}: worker still needs inspection; no automatic retry`); failures++;}
      } catch(error) {console.log(`CHECK ${home.slug}: ${error.message}; existing job retained`);failures++;}
    }
  }));
  if(failures)process.exitCode=1;
}
if (command==='review') {
  const ready = (await jobs()).filter(j=>j.status==='ready');
  const manifest=[];
  for(const job of ready) manifest.push(await saveImage(job));
  await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log(`Downloaded ${manifest.length} permanent interiors for visual inspection.`);
}
if(command==='approve') {
  if(!args[0])throw new Error('Pass the reviewed artwork manifest explicitly.');
  const reviewed=JSON.parse(await readFile(resolve(args[0]),'utf8'));
  const ready=await jobs();
  for(const entry of reviewed) {
    if(entry.approved!==true)continue;
    if(byId.get(entry.homeId)?.approved_artwork_id===entry.artworkId)continue;
    const job=ready.find(j=>j.id===entry.artworkId&&j.home_id===entry.homeId&&j.status==='ready');
    if(!job)throw new Error('Review manifest contains unavailable artwork.');
    await dispatch({action:'approve',homeId:entry.homeId,artworkId:entry.artworkId});
    console.log(`APPROVED ${byId.get(entry.homeId).slug}`);
  }
}
const all=await jobs();
console.log(JSON.stringify({homes:homes.length,jobs:all.reduce((out,j)=>(out[j.status]=(out[j.status]??0)+1,out),{})}));
