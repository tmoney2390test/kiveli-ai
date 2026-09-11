import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { bucket, outputPath, sha256, verifyManifest } from './catalog-artwork.mjs';

// No key is accepted from app configuration or written to output. Invoke with
// existing authenticated release credentials in the process environment.
const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key) throw new Error('SUPABASE_URL and a server-only Supabase key are required');
if(new URL(url).hostname!=='mfysnlghlhxxcwnwpxog.supabase.co') throw new Error('Confirm the Kivelli production catalog target before publishing');
const manifest=await verifyManifest();
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:buckets,error:listError}=await db.storage.listBuckets();
if(listError)throw new Error(`Cannot inspect catalog bucket: ${listError.message}`);
const existing=buckets.find(item=>item.id===bucket);
if(existing && !existing.public) throw new Error('Refusing to make an existing private bucket public');
if(!existing) {
  const {error}=await db.storage.createBucket(bucket,{public:true,fileSizeLimit:2097152,allowedMimeTypes:['image/webp']});
  if(error)throw new Error(`Catalog bucket creation failed: ${error.message}`);
}
const entries=[...new Map(Object.values(manifest).flatMap(e=>[e.display,e.thumbnail]).map(e=>[e.file,e])).values()];
let next=0, uploaded=0, reused=0, verified=0;
await Promise.all(Array.from({length:6},async()=>{
  while(next<entries.length) {
    const entry=entries[next++];
    const bytes=await readFile(resolve(outputPath,entry.file));
    if(bytes.length!==entry.bytes || `${sha256(bytes)}.webp`!==entry.file.split('/')[1]) throw new Error('Catalog file integrity mismatch; regenerate before publishing');
    let success=false;
    for(let attempt=0;attempt<3;attempt++) {
      const {error}=await db.storage.from(bucket).upload(entry.file,bytes,{contentType:'image/webp',cacheControl:'31536000',upsert:false});
      if(!error){uploaded++;success=true;break;}
      if(/already exists|duplicate/i.test(error.message)){reused++;success=true;break;}
      if(!/429|5\d\d|timeout|fetch|network/i.test(`${error.statusCode} ${error.message}`)||attempt===2) throw new Error(`Catalog upload failed: ${error.message}`);
      await new Promise(r=>setTimeout(r,500*2**attempt));
    }
    if(!success)throw new Error('Catalog upload exhausted retries');
    for(let attempt=0;attempt<4;attempt++) {
      let response;
      try { response=await fetch(`${url}/storage/v1/object/public/${bucket}/${entry.file}`,{signal:AbortSignal.timeout(20000)}); }
      catch { if(attempt===3)throw new Error('Public catalog verification network timeout'); }
      if(response?.ok) {
        if(!response.headers.get('content-type')?.includes('image/webp')||sha256(Buffer.from(await response.arrayBuffer()))!==sha256(bytes)) throw new Error(`Catalog content integrity mismatch: ${entry.file}`);
        break;
      }
      const status=response?.status;
      await response?.body?.cancel();
      if(status&&!([404,429].includes(status)||status>=500))throw new Error(`Public catalog delivery rejected: ${status}`);
      if(attempt===3)throw new Error(`Public catalog delivery exhausted retries: ${status}`);
      await new Promise(r=>setTimeout(r,1000*2**attempt));
    }
    if(++verified%100===0)console.log(`Verified ${verified}/${entries.length} public display assets`);
  }
}));
console.log(JSON.stringify({bucket,uploaded,reused,verified,originalsChanged:false,privateBucketsChanged:false}));
