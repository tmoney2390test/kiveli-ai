import{applyPlaceOpinionEvidence,emptyCharacterPlacePerspective,mergeAuthoredPlacePerspective,type CharacterPlacePerspectiveState,type PlaceOpinionEvidence}from'../../../packages/together-domain/src/index.ts';
import type{PlaceContext}from'./together-place.ts';
import{track}from'./together.ts';

type Row=Record<string,any>;
export type PlaceOpinionCandidate={placeRef:string;sentiment:number;confidence:number;summary:string;tags:string[];favoriteDetails:string[];dislikedDetails:string[];reasoningCode:'explicit_character_opinion'|'opinion_changed'|'shared_experience_reaction'};
export type PlacePerspectiveView={locationId:string;locationSlug:string;locationName:string;visitCount:number;firstVisitedAt:string|null;lastVisitedAt:string|null;familiarity:number;sentiment:number;confidence:number;opinionSummary:string|null;opinionTags:string[];favoriteDetails:string[];dislikedDetails:string[];preferredActivities:string[];evidenceCount:number;source:'unfamiliar'|'authored'|'learned'|'combined';meaningSummary:string|null};

export async function loadPlacePerspectives(input:{db:any;userId:string;characterInstanceId:string;characterVersionId:string;places:PlaceContext[]}):Promise<PlacePerspectiveView[]>{
  const unique=[...new Map(input.places.map((place)=>[place.location.id,place])).values()];
  const ids=unique.map((place)=>place.location.id);if(!ids.length)return[];
  const[{data:profiles},{data:relationshipPlaces},{data:evidence}]=await Promise.all([
    input.db.from('together_character_place_profiles').select('*').eq('character_version_id',input.characterVersionId).in('location_id',ids),
    input.db.from('together_relationship_places').select('*').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).in('location_id',ids),
    input.db.from('together_character_place_opinion_evidence').select('*').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).in('location_id',ids).order('created_at'),
  ]);
  return unique.map((place)=>{
    const authored=(profiles??[]).find((item:Row)=>String(item.location_id)===place.location.id) as Row|undefined;
    const relationship=(relationshipPlaces??[]).find((item:Row)=>String(item.location_id)===place.location.id) as Row|undefined;
    const observations=(evidence??[]).filter((item:Row)=>String(item.location_id)===place.location.id) as Row[];
    const authoredState=authored?stateFromRow(authored,0):undefined;
    const learnedState=observations.reduce((state:CharacterPlacePerspectiveState,row:Row)=>applyPlaceOpinionEvidence(state,evidenceFromRow(row)),emptyCharacterPlacePerspective());
    const merged=mergeAuthoredPlacePerspective(authoredState,learnedState);
    const source=observations.length?(authored?'combined':'learned'):authored?'authored':'unfamiliar';
    return{locationId:place.location.id,locationSlug:place.location.slug,locationName:place.location.name,visitCount:Number(relationship?.visit_count??0),firstVisitedAt:relationship?.first_visited_at??null,lastVisitedAt:relationship?.last_visited_at??null,familiarity:Math.max(Number(relationship?.familiarity??0),Number(authored?.familiarity??0)),sentiment:merged.sentiment,confidence:merged.confidence,opinionSummary:merged.opinionSummary,opinionTags:merged.opinionTags,favoriteDetails:merged.favoriteDetails,dislikedDetails:merged.dislikedDetails,preferredActivities:(authored?.preferred_activities??[]).map(String),evidenceCount:observations.length,source,meaningSummary:relationship?.meaning_summary??null};
  });
}

