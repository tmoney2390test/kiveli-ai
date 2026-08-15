import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './types.ts';
import { experienceClock } from './kivelle-time.ts';

type Row = Record<string, any>;
export type LocationType='region'|'district'|'neighborhood'|'venue'|'residence'|'landmark'|'outdoor'|'room'|'zone'|'transit';
export type WorldVisualContext={setting?:string;geography?:string[];architecture?:string[];climate?:string;visualStyle?:string[];palette?:string[];recurringElements?:string[];signageStyle?:string[];vegetation?:string[];avoid?:string[]};
export type LocationVisualContext={canonicalPrompt?:string;indoorOutdoor?:'indoor'|'outdoor'|'mixed';architecture?:string[];materials?:string[];lighting?:string[];furniture?:string[];recurringObjects?:string[];atmosphere?:string[];visualAnchors?:string[];avoid?:string[]};
export type PlaceContext={
  contextVersion:1;
  world:{id:string;slug:string;name:string;description:string;timezone:string;accessType:string;visualContext:WorldVisualContext};
  location:{id:string;slug:string;name:string;type:LocationType;description:string;category:string;possibleActivities:string[];visualContext:LocationVisualContext};
  ancestry:Array<{id:string;slug:string;name:string;type:LocationType}>;
  path:string;
  clock:{timezone:string;localIso:string;weekday:string;localTime:string;daypart:string};
};

export async function resolvePlaceContext(input:{db:SupabaseClient;locationId:string;now?:Date;userId?:string;characterInstanceId?:string}):Promise<PlaceContext>{
  const now=input.now??new Date();
  const {data:location,error}=await input.db.from('together_locations').select('*').eq('id',input.locationId).maybeSingle();
  if(error||!location)throw new AppError('NOT_FOUND','That place is unavailable.',404);
  const {data:world,error:worldError}=await input.db.from('together_worlds').select('*').eq('id',location.world_id).maybeSingle();
  if(worldError||!world)throw new AppError('INTERNAL_ERROR','This place is missing its world.',500,true);
  const ancestry:Row[]=[];const visited=new Set<string>([String(location.id)]);let parentId=location.parent_location_id?String(location.parent_location_id):null;
  while(parentId){
    if(visited.has(parentId)||visited.size>16)throw new AppError('INTERNAL_ERROR','This place has an invalid hierarchy.',500,true);
    visited.add(parentId);
    const {data:parent}=await input.db.from('together_locations').select('id,world_id,parent_location_id,slug,name,location_type').eq('id',parentId).maybeSingle();
    if(!parent||String(parent.world_id)!==String(location.world_id))throw new AppError('INTERNAL_ERROR','This place crosses world boundaries.',500,true);
    ancestry.unshift(parent);parentId=parent.parent_location_id?String(parent.parent_location_id):null;
  }
  const timezone=String(world.timezone??'UTC');const clock=experienceClock(timezone,now);
  return {contextVersion:1,world:{id:String(world.id),slug:String(world.slug),name:String(world.name),description:String(world.description),timezone,accessType:String(world.access_type??'free'),visualContext:(world.visual_context??{}) as WorldVisualContext},location:{id:String(location.id),slug:String(location.slug),name:String(location.name),type:String(location.location_type??'venue') as LocationType,description:String(location.description),category:String(location.category),possibleActivities:(location.possible_activities??[]).map(String),visualContext:(location.canonical_visual_context??{}) as LocationVisualContext},ancestry:ancestry.map((item)=>({id:String(item.id),slug:String(item.slug),name:String(item.name),type:String(item.location_type??'venue') as LocationType})),path:[String(world.name),...ancestry.map((item)=>String(item.name)),String(location.name)].join(' → '),clock:{timezone,localIso:`${clock.localDate}T${clock.localTime}`,weekday:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][clock.weekday]??'',localTime:clock.localTime,daypart:clock.daypart}};
}

export async function resolveCharacterBaseLocation(input:{db:SupabaseClient;characterVersionId:string;worldId:string}):Promise<Row|null>{
  const {data:presence}=await input.db.from('together_character_world_presence').select('home_location_id,presence_type').eq('character_version_id',input.characterVersionId).eq('world_id',input.worldId).neq('presence_type','unavailable').maybeSingle();
  const {data:world}=await input.db.from('together_worlds').select('default_arrival_location_id').eq('id',input.worldId).maybeSingle();
  const ids=[presence?.home_location_id,world?.default_arrival_location_id].filter(Boolean).map(String);
  for(const id of ids){const {data}=await input.db.from('together_locations').select('*').eq('id',id).eq('world_id',input.worldId).maybeSingle();if(data)return data;}
  const {data:fallback}=await input.db.from('together_locations').select('*').eq('world_id',input.worldId).is('parent_location_id',null).order('sort_order').order('name').limit(1).maybeSingle();
  return fallback??null;
}

export async function resolveWorldAccess(input:{db:SupabaseClient;userId:string;worldId:string}):Promise<'available'|'locked'|'included'|'owned'>{
  const [{data:world},{data:userWorld},{data:entitlements}]=await Promise.all([
    input.db.from('together_worlds').select('access_type,entitlement_key,published').eq('id',input.worldId).maybeSingle(),
    input.db.from('together_user_worlds').select('access_status').eq('user_id',input.userId).eq('world_id',input.worldId).maybeSingle(),
    input.db.from('together_entitlements').select('entitlement_keys').eq('user_id',input.userId).maybeSingle(),
  ]);
  if(!world?.published)return'locked';
  if(userWorld?.access_status==='unlocked')return world.access_type==='free'?'included':'owned';
  if(world.access_type==='free')return'included';
  if(world.entitlement_key&&(entitlements?.entitlement_keys??[]).includes(world.entitlement_key))return'owned';
  return userWorld?.access_status==='available'?'available':'locked';
}

export function placeContextSnapshot(place:PlaceContext){return{worldId:place.world.id,worldSlug:place.world.slug,worldName:place.world.name,worldDescription:place.world.description,worldAccessType:place.world.accessType,worldVisualContext:place.world.visualContext,locationId:place.location.id,locationSlug:place.location.slug,locationName:place.location.name,locationDescription:place.location.description,locationType:place.location.type,locationCategory:place.location.category,locationPossibleActivities:place.location.possibleActivities,locationVisualContext:place.location.visualContext,ancestry:place.ancestry,path:place.path,clock:place.clock,contextVersion:place.contextVersion};}
