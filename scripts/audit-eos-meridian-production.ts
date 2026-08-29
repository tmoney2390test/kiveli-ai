import { createClient } from '@supabase/supabase-js';
import { XAI_BUILT_IN_VOICES, resolveXaiVoiceId } from '../packages/together-domain/src/voice-provider-mapping.ts';
import type { CompanionVoiceProfile } from '../packages/together-domain/src/multimodal.ts';
import { characters } from './eos-meridian-content.mjs';

const url=process.env.SUPABASE_URL?.trim(),key=(process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
if(!url||!key)throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),worldId='10000000-0000-4000-8000-000000000012';
const templateIds=characters.map((item)=>item.templateId),versionIds=characters.map((item)=>item.versionId);

async function allRows<T>(table:string,columns:string,apply?:(query:any)=>any):Promise<T[]>{
  const rows:T[]=[];
  for(let from=0;;from+=1000){let query=db.from(table).select(columns).range(from,from+999);if(apply)query=apply(query);const{data,error}=await query;if(error)throw new Error(`${table}: ${error.message}`);rows.push(...((data??[])as T[]));if((data??[]).length<1000)return rows;}
}
function requireCondition(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}

const[worldRows,locations,templates,versions,presences,voices,schedules,edges,identityReferences,worldReferences]=await Promise.all([
  allRows<any>('together_worlds','id,slug,published',query=>query.eq('id',worldId)),
  allRows<any>('together_locations','id,slug,world_id',query=>query.eq('world_id',worldId)),
  allRows<any>('together_character_templates','id,name,slug,age,published,can_be_selected,can_be_romanced,current_published_version,first_meeting',query=>query.in('id',templateIds)),
  allRows<any>('together_character_versions','id,character_template_id,version,visual_identity,voice_config,content_boundaries,published_at',query=>query.in('id',versionIds)),
  allRows<any>('together_character_world_presence','character_version_id,world_id,presence_type',query=>query.in('character_version_id',versionIds).eq('presence_type','resident')),
  allRows<any>('together_character_voice_profiles','character_template_id,voice_key,characteristics,provider_mappings,active',query=>query.in('character_template_id',templateIds).eq('active',true)),
  allRows<any>('together_schedule_templates','character_version_id,day_of_week,start_minute,end_minute,location_id',query=>query.in('character_version_id',versionIds)),
  allRows<any>('together_character_relationship_edges','source_template_id,target_template_id,world_id',query=>query.eq('world_id',worldId)),
  allRows<any>('together_media_reference_assets','id,character_version_id,storage_bucket,storage_path,asset_role,active',query=>query.in('character_version_id',versionIds).eq('asset_role','character_identity').eq('active',true)),
  allRows<any>('together_media_reference_assets','id,world_id,storage_bucket,storage_path,asset_role,active',query=>query.eq('world_id',worldId).eq('asset_role','world_canonical').eq('active',true)),
]);

requireCondition(worldRows.length===1&&worldRows[0].slug==='eos-meridian'&&worldRows[0].published,'Eos Meridian is not published exactly once.');
requireCondition(locations.length===54,'Eos Meridian must expose 54 canonical locations.');
requireCondition(templates.length===47&&versions.length===47,'Eos Meridian must expose 47 current companions and versions.');
requireCondition(templates.every((item)=>item.age>=18&&item.published&&item.can_be_selected&&item.can_be_romanced&&item.current_published_version===1),'An Eos companion is not an adult playable published companion.');
const locationIds=new Set(locations.map((item)=>String(item.id))),templateIdSet=new Set(templateIds);
const locationReferences=await allRows<any>(
  'together_media_reference_assets',
  'id,location_id,storage_bucket,storage_path,asset_role,active',
  query=>query.in('location_id',[...locationIds]).eq('asset_role','location_canonical').eq('active',true),
);
requireCondition(templates.every((item)=>locationIds.has(String(item.first_meeting?.location_id))&&!/\b(?:she|he|they) routine\b/i.test(String(item.first_meeting?.opener??''))),'An Eos first meeting is missing, outside the world, or grammatically stale.');
requireCondition(versions.every((item)=>item.published_at&&item.visual_identity?.fictional===true&&String(item.visual_identity?.canonicalDescription??'').trim()&&item.content_boundaries?.allows_romance===true&&item.content_boundaries?.allows_explicit===true),'An Eos version is not ready for relationship-aware image generation.');

