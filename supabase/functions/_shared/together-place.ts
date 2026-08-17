import type { SupabaseClient } from '@supabase/supabase-js';
import { capabilitiesForTier, normalizeSubscriptionTier } from '../../../packages/together-domain/src/index.ts';
import { AppError } from './types.ts';
import { experienceClock } from './kivelle-time.ts';

type Row = Record<string, any>;
export type LocationType='region'|'district'|'neighborhood'|'venue'|'residence'|'landmark'|'outdoor'|'room'|'zone'|'transit';
export type WorldVisualContext={setting?:string;geography?:string[];architecture?:string[];climate?:string;visualStyle?:string[];palette?:string[];recurringElements?:string[];signageStyle?:string[];vegetation?:string[];avoid?:string[]};
export type LocationVisualContext={canonicalPrompt?:string;indoorOutdoor?:'indoor'|'outdoor'|'mixed';architecture?:string[];materials?:string[];lighting?:string[];furniture?:string[];recurringObjects?:string[];atmosphere?:string[];visualAnchors?:string[];avoid?:string[]};
export type LocationLore={summary?:string;atmosphere?:string[];sensoryDetails?:string[];signatureDetails?:string[];layout?:string[];crowdRhythm?:Record<string,string>;conversationHooks?:string[];stableFacts?:string[];localEtiquette?:string[];nearbyLocationSlugs?:string[]};
export type PlaceContext={
  contextVersion:1;
  world:{id:string;slug:string;name:string;description:string;timezone:string;accessType:string;visualContext:WorldVisualContext};
  location:{id:string;slug:string;name:string;type:LocationType;description:string;category:string;hours:Row|null;possibleActivities:string[];visualContext:LocationVisualContext;lore:LocationLore};
  ancestry:Array<{id:string;slug:string;name:string;type:LocationType;description?:string;lore?:LocationLore}>;
  nearby:Array<{id:string;slug:string;name:string;type:LocationType;category:string;description:string;possibleActivities:string[]}>;
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
    const {data:parent}=await input.db.from('together_locations').select('id,world_id,parent_location_id,slug,name,location_type,description,canonical_lore').eq('id',parentId).maybeSingle();
    if(!parent||String(parent.world_id)!==String(location.world_id))throw new AppError('INTERNAL_ERROR','This place crosses world boundaries.',500,true);
    ancestry.unshift(parent);parentId=parent.parent_location_id?String(parent.parent_location_id):null;
  }
  const lore=(location.canonical_lore??{}) as LocationLore;
  const nearbySlugs=Array.isArray(lore.nearbyLocationSlugs)?lore.nearbyLocationSlugs.map(String).filter(Boolean).slice(0,8):[];
  let nearbyRows:Row[]=[];
  if(nearbySlugs.length){const{data}=await input.db.from('together_locations').select('id,slug,name,location_type,category,description,possible_activities,sort_order').eq('world_id',location.world_id).in('slug',nearbySlugs).limit(8);nearbyRows=data??[];}
  else if(location.parent_location_id){const{data}=await input.db.from('together_locations').select('id,slug,name,location_type,category,description,possible_activities,sort_order').eq('world_id',location.world_id).eq('parent_location_id',location.parent_location_id).neq('id',location.id).order('sort_order').limit(6);nearbyRows=data??[];}
  const timezone=String(world.timezone??'UTC');const clock=experienceClock(timezone,now);
  return {contextVersion:1,world:{id:String(world.id),slug:String(world.slug),name:String(world.name),description:String(world.description),timezone,accessType:String(world.access_type??'free'),visualContext:(world.visual_context??{}) as WorldVisualContext},location:{id:String(location.id),slug:String(location.slug),name:String(location.name),type:String(location.location_type??'venue') as LocationType,description:String(location.description),category:String(location.category),hours:location.hours??null,possibleActivities:(location.possible_activities??[]).map(String),visualContext:(location.canonical_visual_context??{}) as LocationVisualContext,lore},ancestry:ancestry.map((item)=>({id:String(item.id),slug:String(item.slug),name:String(item.name),type:String(item.location_type??'venue') as LocationType,description:item.description?String(item.description):undefined,lore:(item.canonical_lore??{}) as LocationLore})),nearby:nearbyRows.sort((left,right)=>nearbySlugs.length?nearbySlugs.indexOf(String(left.slug))-nearbySlugs.indexOf(String(right.slug)):Number(left.sort_order??0)-Number(right.sort_order??0)).map((item)=>({id:String(item.id),slug:String(item.slug),name:String(item.name),type:String(item.location_type??'venue') as LocationType,category:String(item.category??''),description:String(item.description??''),possibleActivities:(item.possible_activities??[]).map(String)})),path:[String(world.name),...ancestry.map((item)=>String(item.name)),String(location.name)].join(' → '),clock:{timezone,localIso:`${clock.localDate}T${clock.localTime}`,weekday:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][clock.weekday]??'',localTime:clock.localTime,daypart:clock.daypart}};
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
    input.db.from('together_worlds').select('access_type,entitlement_key,published,metadata').eq('id',input.worldId).maybeSingle(),
    input.db.from('together_user_worlds').select('access_status').eq('user_id',input.userId).eq('world_id',input.worldId).maybeSingle(),
    input.db.from('together_entitlements').select('tier,entitlement_keys').eq('user_id',input.userId).maybeSingle(),
  ]);
  if(!world?.published)return'locked';
  if(userWorld?.access_status==='unlocked')return world.access_type==='free'?'included':'owned';
  if(world.access_type==='free')return'included';
  const capabilities=capabilitiesForTier(normalizeSubscriptionTier(entitlements?.tier));
  if(world.entitlement_key&&(entitlements?.entitlement_keys??[]).includes(world.entitlement_key))return'owned';
  if(world.access_type==='subscription'&&capabilities.worldAccess==='all_standard')return'included';
  if(world.access_type==='premium'&&capabilities.earlyWorldAccess&&Boolean((world.metadata as Record<string,unknown>|null)?.early_access))return'included';
  return userWorld?.access_status==='available'?'available':'locked';
}

export function placeContextSnapshot(place:PlaceContext){return{worldId:place.world.id,worldSlug:place.world.slug,worldName:place.world.name,worldDescription:place.world.description,worldAccessType:place.world.accessType,worldVisualContext:place.world.visualContext,locationId:place.location.id,locationSlug:place.location.slug,locationName:place.location.name,locationDescription:place.location.description,locationType:place.location.type,locationCategory:place.location.category,locationHours:place.location.hours,locationPossibleActivities:place.location.possibleActivities,locationVisualContext:place.location.visualContext,locationLore:place.location.lore,ancestry:place.ancestry,nearby:place.nearby,path:place.path,clock:place.clock,contextVersion:place.contextVersion};}
