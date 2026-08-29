import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { resolveXaiVoiceId } from '../packages/together-domain/src/voice-provider-mapping.ts';
import type { CompanionVoiceProfile } from '../packages/together-domain/src/multimodal.ts';

const url=process.env.SUPABASE_URL?.trim();
const key=(process.env.SUPABASE_SECRET_KEY??process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
const auditEmail=(process.env.KIVELLE_VOICE_AUDIT_USER_EMAIL??'test7@test.com').trim().toLowerCase();
if(!url||!key)throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');

const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const startedAt=new Date().toISOString();

type Json=Record<string,unknown>;
type Template={id:string;name:string;slug:string;current_published_version:number;published:boolean;can_be_selected:boolean;creator_id:string|null;lifecycle_status:string;visibility:string};
type Version={id:string;character_template_id:string;version:number};
type VoiceProfile={character_template_id:string;voice_key:string;characteristics:Json;provider_mappings:Json;active:boolean};
type Instance={id:string;character_template_id:string;character_version_id:string;continuity_id:string};
type Conversation={id:string;character_instance_id:string;continuity_id:string};
type SmokeTarget={voiceId:string;template:Template;instance:Instance;conversation:Conversation;createdForAudit:boolean};

async function findUser(email:string):Promise<User>{
  for(let page=1;page<=20;page+=1){
    const{data,error}=await db.auth.admin.listUsers({page,perPage:1000});
    if(error)throw error;
    const match=data.users.find((user)=>user.email?.toLowerCase()===email);
    if(match)return match;
    if(data.users.length<1000)break;
  }
  throw new Error('The configured production voice-audit account was not found.');
}

async function auditAccessToken(email:string):Promise<string>{
  const{data,error}=await db.auth.admin.generateLink({type:'magiclink',email});
  if(error||!data.properties?.hashed_token)throw error??new Error('Could not create the audit session.');
  const verifier=createClient(url!,key!,{auth:{persistSession:false,autoRefreshToken:false}});
  const verified=await verifier.auth.verifyOtp({type:'magiclink',token_hash:data.properties.hashed_token});
  if(verified.error||!verified.data.session?.access_token)throw verified.error??new Error('Could not verify the audit session.');
  return verified.data.session.access_token;
}

async function edge<T>(functionName:string,accessToken:string,body:Json):Promise<T>{
  const response=await fetch(`${url}/functions/v1/${functionName}`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,apikey:key!,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`${functionName} ${response.status}: ${String(payload?.error?.message??payload?.message??'request failed')}`);
  return payload.data as T;
}

async function forcePreview(target:SmokeTarget,accessToken:string){
  const folder=`${auditUser.id}/voice-previews/${target.instance.id}/v1`;
  await db.storage.from('together-user-media').remove([`${folder}/default.mp3`,`${folder}/default.wav`]);
  const result=await edge<{preview:{signedUrl:string;durationMs:number;contentType:string;cached:boolean}}>('together-multimodal',accessToken,{action:'preview_voice',conversationId:target.conversation.id,voicePreset:null,requestId:crypto.randomUUID()});
  if(result.preview.cached)throw new Error(`${target.voiceId}: preview unexpectedly used a cache entry.`);
  await assertPlayable(result.preview.signedUrl,result.preview.contentType);
  return{voiceId:target.voiceId,route:'preview',characterSlug:target.template.slug,durationMs:result.preview.durationMs,contentType:result.preview.contentType,cached:result.preview.cached,createdCompanionForAudit:target.createdForAudit};
}

async function forceCanonicalVoiceNote(target:SmokeTarget,accessToken:string){
  const{data:messages,error}=await db.from('together_messages').select('id').eq('user_id',auditUser.id).eq('conversation_id',target.conversation.id).eq('role','assistant').order('created_at',{ascending:false}).limit(100);
  if(error)throw error;
  const messageIds=(messages??[]).map((item)=>String(item.id));
  const{data:used}=messageIds.length?await db.from('together_generated_media').select('message_id').eq('user_id',auditUser.id).eq('media_type','voice_note').in('message_id',messageIds):{data:[]};
  const usedIds=new Set((used??[]).map((item)=>String(item.message_id)));
  const messageId=messageIds.find((id)=>!usedIds.has(id));
  if(!messageId)throw new Error(`${target.voiceId}: no unused assistant message was available for the canonical insertion smoke test.`);
  const quote=await edge<{creditCost:number;creditBalance:number;canAfford:boolean}>('together-multimodal',accessToken,{action:'voice_note_quote',messageId});
  if(!quote.canAfford)throw new Error('The audit account does not have enough credits for one voice-note smoke test.');
  const result=await edge<{media:Json}>('together-multimodal',accessToken,{action:'request_voice_note',messageId,requestId:crypto.randomUUID()});
  const media=result.media;
  if(media.status!=='ready'||typeof media.signed_url!=='string')throw new Error(`${target.voiceId}: canonical voice note did not become ready.`);
  const subjects=Array.isArray(media.subject_character_instance_ids)?media.subject_character_instance_ids:[];
  if(subjects.length!==1||subjects[0]!==target.instance.id)throw new Error(`${target.voiceId}: canonical media subject roster is invalid.`);
  const metadata=record(media.metadata);
  if(String(metadata.voiceId??'').toLowerCase()!==target.voiceId.toLowerCase())throw new Error(`${target.voiceId}: provider returned a different voice (${String(metadata.voiceId??'unknown')}).`);
  await assertPlayable(String(media.signed_url),String(media.content_type??'audio/mpeg'));
  return{voiceId:target.voiceId,route:'canonical_voice_note',characterSlug:target.template.slug,mediaId:String(media.id),durationMs:Number(media.duration_ms??0),contentType:String(media.content_type??''),creditCost:quote.creditCost,createdCompanionForAudit:target.createdForAudit};
}

async function assertPlayable(signedUrl:string,contentType:string):Promise<void>{
  const response=await fetch(signedUrl,{headers:{Range:'bytes=0-63'}}),bytes=new Uint8Array(await response.arrayBuffer());
  if(!response.ok||bytes.length<4)throw new Error('Generated audio could not be retrieved.');
  const prefix=String.fromCharCode(...bytes.slice(0,4));
  const valid=contentType.includes('wav')?prefix==='RIFF':prefix.startsWith('ID3')||(bytes[0]===0xff&&[0xfb,0xf3,0xf2].includes(bytes[1]??0));
  if(!valid)throw new Error(`Generated audio has an invalid ${contentType} signature.`);
}

function record(value:unknown):Json{return value&&typeof value==='object'&&!Array.isArray(value)?value as Json:{};}

const auditUser=await findUser(auditEmail);
const accessToken=await auditAccessToken(auditEmail);
const[{data:profile,error:profileError},{data:templates,error:templateError},{data:versions,error:versionError},{data:profiles,error:voiceError}]=await Promise.all([
  db.from('together_profiles').select('active_continuity_id').eq('user_id',auditUser.id).single(),
  db.from('together_character_templates').select('id,name,slug,current_published_version,published,can_be_selected,creator_id,lifecycle_status,visibility').eq('can_be_selected',true),
  db.from('together_character_versions').select('id,character_template_id,version'),
  db.from('together_character_voice_profiles').select('character_template_id,voice_key,characteristics,provider_mappings,active').eq('active',true),
]);
if(profileError||templateError||versionError||voiceError)throw profileError??templateError??versionError??voiceError;
const continuityId=String(profile.active_continuity_id??'');
if(!continuityId)throw new Error('The audit account does not have an active continuity.');
const auditable=((templates??[]) as Template[]).filter((item)=>(
  item.creator_id===null&&item.published&&item.lifecycle_status==='published'&&['public','unlisted'].includes(item.visibility)
)||(
  item.creator_id!==null&&['ready','published'].includes(item.lifecycle_status)
));
const allVersions=(versions??[]) as Version[],voiceProfiles=(profiles??[]) as VoiceProfile[];
const versionByTemplate=new Map(allVersions.map((item)=>[`${item.character_template_id}:${item.version}`,item]));
const profileByTemplate=new Map(voiceProfiles.map((item)=>[item.character_template_id,item]));
const candidates=auditable.flatMap((template)=>{const version=versionByTemplate.get(`${template.id}:${template.current_published_version}`),profile=profileByTemplate.get(template.id);if(!version||!profile)return[];const voice:CompanionVoiceProfile={characterTemplateId:template.id,voiceKey:profile.voice_key,characteristics:profile.characteristics as CompanionVoiceProfile['characteristics'],providerMappings:profile.provider_mappings as Record<string,string>};return[{template,version,voiceId:resolveXaiVoiceId(voice)}];});
const builtInVoiceIds=[...new Set(candidates.filter((item)=>['ara','eve','leo','rex','sal'].includes(item.voiceId.toLowerCase())).map((item)=>item.voiceId))].sort();
const targetSpecs=[
  ...builtInVoiceIds.map((voiceId)=>({voiceId,candidates:candidates.filter((item)=>item.voiceId===voiceId)})),
  ...candidates.filter((item)=>!['ara','eve','leo','rex','sal'].includes(item.voiceId.toLowerCase())).map((item)=>({voiceId:item.voiceId,candidates:[item]})),
];
const[{data:existingInstances,error:instanceError},{data:existingConversations,error:conversationError}]=await Promise.all([
  db.from('together_character_instances').select('id,character_template_id,character_version_id,continuity_id').eq('user_id',auditUser.id).eq('continuity_id',continuityId),
  db.from('together_conversations').select('id,character_instance_id,continuity_id').eq('user_id',auditUser.id).eq('continuity_id',continuityId).is('user_archived_at',null).is('archived_at',null).in('kind',['direct','first_meeting']).order('created_at',{ascending:false}),
]);
if(instanceError||conversationError)throw instanceError??conversationError;
const instanceByTemplate=new Map(((existingInstances??[]) as Instance[]).map((item)=>[item.character_template_id,item]));
const conversationByInstance=new Map(((existingConversations??[]) as Conversation[]).map((item)=>[item.character_instance_id,item]));
const targets:SmokeTarget[]=[];
for(const spec of targetSpecs){
  const voiceId=spec.voiceId;
  const options=[...spec.candidates].sort((left,right)=>Number(instanceByTemplate.has(right.template.id))-Number(instanceByTemplate.has(left.template.id)));
  let selected=options.find((item)=>{const instance=instanceByTemplate.get(item.template.id);return Boolean(instance&&conversationByInstance.get(instance.id));})??options[0];
  if(!selected)throw new Error(`${voiceId}: no published companion uses this voice.`);
  let instance=instanceByTemplate.get(selected.template.id),createdForAudit=false;
  if(!instance){
    await edge('together-companion',accessToken,{action:'meet',characterTemplateId:selected.template.id,source:'discover_profile'});
    const{data,error}=await db.from('together_character_instances').select('id,character_template_id,character_version_id,continuity_id').eq('user_id',auditUser.id).eq('continuity_id',continuityId).eq('character_template_id',selected.template.id).single();
    if(error||!data)throw error??new Error(`${voiceId}: audit companion instance was not created.`);
    instance=data as Instance;createdForAudit=true;instanceByTemplate.set(selected.template.id,instance);
  }
  let conversation=conversationByInstance.get(instance.id);
  if(!conversation){
    const ensured=await edge<Conversation>('together-conversation',accessToken,{action:'ensure',characterInstanceId:instance.id});
    conversation=ensured;conversationByInstance.set(instance.id,conversation);
  }
  targets.push({voiceId,template:selected.template,instance,conversation,createdForAudit});
}

const canonicalTarget=targets.find((target)=>!target.createdForAudit)??targets[0];
if(!canonicalTarget)throw new Error('No production voice targets were resolved.');
const results=[] as Json[];
results.push(await forceCanonicalVoiceNote(canonicalTarget,accessToken));
for(const target of targets)if(target.voiceId!==canonicalTarget.voiceId)results.push(await forcePreview(target,accessToken));

const{data:usage,error:usageError}=await db.from('together_voice_usage_events').select('status,character_count,estimated_cost_usd,latency_ms,provider,model').eq('user_id',auditUser.id).eq('usage_kind','voice_note').gte('occurred_at',startedAt).order('occurred_at',{ascending:true});
if(usageError)throw usageError;
const usageRows=usage??[],estimatedCostUsd=usageRows.reduce((sum,item)=>sum+Number(item.estimated_cost_usd??0),0);
console.log(JSON.stringify({
  auditedAt:new Date().toISOString(),
  auditAccount:'configured test account',
  expectedVoiceIds:targetSpecs.map((item)=>item.voiceId),
  customVoiceCount:targetSpecs.filter((item)=>!['ara','eve','leo','rex','sal'].includes(item.voiceId.toLowerCase())).length,
  synthesisResults:results,
  usage:{events:usageRows.length,successful:usageRows.filter((item)=>item.status==='success').length,failed:usageRows.filter((item)=>item.status==='failure').length,characterCount:usageRows.reduce((sum,item)=>sum+Number(item.character_count??0),0),estimatedCostUsd:Math.round(estimatedCostUsd*1_000_000)/1_000_000},
},null,2));

if(results.length!==targetSpecs.length||usageRows.some((item)=>item.status!=='success'))process.exitCode=1;