const presenceByVersion=Map.groupBy(presences,(item)=>String(item.character_version_id));
requireCondition(versionIds.every((id)=>presenceByVersion.get(id)?.length===1&&String(presenceByVersion.get(id)?.[0]?.world_id)===worldId),'An Eos companion lacks exactly one resident-world record required by group chat.');
const voiceByTemplate=new Map(voices.map((item)=>[String(item.character_template_id),item]));
const resolvedVoices=characters.map((character)=>{const row=voiceByTemplate.get(character.templateId);requireCondition(row,`Missing voice profile for ${character.slug}.`);const profile:CompanionVoiceProfile={characterTemplateId:character.templateId,voiceKey:String(row.voice_key),characteristics:row.characteristics??{},providerMappings:row.provider_mappings??{}};return{slug:character.slug,voiceId:resolveXaiVoiceId(profile)};});
requireCondition(resolvedVoices.every((item)=>(XAI_BUILT_IN_VOICES as readonly string[]).includes(item.voiceId)),'An Eos voice does not resolve to a supported production xAI voice.');
requireCondition(new Set(resolvedVoices.map((item)=>item.voiceId)).size===5,'Eos voice assignments unexpectedly collapsed to too few voices.');

const schedulesByVersion=Map.groupBy(schedules,(item)=>String(item.character_version_id));
requireCondition(versionIds.every((id)=>{const rows=schedulesByVersion.get(id)??[];return rows.length===42&&new Set(rows.map((row)=>row.day_of_week)).size===7&&rows.every((row)=>!row.location_id||locationIds.has(String(row.location_id)));}),'An Eos schedule is incomplete or references another world.');
requireCondition(new Set(edges.map((item)=>String(item.source_template_id)).filter((id)=>templateIdSet.has(id))).size===47,'An Eos companion is absent from the group-dialogue social graph.');

const identityByVersion=Map.groupBy(identityReferences,(item)=>String(item.character_version_id)),locationReferenceIds=new Set(locationReferences.map((item)=>String(item.location_id)));
requireCondition(versionIds.every((id)=>Boolean(identityByVersion.get(id)?.length)),'An Eos companion lacks the canonical reference required for single or group photos.');
requireCondition(locations.every((item)=>locationReferenceIds.has(String(item.id))),'An Eos venue lacks an exact server-side location reference.');
requireCondition(worldReferences.length>=1,'Eos Meridian lacks a canonical world reference.');

const allReferences=[...identityReferences,...locationReferences,...worldReferences],uniqueStorage=[...new Map(allReferences.map((item)=>[`${item.storage_bucket}:${item.storage_path}`,item])).values()];
const byBucket=Map.groupBy(uniqueStorage,(item)=>String(item.storage_bucket));
let playableReferenceFiles=0;
for(const[bucket,items]of byBucket){const{data,error}=await db.storage.from(bucket).createSignedUrls(items.map((item)=>String(item.storage_path)),90);if(error||!data)throw new Error(`Eos reference signing failed for ${bucket}.`);for(const result of data){requireCondition(!result.error&&result.signedUrl,'An Eos canonical reference could not be signed.');const response=await fetch(result.signedUrl,{headers:{Range:'bytes=0-31'}});requireCondition(response.ok,'An Eos canonical reference could not be fetched.');playableReferenceFiles+=1;}}

console.log(JSON.stringify({world:'eos-meridian',calls:{voiceProfiles:voices.length,supportedVoices:[...new Set(resolvedVoices.map((item)=>item.voiceId))].sort()},images:{characterReferences:identityReferences.length,locationReferences:locationReferences.length,worldReferences:worldReferences.length,uniqueFilesProbed:playableReferenceFiles,groupPhotoSubjectLimit:2},groups:{residentCompanions:presences.length,socialEdges:edges.length},continuity:{firstMeetings:templates.length,scheduleBlocks:schedules.length},ready:true}));
