import type{CharacterInstance,Location,Snapshot}from'../types';

export type ClientPlacePerspective={summary:string|null;sentiment:number;confidence:number;tags:string[];favoriteDetails:string[];dislikedDetails:string[];preferredActivities:string[];visitCount:number;firstVisitedAt:string|null;lastVisitedAt:string|null;meaningSummary:string|null;source:'unfamiliar'|'authored'|'learned'|'combined'};

export function selectCharacterPlacePerspective(snapshot:Snapshot,character:CharacterInstance|undefined,location:Location):ClientPlacePerspective{
  if(!character)return empty();
  const learned=snapshot.relationshipPlaces?.find((item)=>item.character_instance_id===character.id&&item.location_id===location.id);
  const authored=snapshot.characterPlaceProfiles?.find((item)=>item.character_version_id===character.character_version_id&&item.location_id===location.id);
  const hasLearned=Boolean(learned&&learned.evidence_count>0),hasAuthored=Boolean(authored?.opinion_summary);
  return{summary:hasLearned?learned?.opinion_summary??authored?.opinion_summary??null:authored?.opinion_summary??learned?.opinion_summary??null,sentiment:Number(hasLearned?learned?.sentiment??0:authored?.sentiment??learned?.sentiment??0),confidence:Number(hasLearned?learned?.confidence??0:authored?.confidence??learned?.confidence??0),tags:unique([...(authored?.opinion_tags??[]),...(learned?.opinion_tags??[])]),favoriteDetails:unique([...(authored?.favorite_details??[]),...(learned?.favorite_details??[])]),dislikedDetails:unique([...(authored?.disliked_details??[]),...(learned?.disliked_details??[])]),preferredActivities:authored?.preferred_activities??[],visitCount:Number(learned?.visit_count??0),firstVisitedAt:learned?.first_visited_at??null,lastVisitedAt:learned?.last_visited_at??null,meaningSummary:learned?.meaning_summary??null,source:hasLearned&&hasAuthored?'combined':hasLearned?'learned':hasAuthored?'authored':'unfamiliar'};
}
function empty():ClientPlacePerspective{return{summary:null,sentiment:0,confidence:0,tags:[],favoriteDetails:[],dislikedDetails:[],preferredActivities:[],visitCount:0,firstVisitedAt:null,lastVisitedAt:null,meaningSummary:null,source:'unfamiliar'};}
function unique(values:string[]){return[...new Set(values)].slice(0,8);}
