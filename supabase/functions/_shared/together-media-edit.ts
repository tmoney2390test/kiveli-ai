import type{SupabaseClient}from'@supabase/supabase-js';
import{classifyMediaEditSemantics,MAX_MEDIA_EDIT_DEPTH,normalizeMediaEditInstruction,resolveMediaEditContentLevel}from'../../../packages/together-domain/src/media-edit.ts';
import{resolveCharacterMediaBoundaries,resolveMediaContentPolicy,type MediaContentLevel}from'../../../packages/together-domain/src/media-routing.ts';
import{spendCredits,refundCredits}from'./kivelle-subscription.ts';
import{configuredImageProvider,snapshotReferenceAssets}from'./together-media-base.ts';
import{configuredGroupImageRouteAvailable}from'./together-media-providers.ts';
import{track}from'./together.ts';
import{AppError}from'./types.ts';
import{isFictionalCompanion}from'./together-media-character.ts';
import{loadValidatedMediaSubjects,normalizeMediaSubjectIds}from'./together-media-subjects.ts';
import{resolveCanonicalMediaWorld}from'./together-media-world.ts';
import{placeContextSnapshot,resolvePlaceContext}from'./together-place.ts';
import{resolveProductionSafePhotoRequest}from'../../../packages/together-domain/src/media.ts';

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
  const subjectIds=normalizeMediaSubjectIds(String(source.character_instance_id),source.subject_character_instance_ids),[{data:profile},subjects]=await Promise.all([
    db.from('together_profiles').select('age_verified_at,content_preferences').eq('user_id',input.userId).maybeSingle(),
    loadValidatedMediaSubjects(db,{userId:input.userId,characterInstanceId:String(source.character_instance_id),subjectCharacterInstanceIds:subjectIds,conversationId:typeof source.conversation_id==='string'?source.conversation_id:undefined}),
  ]);
  if(!subjects[0])throw new AppError('NOT_FOUND','That companion is unavailable in this Kivelle Life.',404);
  const worldContainment=await resolveCanonicalMediaWorld({db,characterVersionIds:subjects.map((subject)=>String(subject.character_version_id)),requestText:instruction,presenceLocationId:String(source.location_id??'')||undefined,groupWorldId:String(source.world_id??'')||undefined});
  const resolvedPlace=worldContainment.locationId?await resolvePlaceContext({db,locationId:worldContainment.locationId,userId:input.userId,characterInstanceId:String(source.character_instance_id)}):null;
  const effectiveWorldContainment={...worldContainment,...(resolvedPlace?{locationName:resolvedPlace.location.name,locationPath:resolvedPlace.path}:{})};
  const preferences=(profile?.content_preferences??{}) as Record<string,unknown>;
  const sourceLevel=normalizeLevel(source.content_level),originalRequestedLevel=resolveMediaEditContentLevel(sourceLevel,instruction),productionRequest=resolveProductionSafePhotoRequest({requestText:instruction,requestedContentLevel:originalRequestedLevel}),requestedLevel=productionRequest.contentLevel,policies=subjects.map((subject)=>{const subjectTemplate=(subject.together_character_templates??{}) as Record<string,unknown>,subjectVersion=(subject.together_character_versions??{}) as Record<string,unknown>,romanceAllowed=preferences.romanceEnabled!==false&&['flirting','dating','exclusive','long_term'].includes(String(subject.relationship_stage)),requestedForPolicy=requestedLevel==='romance'&&!romanceAllowed?'standard':requestedLevel,boundaries=resolveCharacterMediaBoundaries(subjectVersion.content_boundaries,subjectTemplate.content_boundaries),characterAllowsRequestedLevel=requestedForPolicy==='standard'?true:boundaries.allows_romance!==false;return resolveMediaContentPolicy({requestedLevel:requestedForPolicy,source:'user_edit',automatic:false,ageVerified:Boolean(profile?.age_verified_at),characterAge:Number(subjectTemplate.age),fictionalCharacter:isFictionalCompanion(subjectTemplate,subjectVersion),realPersonRequest:REAL_PERSON.test(instruction),nonConsensualRequest:NON_CONSENSUAL.test(instruction),minorRelatedRequest:MINOR.test(instruction),characterAllowsRequestedLevel,romanceEnabled:preferences.romanceEnabled!==false,suggestiveMediaEnabled:false,matureMediaEnabled:false,explicitMediaEnabled:false,adultVideoEnabled:false,mediaType:'image',adultMediaFeatureEnabled:false});}),denied=policies.find((policy)=>!policy.allowed),policy=policies[0]!;
  if(denied)throw new AppError('FORBIDDEN',editPolicyMessage(denied.reasonCode),403);
  const levels:MediaContentLevel[]=['standard','romance','suggestive','mature','explicit'];
  if(subjectIds.length>1&&policies.some((item)=>levels.indexOf(item.resolvedLevel)<levels.indexOf(requestedLevel)))throw new AppError('FORBIDDEN',"One selected companion isn't eligible for that photo edit yet.",403);
  if(subjectIds.length>1&&!configuredGroupImageRouteAvailable(String(policy.resolvedLevel),3))throw new AppError('PROVIDER_NOT_CONFIGURED',"Two-person photo editing isn't connected for this content level yet.",503);
  const charged=await spendCredits(db,{userId:input.userId,action:'photo_edit',idempotencyKey:`media-edit:${requestKey}`,referenceType:'generated_media',referenceId:String(source.id),metadata:{sourceMediaId:source.id,characterInstanceId:source.character_instance_id,requestId:input.requestId}});
  const sourceReferences=Array.isArray(sourceMetadata.referenceAssets)?sourceMetadata.referenceAssets as Array<Record<string,unknown>>:[],settingChanged=Boolean(worldContainment.locationId&&String(worldContainment.locationId)!==String(source.location_id??'')),environmentReferences=settingChanged?await snapshotReferenceAssets(db,{worldId:worldContainment.worldId,locationId:worldContainment.locationId,characterVersionIds:subjects.map((subject)=>String(subject.character_version_id))}):[],referenceAssets=settingChanged?[...sourceReferences.filter((asset)=>['character_identity','character_training','outfit_continuity'].includes(String(asset.role))),...environmentReferences]:sourceReferences;
  const providerInstruction=`${productionRequest.requestText??'Create a tasteful companion photograph.'}${effectiveWorldContainment.locationName?` Set the environment only at ${effectiveWorldContainment.locationName}, inside ${effectiveWorldContainment.worldName}.`:''}`.slice(0,400);
  const semantics=classifyMediaEditSemantics(instruction),metadata={...sourceMetadata,source:'user_edit',generationKind:'photo_edit',parentMediaId:source.id,rootMediaId:String(sourceMetadata.rootMediaId??source.id),editDepth:depth,editSemantics:semantics,canonicality:semantics==='correction'?'canonical_visualization':'creative_derivative',editInstruction:providerInstruction,generationIntent:{requestText:providerInstruction,requestedContentLevel:policy.resolvedLevel},requestedContentLevel:policy.resolvedLevel,resolvedContentLevel:policy.resolvedLevel,mediaPolicyReason:policy.reasonCode,productionMediaDowngraded:productionRequest.downgraded,productionMediaReason:productionRequest.reasonCode,requestKey,creditTransactionId:charged.transactionId,creditCost:charged.cost,creditAction:'photo_edit',creditRefunded:false,qualityRetry:false,needsCredits:false,worldContainment:effectiveWorldContainment,locationId:effectiveWorldContainment.locationId??null,placeContext:resolvedPlace?placeContextSnapshot(resolvedPlace):sourceMetadata.placeContext??null,referenceAssets};
  const row={user_id:input.userId,continuity_id:input.continuityId,character_instance_id:source.character_instance_id,subject_character_instance_ids:subjectIds,conversation_id:source.conversation_id??null,message_id:source.message_id??null,life_event_id:source.life_event_id??null,date_session_id:source.date_session_id??null,moment_id:source.moment_id??null,story_arc_id:source.story_arc_id??null,scene_session_id:source.scene_session_id??null,scene_action_id:source.scene_action_id??null,shared_plan_id:source.shared_plan_id??null,world_id:effectiveWorldContainment.worldId,location_id:effectiveWorldContainment.locationId??null,parent_media_id:source.id,media_type:'image',content_level:policy.resolvedLevel,provider:configuredImageProvider()?.id??source.provider??null,status:'queued',request_key:requestKey,queue_priority:source.queue_priority??0,metadata};
  const{data:media,error}=await db.from('together_generated_media').insert(row).select('*').single();
  if(error||!media){await refundCredits(db,{userId:input.userId,transactionId:charged.transactionId,idempotencyKey:`refund:${charged.transactionId}`,metadata:{reason:'media_edit_queue_failed',sourceMediaId:source.id}});const{data:race}=await db.from('together_generated_media').select('*').eq('user_id',input.userId).eq('request_key',requestKey).maybeSingle();if(race)return{media:race,creditCost:Number((race.metadata as Record<string,unknown>|null)?.creditCost??charged.cost),creditBalance:charged.balance};throw new AppError('INTERNAL_ERROR','The photo edit could not be queued.',500,true);}
  await track(db,input.userId,'photo_edit_requested',{mediaId:media.id,sourceMediaId:source.id,characterInstanceId:source.character_instance_id,contentLevel:policy.resolvedLevel,editSemantics:semantics,creditCost:charged.cost});
  return{media,creditCost:charged.cost,creditBalance:charged.balance};
}

function normalizeLevel(value:unknown):MediaContentLevel{return['romance','suggestive','mature','explicit'].includes(String(value))?String(value) as MediaContentLevel:'standard';}
function envBoolean(name:string):boolean{return['1','true','yes','on'].includes(String(Deno.env.get(name)??'').toLowerCase());}
function editPolicyMessage(reason:string):string{
  if(reason==='production_content_ceiling')return'Kivelle supports everyday and romantic photo edits, not nude, sexual, or explicit imagery.';
  if(reason==='age_verification_required'||reason==='adult_character_required')return'Adult media edits require a verified adult account and an adult fictional companion.';
  if(reason==='real_person_likeness')return'Real-person likeness edits are not available.';
  if(reason==='consent_boundary')return'That edit is outside Kivelle’s consent boundaries.';
  if(reason==='character_boundary')return'That edit is outside this companion’s media boundaries.';
  if(reason.endsWith('_disabled'))return'Enable the matching media preference before creating this edit.';
  return'That photo cannot be edited with the requested change.';
}
