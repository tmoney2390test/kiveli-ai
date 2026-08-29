import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { deriveCompanionVoiceProfile, type CompanionVoiceProfile } from '../packages/together-domain/src/multimodal.ts';
import { isBuiltInXaiVoice, resolveXaiVoiceId, XAI_BUILT_IN_VOICES } from '../packages/together-domain/src/voice-provider-mapping.ts';
import { buildVoiceNoteMediaMutation } from '../supabase/functions/_shared/voice-note-media.ts';

const url = process.env.SUPABASE_URL?.trim();
const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const builtIns = new Set<string>(XAI_BUILT_IN_VOICES);

type Json = Record<string, unknown>;
type Template = { id:string; name:string; slug:string; creator_id:string|null; current_published_version:number; published:boolean; can_be_selected:boolean; lifecycle_status:string; visibility:string; public_handle:string|null };
type Version = { id:string; character_template_id:string; version:number; personality_config:Json|null; communication_style:Json|null; visual_identity:Json|null };
type VoiceProfileRow = { id:string; character_template_id:string; voice_key:string; characteristics:Json|null; provider_mappings:Json|null; active:boolean; metadata:Json|null };
type Reference = { id:string; character_version_id:string|null; storage_bucket:string; storage_path:string; asset_role:string; active:boolean };
type Instance = { id:string; user_id:string; continuity_id:string; character_template_id:string; character_version_id:string };
type VoiceMedia = { id:string; user_id:string; character_instance_id:string; subject_character_instance_ids:string[]|null; storage_path:string|null; content_type:string|null; metadata:Json|null; created_at:string };

async function allRows<T>(table:string, columns:string, apply?:(query:any)=>any):Promise<T[]> {
  const rows:T[]=[];
  for(let from=0;;from+=1000){
    let query=db.from(table).select(columns).range(from,from+999);
    if(apply)query=apply(query);
    const{data,error}=await query;
    if(error)throw new Error(`${table}: ${error.message}`);
    rows.push(...((data??[]) as T[]));
    if((data??[]).length<1000)return rows;
  }
}

function relationPaths(version:Version):string[]{
  const paths=version.visual_identity?.referenceStoragePaths;
  return Array.isArray(paths)?paths.filter((item):item is string=>typeof item==='string'&&item.trim().length>0):[];
}

function profileFor(template:Template,version:Version,row?:VoiceProfileRow):CompanionVoiceProfile{
  if(row)return{characterTemplateId:template.id,voiceKey:row.voice_key,characteristics:(row.characteristics??{}) as CompanionVoiceProfile['characteristics'],providerMappings:(row.provider_mappings??{}) as Record<string,string>};
  return deriveCompanionVoiceProfile({characterTemplateId:template.id,publicHandle:template.public_handle,slug:template.slug,personality:version.personality_config??{},communicationStyle:version.communication_style??{}});
}

async function signedReferenceFailures(references:Reference[]):Promise<string[]>{
  const failed:string[]=[];
  const byBucket=Map.groupBy(references,(reference)=>reference.storage_bucket);
  for(const[bucket,items]of byBucket){
    for(let index=0;index<items.length;index+=100){
      const batch=items.slice(index,index+100),{data,error}=await db.storage.from(bucket).createSignedUrls(batch.map((item)=>item.storage_path),60);
      if(error||!data){failed.push(...batch.map((item)=>item.id));continue;}
      data.forEach((result,resultIndex)=>{if(result.error||!result.signedUrl)failed.push(batch[resultIndex]!.id);});
    }
  }
  return failed;
}