export async function recordChatPlaceOpinions(input:{db:any;userId:string;continuityId:string;characterInstanceId:string;characterVersionId:string;conversationId:string;assistantMessageId:string;candidates:PlaceOpinionCandidate[];places:PlaceContext[];now?:Date}):Promise<PlacePerspectiveView[]>{
  const now=input.now??new Date(),allowed=new Map<string,PlaceContext>();
  for(const place of input.places){allowed.set(place.location.id,place);allowed.set(place.location.slug.toLowerCase(),place);allowed.set(place.location.name.toLowerCase(),place);}
  const accepted=new Map<string,{place:PlaceContext;candidate:PlaceOpinionCandidate}>();
  for(const candidate of input.candidates.slice(0,3)){
    const place=candidate.placeRef==='current'?input.places[0]:allowed.get(candidate.placeRef.toLowerCase());
    if(!place||candidate.confidence<.65||!candidate.summary.trim()||accepted.has(place.location.id))continue;
    accepted.set(place.location.id,{place,candidate:{...candidate,sentiment:clamp(candidate.sentiment,-1,1),confidence:clamp(candidate.confidence,0,.95),summary:candidate.summary.trim().slice(0,280),tags:clean(candidate.tags,8),favoriteDetails:clean(candidate.favoriteDetails,6),dislikedDetails:clean(candidate.dislikedDetails,6)}});
  }
  for(const{place,candidate}of accepted.values()){
    const row={user_id:input.userId,continuity_id:input.continuityId,character_instance_id:input.characterInstanceId,location_id:place.location.id,source_type:'chat',source_id:input.assistantMessageId,source_conversation_id:input.conversationId,source_message_id:input.assistantMessageId,sentiment:candidate.sentiment,confidence:candidate.confidence,summary:candidate.summary,opinion_tags:candidate.tags,favorite_details:candidate.favoriteDetails,disliked_details:candidate.dislikedDetails,reasoning_code:candidate.reasoningCode,metadata:{placeSlug:place.location.slug,version:1}};
    const{data:created,error}=await input.db.from('together_character_place_opinion_evidence').upsert(row,{onConflict:'character_instance_id,location_id,source_type,source_id',ignoreDuplicates:true}).select('id').maybeSingle();
    if(error)continue;
    if(created)await track(input.db,input.userId,'character_place_opinion_evidence_created',{characterInstanceId:input.characterInstanceId,locationId:place.location.id,reasoningCode:candidate.reasoningCode});
  }
  const views=await loadPlacePerspectives({db:input.db,userId:input.userId,characterInstanceId:input.characterInstanceId,characterVersionId:input.characterVersionId,places:input.places});
  for(const view of views.filter((item)=>accepted.has(item.locationId))){
    const{data:current}=await input.db.from('together_relationship_places').select('visit_count,first_visited_at,last_visited_at,meaning_summary,moment_ids,familiarity').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).eq('location_id',view.locationId).maybeSingle();
    await input.db.from('together_relationship_places').upsert({user_id:input.userId,continuity_id:input.continuityId,character_instance_id:input.characterInstanceId,location_id:view.locationId,visit_count:Number(current?.visit_count??0),first_visited_at:current?.first_visited_at??null,last_visited_at:current?.last_visited_at??null,meaning_summary:current?.meaning_summary??null,moment_ids:current?.moment_ids??[],familiarity:Math.max(Number(current?.familiarity??0),view.familiarity),sentiment:view.sentiment,confidence:view.confidence,opinion_summary:view.opinionSummary,opinion_tags:view.opinionTags,favorite_details:view.favoriteDetails,disliked_details:view.dislikedDetails,evidence_count:view.evidenceCount,last_evidence_at:now.toISOString(),last_discussed_at:now.toISOString(),updated_at:now.toISOString()},{onConflict:'character_instance_id,location_id'});
    await track(input.db,input.userId,'character_place_opinion_updated',{characterInstanceId:input.characterInstanceId,locationId:view.locationId,evidenceCount:view.evidenceCount});
  }
  return views;
}

export async function recordSharedPlaceVisit(input:{db:any;userId:string;characterInstanceId:string;locationId:string;sourceType:'scene'|'date'|'plan'|'manual';sourceId:string;occurredAt:string;meaningSummary?:string|null;momentId?:string|null}):Promise<Row|null>{
  const{data,error}=await input.db.rpc('kivelle_record_relationship_place_visit',{p_user_id:input.userId,p_character_instance_id:input.characterInstanceId,p_location_id:input.locationId,p_source_type:input.sourceType,p_source_id:input.sourceId,p_occurred_at:input.occurredAt,p_meaning_summary:input.meaningSummary??null,p_moment_id:input.momentId??null});
  if(error)return null;
  await track(input.db,input.userId,'relationship_place_visited',{characterInstanceId:input.characterInstanceId,locationId:input.locationId,sourceType:input.sourceType});
  return data as Row|null;
}

function stateFromRow(row:Row,evidenceCount=Number(row.evidence_count??0)):CharacterPlacePerspectiveState{return{sentiment:Number(row.sentiment??0),confidence:Number(row.confidence??0),opinionSummary:row.opinion_summary?String(row.opinion_summary):null,opinionTags:(row.opinion_tags??[]).map(String),favoriteDetails:(row.favorite_details??[]).map(String),dislikedDetails:(row.disliked_details??[]).map(String),evidenceCount};}
function evidenceFromRow(row:Row):PlaceOpinionEvidence{return{sentiment:Number(row.sentiment??0),confidence:Number(row.confidence??0),summary:String(row.summary??''),tags:(row.opinion_tags??[]).map(String),favoriteDetails:(row.favorite_details??[]).map(String),dislikedDetails:(row.disliked_details??[]).map(String),source:['chat','scene','date','plan','authored'].includes(String(row.source_type))?row.source_type:'chat'} as PlaceOpinionEvidence;}
function clean(value:unknown,limit:number):string[]{return Array.isArray(value)?[...new Set(value.map(String).map((item)=>item.trim()).filter(Boolean))].slice(0,limit):[];}
function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):0));}
