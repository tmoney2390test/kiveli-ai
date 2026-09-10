import {createClient} from '@supabase/supabase-js';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {discoverAssets} from './sync-kivelle-reference-media.ts';

execFileSync(process.execPath,['scripts/calders-art-review.mjs','check','--release'],{stdio:'inherit'});
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const assets=(await discoverAssets()).filter(a=>a.worldSlug==='calders-run');
const {data:references,error}=await db.from('together_media_reference_assets').select('*').in('source_key',assets.map(a=>a.sourceKey)).eq('active',true);
if(error)throw error;
if(references.length!==103)throw new Error(`Expected 103 active references; found ${references.length}`);
for(const asset of assets){
  const reference=references.find(r=>r.source_key===asset.sourceKey);
  if(!reference||reference.sha256!==createHash('sha256').update(readFileSync(asset.path)).digest('hex'))throw new Error(`Stored reference differs from reviewed artwork: ${asset.sourceKey}`);
}
for(const [bucket,refs] of Map.groupBy(references,r=>r.storage_bucket)){
  const signed=await db.storage.from(bucket).createSignedUrls(refs.map(r=>r.storage_path),60);
  if(signed.error)throw signed.error;
  for(let i=0;i<signed.data.length;i+=6){
    await Promise.all(signed.data.slice(i,i+6).map(async row=>{
      if(row.error||!row.signedUrl)throw new Error(`Stored reference is inaccessible: ${row.path}`);
      const response=await fetch(row.signedUrl,{method:'HEAD'});
      if(!response.ok||!response.headers.get('content-type')?.startsWith('image/'))throw new Error(`Reference does not serve an image: ${row.path}`);
    }));
  }
}
const world='31740169-035e-5b10-8c9d-98b206e9f24b';
const bind=`begin;
update together_character_versions v set visual_identity=v.visual_identity||jsonb_build_object('referenceStoragePaths',jsonb_build_array(a.storage_path),'status','reference_ready','referenceOrigin','generated_fictional','adultMediaReferenceEligible',true),appearance_config=v.appearance_config||jsonb_build_object('photoStatus','ready','portraitStatus','reference_ready','referenceStoragePath',a.storage_path),portrait_asset_key=t.slug
from together_character_templates t,together_media_reference_assets a where v.character_template_id=t.id and v.life_config->>'source'='calders_run_authoring_v1' and a.character_version_id=v.id and a.asset_role='character_identity' and a.active and a.source_key='character:'||t.slug||':identity';
update together_character_templates set discovery_metadata=discovery_metadata||'{"portraitStatus":"ready"}'::jsonb where discovery_metadata->>'source'='calders_run_authoring_v1';
update together_locations set metadata=metadata||'{"assetStatus":"ready","photoStatus":"ready"}'::jsonb where world_id='${world}';
update together_worlds set metadata=metadata||'{"assetStatus":"ready","photoStatus":"hero_ready","locationPhotoStatus":"ready","residentPortraitStatus":"primary_portraits_ready","mappedResidentPortraitCount":49,"mappedLocationPhotoCount":53,"reviewedArtworkCount":152,"railwayBridgePhotoCount":6}'::jsonb where id='${world}';
commit;
`;
writeFileSync('../calders-bind-media.sql',bind);
console.log(JSON.stringify({verifiedReferences:references.length,storage:'all accessible',bindingSql:'../calders-bind-media.sql',published:false}));