async function auditExistingAudio(media:VoiceMedia[]){
  const missingSubject=media.filter((item)=>!item.subject_character_instance_ids?.includes(item.character_instance_id)).map((item)=>item.id);
  const missingPath=media.filter((item)=>!item.storage_path).map((item)=>item.id);
  const signable=media.filter((item):item is VoiceMedia&{storage_path:string}=>Boolean(item.storage_path));
  const signedFailures:string[]=[];
  const signedById=new Map<string,string>();
  for(let index=0;index<signable.length;index+=100){
    const batch=signable.slice(index,index+100),{data,error}=await db.storage.from('together-user-media').createSignedUrls(batch.map((item)=>item.storage_path),90);
    if(error||!data){signedFailures.push(...batch.map((item)=>item.id));continue;}
    data.forEach((result,resultIndex)=>{const item=batch[resultIndex]!;if(result.error||!result.signedUrl)signedFailures.push(item.id);else signedById.set(item.id,result.signedUrl);});
  }
  const probeCandidates=signable.filter((item)=>signedById.has(item.id));
  const probeFailures:string[]=[];
  for(const item of probeCandidates){
    try{
      const response=await fetch(signedById.get(item.id)!,{headers:{Range:'bytes=0-63'}});
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(!response.ok||!looksLikeAudio(bytes,item.content_type))probeFailures.push(item.id);
    }catch{probeFailures.push(item.id);}
  }
  return{readyAudio:media.length,missingSubjectRoster:missingSubject,missingStoragePath:missingPath,unsignedAudio:signedFailures,playbackFilesProbed:probeCandidates.length,playbackProbeFailures:probeFailures};
}

function looksLikeAudio(bytes:Uint8Array,contentType:string|null):boolean{
  if(bytes.length<4)return false;
  const prefix=String.fromCharCode(...bytes.slice(0,4));
  if(contentType?.includes('wav'))return prefix==='RIFF';
  return prefix.startsWith('ID3')||(bytes[0]===0xff&&[0xfb,0xf3,0xf2].includes(bytes[1]??0));
}

const[templates,versions,profiles,references,instances,readyAudio]=await Promise.all([
  allRows<Template>('together_character_templates','id,name,slug,creator_id,current_published_version,published,can_be_selected,lifecycle_status,visibility,public_handle'),
  allRows<Version>('together_character_versions','id,character_template_id,version,personality_config,communication_style,visual_identity'),
  allRows<VoiceProfileRow>('together_character_voice_profiles','id,character_template_id,voice_key,characteristics,provider_mappings,active,metadata'),
  allRows<Reference>('together_media_reference_assets','id,character_version_id,storage_bucket,storage_path,asset_role,active'),
  allRows<Instance>('together_character_instances','id,user_id,continuity_id,character_template_id,character_version_id'),
  allRows<VoiceMedia>('together_generated_media','id,user_id,character_instance_id,subject_character_instance_ids,storage_path,content_type,metadata,created_at',(query)=>query.eq('media_type','voice_note').eq('status','ready')),
]);

