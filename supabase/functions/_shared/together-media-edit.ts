import type{SupabaseClient}from'@supabase/supabase-js';
import{classifyMediaEditSemantics,MAX_MEDIA_EDIT_DEPTH,normalizeMediaEditInstruction,resolveMediaEditContentLevel}from'../../../packages/together-domain/src/media-edit.ts';
import{resolveCharacterMediaBoundaries,resolveMediaContentPolicy,type MediaContentLevel}from'../../../packages/together-domain/src/media-routing.ts';
import{spendCredits,refundCredits}from'./kivelle-subscription.ts';
import{configuredImageProvider}from'./together-media-base.ts';
import{track}from'./together.ts';
import{AppError}from'./types.ts';

const REAL_PERSON=/\b(celebrity|public figure|real person|look exactly like|face of|identical to)\b/i;
const NON_CONSENSUAL=/\b(non.?consensual|without (?:her|his|their) consent|secretly nude|revenge porn)\b/i;
const MINOR=/\b(minor|underage|schoolgirl|schoolboy|child)\b/i;

export async function queueMediaEdit(db:SupabaseClient,input:{userId:string;continuityId:string;sourceMedia:Record<string,unknown>;requestId:string;instruction:string}):Promise<{media:Record<string,unknown>;creditCost:number;creditBalance:Record<string,unknown>}>{
  const source=input.sourceMedia,instruction=normalizeMediaEditInstruction(input.instruction);
  if(!instruction)throw new AppError('VALIDATION_ERROR','Describe what you want changed in the photo.',400);
  if(source.media_type!=='image'||source.status!=='ready'||!source.storage_path)throw new AppError('CONFLICT','Only a completed companion photo can be edited.',409);
  const sourceMetadata=(source.metadata??{}) as Record<string,unknown>,depth=Number(sourceMetadata.editDepth??0)+1;
  if(depth>MAX_MEDIA_EDIT_DEPTH)throw new AppError('CONFLICT','This version has been refined several times. Start a new edit from an earlier version.',409);
  const requestKey=`edit:${source.id}:${input.requestId}`;
  const{data:existing}=await db.from('together_generated_media').select('*').eq('user_id',input.userId).eq('continuity_id',input.continuityId).eq('request_key',requestKey).maybeSingle();
  if(existing)return{media:existing,creditCost:Number((existing.metadata as Record<string,unknown>|null)?.creditCost??0),creditBalance:{}};
  const[{data:profile},{data:instance}]=await Promise.all([
    db.from('together_profiles').select('age_verified_at,content_preferences').eq('user_id',input.userId).maybeSingle(),
    db.from('together_character_instances').select('*,together_character_templates(age,metadata,content_boundaries),together_character_versions(content_boundaries)').eq('id',String(source.character_instance_id)).eq('user_id',input.userId).eq('continuity_id',input.continuityId).maybeSingle(),
  ]);
  if(!instance)throw new AppError('NOT_FOUND','That companion is unavailable in this Kivelle Life.',404);
  const template=(instance.together_character_templates??{}) as Record<string,unknown>,version=(instance.together_character_versions??{}) as Record<string,unknown>,preferences=(profile?.content_preferences??{}) as Record<string,unknown>;
  const sourceLevel=normalizeLevel(source.content_level),requestedLevel=resolveMediaEditContentLevel(sourceLevel,instruction),boundaries=resolveCharacterMediaBoundaries(version.content_boundaries,template.content_boundaries);
  const characterAllowsRequestedLevel=requestedLevel==='standard'?true:requestedLevel==='romance'?boundaries.allows_romance!==false:requestedLevel==='suggestive'?boundaries.allows_suggestive===true||boundaries.allows_mature===true:requestedLevel==='mature'?boundaries.allows_mature===true:boundaries.allows_explicit===true;
  const policy=resolveMediaContentPolicy({requestedLevel,source:'user_edit',automatic:false,ageVerified:Boolean(profile?.age_verified_at),characterAge:Number(template.age),fictionalCharacter:(template.metadata as Record<string,unknown>|undefined)?.fictional!==false,realPersonRequest:REAL_PERSON.test(instruction),nonConsensualRequest:NON_CONSENSUAL.test(instruction),minorRelatedRequest:MINOR.test(instruction),characterAllowsRequestedLevel,romanceEnabled:preferences.romanceEnabled!==false,suggestiveMediaEnabled:preferences.suggestiveMediaEnabled===true,matureMediaEnabled:preferences.matureMediaEnabled===true,explicitMediaEnabled:preferences.explicitMediaEnabled===true,adultVideoEnabled:preferences.adultVideoEnabled===true,mediaType:'image',adultMediaFeatureEnabled:envBoolean('KIVELLE_ADULT_MEDIA_ENABLED')});
  if(!policy.allowed)throw new AppError('FORBIDDEN',editPolicyMessage(policy.reasonCode),403);
  const charged=await spendCredits(db,{userId:input.userId,action:'photo_edit',idempotencyKey:`media-edit:${requestKey}`,referenceType:'generated_media',referenceId:String(source.id),metadata:{sourceMediaId:source.id,characterInstanceId:source.character_instance_id,requestId:input.requestId}});
  const semantics=classifyMediaEditSemantics(instruction),metadata={...sourceMetadata,source:'user_edit',generationKind:'photo_edit',parentMediaId:source.id,rootMediaId:String(sourceMetadata.rootMediaId??source.id),editDepth:depth,editSemantics:semantics,canonicality:semantics==='correction'?'canonical_visualization':'creative_derivative',editInstruction:instruction,generationIntent:{requestText:instruction,requestedContentLevel:requestedLevel},requestedContentLevel:requestedLevel,resolvedContentLevel:policy.resolvedLevel,mediaPolicyReason:policy.reasonCode,requestKey,creditTransactionId:charged.transactionId,creditCost:charged.cost,creditAction:'photo_edit',creditRefunded:false,qualityRetry:false,needsCredits:false};
  const row={user_id:input.userId,continuity_id:input.continuityId,character_instance_id:source.character_instance_id,conversation_id:source.conversation_id??null,message_id:source.message_id??null,life_event_id:source.life_event_id??null,date_session_id:source.date_session_id??null,moment_id:source.moment_id??null,story_arc_id:source.story_arc_id??null,scene_session_id:source.scene_session_id??null,scene_action_id:source.scene_action_id??null,shared_plan_id:source.shared_plan_id??null,world_id:source.world_id??null,location_id:source.location_id??null,parent_media_id:source.id,media_type:'image',content_level:policy.resolvedLevel,provider:configuredImageProvider()?.id??source.provider??null,status:'queued',request_key:requestKey,queue_priority:source.queue_priority??0,metadata};
  const{data:media,error}=await db.from('together_generated_media').insert(row).select('*').single();
  if(error||!media){await refundCredits(db,{userId:input.userId,transactionId:charged.transactionId,idempotencyKey:`refund:${charged.transactionId}`,metadata:{reason:'media_edit_queue_failed',sourceMediaId:source.id}});const{data:race}=await db.from('together_generated_media').select('*').eq('user_id',input.userId).eq('request_key',requestKey).maybeSingle();if(race)return{media:race,creditCost:Number((race.metadata as Record<string,unknown>|null)?.creditCost??charged.cost),creditBalance:charged.balance};throw new AppError('INTERNAL_ERROR','The photo edit could not be queued.',500,true);}
  await track(db,input.userId,'photo_edit_requested',{mediaId:media.id,sourceMediaId:source.id,characterInstanceId:source.character_instance_id,contentLevel:policy.resolvedLevel,editSemantics:semantics,creditCost:charged.cost});
  return{media,creditCost:charged.cost,creditBalance:charged.balance};
}

function normalizeLevel(value:unknown):MediaContentLevel{return['romance','suggestive','mature','explicit'].includes(String(value))?String(value) as MediaContentLevel:'standard';}
function envBoolean(name:string):boolean{return['1','true','yes','on'].includes(String(Deno.env.get(name)??'').toLowerCase());}
function editPolicyMessage(reason:string):string{
  if(reason==='age_verification_required'||reason==='adult_character_required')return'Adult media edits require a verified adult account and an adult fictional companion.';
  if(reason==='real_person_likeness')return'Real-person likeness edits are not available.';
  if(reason==='consent_boundary')return'That edit is outside Kivelle’s consent boundaries.';
  if(reason==='character_boundary')return'That edit is outside this companion’s media boundaries.';
  if(reason.endsWith('_disabled'))return'Enable the matching media preference before creating this edit.';
  return'That photo cannot be edited with the requested change.';
}