const templateById=new Map(templates.map((item)=>[item.id,item])),versionById=new Map(versions.map((item)=>[item.id,item]));
const activeProfiles=profiles.filter((item)=>item.active),profileByTemplate=new Map(activeProfiles.map((item)=>[item.character_template_id,item]));
const official=templates.filter((item)=>item.creator_id===null&&item.published&&item.can_be_selected&&item.lifecycle_status==='published'&&['public','unlisted'].includes(item.visibility));
const auditable=templates.filter((item)=>item.can_be_selected&&(
  (item.creator_id===null&&item.published&&item.lifecycle_status==='published'&&['public','unlisted'].includes(item.visibility))||
  (item.creator_id!==null&&['ready','published'].includes(item.lifecycle_status))
));
const currentVersions=auditable.map((template)=>versions.find((version)=>version.character_template_id===template.id&&version.version===template.current_published_version)).filter((item):item is Version=>Boolean(item));
const currentVersionByTemplate=new Map(currentVersions.map((item)=>[item.character_template_id,item]));
const activeIdentityReferences=references.filter((item)=>item.active&&item.asset_role==='character_identity'&&Boolean(item.character_version_id));
const referencesByVersion=Map.groupBy(activeIdentityReferences,(item)=>String(item.character_version_id));
const missingVersion=auditable.filter((item)=>!currentVersionByTemplate.has(item.id));
const missingVoiceProfile=auditable.filter((item)=>!profileByTemplate.has(item.id));
const missingReference=auditable.filter((template)=>{const version=currentVersionByTemplate.get(template.id);return !version||(!(referencesByVersion.get(version.id)?.length)&&!relationPaths(version).length);});
const invalidInstance=instances.filter((item)=>!templateById.has(item.character_template_id)||!versionById.has(item.character_version_id)||versionById.get(item.character_version_id)?.character_template_id!==item.character_template_id);
const instanceVersionWithoutReference=[...new Set(instances.map((item)=>item.character_version_id))].filter((versionId)=>{const version=versionById.get(versionId);return !version||(!(referencesByVersion.get(versionId)?.length)&&!relationPaths(version).length);});
const resolved=auditable.flatMap((template)=>{const version=currentVersionByTemplate.get(template.id);if(!version)return[];const profile=profileFor(template,version,profileByTemplate.get(template.id)),first=resolveXaiVoiceId(profile),second=resolveXaiVoiceId(profile);return[{templateId:template.id,name:template.name,slug:template.slug,voiceId:first,customVoice:!isBuiltInXaiVoice(first),deterministic:first===second,explicitMapping:typeof profile.providerMappings?.xai==='string'&&Boolean(profile.providerMappings.xai.trim())}];});
const invalidMappings=resolved.filter((item)=>!item.voiceId||!item.deterministic);
const uniqueBuiltInVoices=[...new Set(resolved.filter((item)=>!item.customVoice).map((item)=>item.voiceId))].sort();
const customVoices=resolved.filter((item)=>item.customVoice).map((item)=>({templateId:item.templateId,slug:item.slug,voiceId:item.voiceId}));
const mutationFailures=instances.slice(0,Math.max(1,Math.min(instances.length,100))).filter((instance)=>{
  const row=buildVoiceNoteMediaMutation({id:crypto.randomUUID(),userId:instance.user_id,continuityId:instance.continuity_id,characterInstanceId:instance.id,conversationId:crypto.randomUUID(),messageId:crypto.randomUUID(),requestKey:`audit:${crypto.randomUUID()}`,provider:'xai',canonicalText:'Voice audit.',attemptNumber:1,metadata:{source:'production_audit'}});
  return row.subject_character_instance_ids.length!==1||row.subject_character_instance_ids[0]!==instance.id;
}).map((item)=>item.id);
const[unavailableReferences,audio]=await Promise.all([signedReferenceFailures(activeIdentityReferences),auditExistingAudio(readyAudio)]);

const report={
  auditedAt:new Date().toISOString(),
  scope:{officialPublishedCompanions:official.length,customSelectableCompanions:auditable.length-official.length,auditedCompanions:auditable.length,currentPublishedVersions:currentVersions.length,existingCharacterInstances:instances.length,readyVoiceNotes:readyAudio.length},
  voiceProfiles:{activeProfiles:activeProfiles.length,missing:missingVoiceProfile.map((item)=>`${item.name} (${item.slug})`),invalidMappings:invalidMappings.map((item)=>item.slug),uniqueBuiltInVoices,customVoices,allFallbacksDeterministic:resolved.every((item)=>item.deterministic),withoutExplicitXaiMapping:resolved.filter((item)=>!item.explicitMapping).map((item)=>item.slug)},
  identity:{missingPublishedVersion:missingVersion.map((item)=>item.slug),missingCanonicalReference:missingReference.map((item)=>item.slug),unavailableReferenceAssetIds:unavailableReferences,invalidCharacterInstanceIds:invalidInstance.map((item)=>item.id),instanceVersionWithoutReference},
  mediaInsertion:{mutationShapesChecked:Math.min(instances.length,100),mutationFailures},
  existingAudio:audio,
  liveSmokePlan:{builtInVoices:uniqueBuiltInVoices,customVoices:customVoices.map((item)=>({slug:item.slug,voiceId:item.voiceId})),expectedSyntheses:uniqueBuiltInVoices.length+customVoices.length},
};
console.log(JSON.stringify(report,null,2));

const failed=missingVersion.length||missingVoiceProfile.length||missingReference.length||unavailableReferences.length||invalidInstance.length||instanceVersionWithoutReference.length||invalidMappings.length||mutationFailures.length||audio.missingSubjectRoster.length||audio.missingStoragePath.length||audio.unsignedAudio.length||audio.playbackProbeFailures.length;
if(failed)process.exitCode=1;
