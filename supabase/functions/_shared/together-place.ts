import type { SupabaseClient } from '@supabase/supabase-js';
import { capabilitiesForTier, hasOpenBuildWorldAccess, normalizeSubscriptionTier } from '../../../packages/together-domain/src/index.ts';
import { AppError } from './types.ts';
import { experienceClock, resolveUserExperienceTimezone, safeTimezone } from './kivelle-time.ts';
import type { LocationLoreV2, LocationVisualContextV2 } from '../../../packages/together-domain/src/location-depth.ts';

type Row = Record<string, any>;
export type LocationType='region'|'district'|'neighborhood'|'venue'|'residence'|'landmark'|'outdoor'|'room'|'zone'|'transit';
export type WorldVisualContext={setting?:string;geography?:string[];architecture?:string[];climate?:string;visualStyle?:string[];palette?:string[];recurringElements?:string[];signageStyle?:string[];vegetation?:string[];avoid?:string[]};
export type LocationVisualContext=LocationVisualContextV2;
export type LocationLore=LocationLoreV2;
export type LocationAiLore={facts:string[];storyHooks:string[];sourceKeys:string[]};
export type PlaceDistrict={id:string;slug:string;name:string;type:'district';description?:string;visualContext?:LocationVisualContext;lore?:LocationLore};
export type PlaceContext={
  contextVersion:1;
  world:{id:string;slug:string;name:string;description:string;timezone:string;accessType:string;visualContext:WorldVisualContext};
  location:{id:string;slug:string;name:string;type:LocationType;description:string;category:string;hours:Row|null;possibleActivities:string[];visualContext:LocationVisualContext;lore:LocationLore;aiLore?:LocationAiLore;virtualType?:'character_home';referencePolicy?:'text_only'|'optional'|'required'};
  ancestry:Array<{id:string;slug:string;name:string;type:LocationType;description?:string;visualContext?:LocationVisualContext;lore?:LocationLore}>;
  district?:PlaceDistrict;
  adjacentDistricts?:PlaceDistrict[];
  nearby:Array<{id:string;slug:string;name:string;type:LocationType;category:string;description:string;possibleActivities:string[]}>;
  path:string;
  clock:{timezone:string;localIso:string;weekday:string;localTime:string;daypart:string};
};

export function isHomePresenceActivity(activity?:string|null,activityKey?:string|null):boolean{
  if(String(activityKey??'').toLowerCase()==='sleep'||String(activityKey??'').toLowerCase().startsWith('home'))return true;
  const value=String(activity??'').trim();
  if(!value||!/(?:^|\s)home(?:$|\s|[,.!?])/i.test(value))return false;
  return !/\b(?:going|heading|walking|driving|riding|travel(?:ing|ling)|commuting|on (?:the|her|his|their) way)\s+(?:back\s+)?home\b/i.test(value);
}

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
    const {data:parent}=await input.db.from('together_locations').select('id,world_id,parent_location_id,slug,name,location_type,description,canonical_visual_context,canonical_lore').eq('id',parentId).maybeSingle();
    if(!parent||String(parent.world_id)!==String(location.world_id))throw new AppError('INTERNAL_ERROR','This place crosses world boundaries.',500,true);
    ancestry.unshift(parent);parentId=parent.parent_location_id?String(parent.parent_location_id):null;
  }
  const lore=(location.canonical_lore??{}) as LocationLore;
  const aiLore=await resolveEligibleLocationAiLore({...input,locationId:String(location.id)});
  const nearbySlugs=Array.isArray(lore.nearbyLocationSlugs)?lore.nearbyLocationSlugs.map(String).filter(Boolean).slice(0,8):[];
  let nearbyRows:Row[]=[];
  if(nearbySlugs.length){const{data}=await input.db.from('together_locations').select('id,slug,name,location_type,category,description,possible_activities,sort_order').eq('world_id',location.world_id).in('slug',nearbySlugs).limit(8);nearbyRows=data??[];}
  else if(location.parent_location_id){const{data}=await input.db.from('together_locations').select('id,slug,name,location_type,category,description,possible_activities,sort_order').eq('world_id',location.world_id).eq('parent_location_id',location.parent_location_id).neq('id',location.id).order('sort_order').limit(6);nearbyRows=data??[];}
  const districtRow=String(location.location_type??'venue')==='district'?location:[...ancestry].reverse().find((item)=>String(item.location_type)==='district');
  const districtLore=(districtRow?.canonical_lore??{}) as LocationLore;
  const adjacentSlugs=Array.isArray(districtLore.nearbyLocationSlugs)?districtLore.nearbyLocationSlugs.map(String).filter(Boolean).slice(0,8):[];
  let adjacentRows:Row[]=[];
  if(adjacentSlugs.length){
    const{data}=await input.db.from('together_locations').select('id,slug,name,location_type,description,canonical_visual_context,canonical_lore').eq('world_id',location.world_id).eq('location_type','district').in('slug',adjacentSlugs).limit(8);
    adjacentRows=data??[];
  }
  const toDistrict=(item:Row):PlaceDistrict=>({id:String(item.id),slug:String(item.slug),name:String(item.name),type:'district',description:item.description?String(item.description):undefined,visualContext:(item.canonical_visual_context??{}) as LocationVisualContext,lore:(item.canonical_lore??{}) as LocationLore});
  const worldTimezone=safeTimezone(world.timezone);
  const timezone=await resolveUserExperienceTimezone(input.db,input.userId,worldTimezone);
  const clock=experienceClock(timezone,now);
  return {contextVersion:1,world:{id:String(world.id),slug:String(world.slug),name:String(world.name),description:String(world.description),timezone:worldTimezone,accessType:String(world.access_type??'free'),visualContext:(world.visual_context??{}) as WorldVisualContext},location:{id:String(location.id),slug:String(location.slug),name:String(location.name),type:String(location.location_type??'venue') as LocationType,description:String(location.description),category:String(location.category),hours:location.hours??null,possibleActivities:(location.possible_activities??[]).map(String),visualContext:(location.canonical_visual_context??{}) as LocationVisualContext,lore,...(aiLore?{aiLore}:{})},ancestry:ancestry.map((item)=>({id:String(item.id),slug:String(item.slug),name:String(item.name),type:String(item.location_type??'venue') as LocationType,description:item.description?String(item.description):undefined,visualContext:(item.canonical_visual_context??{}) as LocationVisualContext,lore:(item.canonical_lore??{}) as LocationLore})),...(districtRow?{district:toDistrict(districtRow)}:{}),adjacentDistricts:adjacentRows.sort((left,right)=>adjacentSlugs.indexOf(String(left.slug))-adjacentSlugs.indexOf(String(right.slug))).map(toDistrict),nearby:nearbyRows.sort((left,right)=>nearbySlugs.length?nearbySlugs.indexOf(String(left.slug))-nearbySlugs.indexOf(String(right.slug)):Number(left.sort_order??0)-Number(right.sort_order??0)).map((item)=>({id:String(item.id),slug:String(item.slug),name:String(item.name),type:String(item.location_type??'venue') as LocationType,category:String(item.category??''),description:String(item.description??''),possibleActivities:(item.possible_activities??[]).map(String)})),path:[String(world.name),...ancestry.map((item)=>String(item.name)),String(location.name)].join(' → '),clock:{timezone,localIso:`${clock.localDate}T${clock.localTime}`,weekday:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][clock.weekday]??'',localTime:clock.localTime,daypart:clock.daypart}};
}

async function resolveEligibleLocationAiLore(input:{db:SupabaseClient;locationId:string;userId?:string;characterInstanceId?:string}):Promise<LocationAiLore|undefined>{
  if(!input.userId||!input.characterInstanceId)return undefined;
  const{data:layers,error}=await input.db.from('together_location_lore_layers').select('layer_key,disclosure_scope,min_relationship_stage,required_character_slugs,required_story_keys,lore').eq('location_id',input.locationId).eq('active',true);
  if(error||!layers?.length)return undefined;
  const[{data:instance},{data:stories}]=await Promise.all([
    input.db.from('together_character_instances').select('relationship_stage,together_character_templates(slug)').eq('id',input.characterInstanceId).eq('user_id',input.userId).maybeSingle(),
    input.db.from('together_story_arc_instances').select('template_slug').eq('user_id',input.userId).eq('character_instance_id',input.characterInstanceId).in('status',['active','paused']),
  ]);
  if(!instance)return undefined;
  const template=Array.isArray(instance.together_character_templates)?instance.together_character_templates[0]:instance.together_character_templates;
  const characterSlug=String(template?.slug??''),stage=String(instance.relationship_stage??'stranger'),storyKeys=new Set((stories??[]).map((item)=>String(item.template_slug)));
  const eligible=layers.filter((layer)=>{
    const requiredCharacters=(layer.required_character_slugs??[]).map(String),requiredStories=(layer.required_story_keys??[]).map(String);
    if(requiredCharacters.length&&!requiredCharacters.includes(characterSlug))return false;
    if(layer.min_relationship_stage&&!stageAtLeast(stage,String(layer.min_relationship_stage)))return false;
    if(layer.disclosure_scope==='story')return requiredStories.length>0&&requiredStories.some((key:string)=>storyKeys.has(key));
    if(layer.disclosure_scope==='relationship')return Boolean(layer.min_relationship_stage)&&stageAtLeast(stage,String(layer.min_relationship_stage));
    return layer.disclosure_scope==='character'&&requiredCharacters.length>0;
  });
  if(!eligible.length)return undefined;
  return{facts:unique(eligible.flatMap((layer)=>stringList(layer.lore?.facts))),storyHooks:unique(eligible.flatMap((layer)=>stringList(layer.lore?.storyHooks))),sourceKeys:eligible.map((layer)=>String(layer.layer_key))};
}

function stageAtLeast(actual:string,minimum:string){const stages=['stranger','acquaintance','friend','flirting','dating','exclusive','long_term'];return stages.indexOf(actual)>=stages.indexOf(minimum)&&stages.indexOf(minimum)>=0;}
function stringList(value:unknown):string[]{return Array.isArray(value)?value.map(String).map((item)=>item.trim()).filter(Boolean):[];}
function unique(values:string[]){return[...new Set(values)];}

export async function resolveCharacterHomeContext(input:{db:SupabaseClient;characterVersionId:string;now?:Date;userId?:string}):Promise<PlaceContext|null>{
  const now=input.now??new Date();
  const{data:home,error}=await input.db.from('together_character_homes').select('*').eq('character_version_id',input.characterVersionId).eq('active',true).maybeSingle();
  if(error||!home)return null;
  const[{data:world},{data:district}]=await Promise.all([
    input.db.from('together_worlds').select('*').eq('id',home.world_id).eq('published',true).maybeSingle(),
    home.district_anchor_location_id?input.db.from('together_locations').select('id,world_id,slug,name,location_type,description,canonical_visual_context,canonical_lore').eq('id',home.district_anchor_location_id).maybeSingle():Promise.resolve({data:null}),
  ]);
  if(!world)return null;
  const worldTimezone=safeTimezone(world.timezone);
  const timezone=await resolveUserExperienceTimezone(input.db,input.userId,worldTimezone);
  const clock=experienceClock(timezone,now);
  const visualContext={...((home.canonical_visual_context??{}) as LocationVisualContext),canonicalPrompt:String(home.prompt_text)};
  const lore=(home.canonical_lore??{}) as LocationLore;
  const homeSlug=String(home.name??'character-home').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'character-home';
  const ancestry=district?[{id:String(district.id),slug:String(district.slug),name:String(district.name),type:String(district.location_type??'district') as LocationType,description:String(district.description??''),visualContext:(district.canonical_visual_context??{}) as LocationVisualContext,lore:(district.canonical_lore??{}) as LocationLore}]:[];
  const districtLore=(district?.canonical_lore??{}) as LocationLore;
  const adjacentSlugs=Array.isArray(districtLore.nearbyLocationSlugs)?districtLore.nearbyLocationSlugs.map(String).filter(Boolean).slice(0,8):[];
  let adjacentRows:Row[]=[];
  if(adjacentSlugs.length){const{data}=await input.db.from('together_locations').select('id,slug,name,location_type,description,canonical_visual_context,canonical_lore').eq('world_id',home.world_id).eq('location_type','district').in('slug',adjacentSlugs).limit(8);adjacentRows=data??[];}
  const toDistrict=(item:Row):PlaceDistrict=>({id:String(item.id),slug:String(item.slug),name:String(item.name),type:'district',description:item.description?String(item.description):undefined,visualContext:(item.canonical_visual_context??{}) as LocationVisualContext,lore:(item.canonical_lore??{}) as LocationLore});
  return{
    contextVersion:1,
    world:{id:String(world.id),slug:String(world.slug),name:String(world.name),description:String(world.description),timezone:worldTimezone,accessType:String(world.access_type??'free'),visualContext:(world.visual_context??{}) as WorldVisualContext},
    location:{id:`character-home:${input.characterVersionId}`,slug:homeSlug,name:String(home.name),type:'residence',description:String(home.description),category:'home',hours:null,possibleActivities:['rest','cook','talk privately','work on personal projects'],visualContext,lore,virtualType:'character_home',referencePolicy:String(home.reference_policy??'text_only') as 'text_only'|'optional'|'required'},
    ancestry,...(district?{district:toDistrict(district)}:{}),adjacentDistricts:adjacentRows.sort((left,right)=>adjacentSlugs.indexOf(String(left.slug))-adjacentSlugs.indexOf(String(right.slug))).map(toDistrict),nearby:[],path:[String(world.name),district?String(district.name):null,String(home.name)].filter(Boolean).join(' → '),
    clock:{timezone,localIso:`${clock.localDate}T${clock.localTime}`,weekday:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][clock.weekday]??'',localTime:clock.localTime,daypart:clock.daypart},
  };
}

export async function resolveCharacterPlaceContext(input:{db:SupabaseClient;characterVersionId:string;locationId?:string|null;activity?:string|null;activityKey?:string|null;now?:Date;userId?:string;characterInstanceId?:string}):Promise<PlaceContext|null>{
  if(isHomePresenceActivity(input.activity,input.activityKey)){
    const home=await resolveCharacterHomeContext({db:input.db,characterVersionId:input.characterVersionId,now:input.now,userId:input.userId});
    if(home)return home;
  }
  if(!input.locationId)return null;
  return resolvePlaceContext({db:input.db,locationId:input.locationId,now:input.now,userId:input.userId,characterInstanceId:input.characterInstanceId}).catch(()=>null);
}

export async function resolveCharacterBaseLocation(input:{db:SupabaseClient;characterVersionId:string;worldId:string}):Promise<Row|null>{
  const {data:presence}=await input.db.from('together_character_world_presence').select('home_location_id,presence_type').eq('character_version_id',input.characterVersionId).eq('world_id',input.worldId).neq('presence_type','unavailable').maybeSingle();
  const {data:world}=await input.db.from('together_worlds').select('default_arrival_location_id').eq('id',input.worldId).maybeSingle();
  const ids=[presence?.home_location_id,world?.default_arrival_location_id].filter(Boolean).map(String);
  for(const id of ids){const {data}=await input.db.from('together_locations').select('*').eq('id',id).eq('world_id',input.worldId).maybeSingle();if(data)return data;}
  const {data:fallback}=await input.db.from('together_locations').select('*').eq('world_id',input.worldId).is('parent_location_id',null).order('sort_order').order('name').limit(1).maybeSingle();
  return fallback??null;
}

export async function assertCharacterResidentInWorld(input:{db:SupabaseClient;characterVersionId:string;worldId:string}){
  const{data:presence,error}=await input.db.from('together_character_world_presence').select('world_id').eq('character_version_id',input.characterVersionId).eq('world_id',input.worldId).eq('presence_type','resident').maybeSingle();
  if(error)throw new AppError('INTERNAL_ERROR','Companion world membership could not be verified.',500,true);
  if(presence)return;
  const{data:world}=await input.db.from('together_worlds').select('name').eq('id',input.worldId).maybeSingle();
  throw new AppError('CHARACTER_WORLD_MISMATCH',`That companion belongs to another world. Choose someone who lives in ${world?.name??'this world'}, or pick a place in their home world.`,409,true);
}

export async function resolveWorldAccess(input:{db:SupabaseClient;userId:string;worldId:string}):Promise<'available'|'locked'|'included'|'owned'>{
  const {data:world}=await input.db.from('together_worlds').select('access_type,entitlement_key,published,metadata').eq('id',input.worldId).maybeSingle();
  if(!world?.published)return'locked';
  if(hasOpenBuildWorldAccess(Boolean(world.published)))return'included';
  const [{data:userWorld},{data:entitlements}]=await Promise.all([
    input.db.from('together_user_worlds').select('access_status').eq('user_id',input.userId).eq('world_id',input.worldId).maybeSingle(),
    input.db.from('together_entitlements').select('tier,entitlement_keys').eq('user_id',input.userId).maybeSingle(),
  ]);
  if(userWorld?.access_status==='unlocked')return world.access_type==='free'?'included':'owned';
  if(world.access_type==='free')return'included';
  const capabilities=capabilitiesForTier(normalizeSubscriptionTier(entitlements?.tier));
  if(world.entitlement_key&&(entitlements?.entitlement_keys??[]).includes(world.entitlement_key))return'owned';
  if(world.access_type==='subscription'&&capabilities.worldAccess==='all_standard')return'included';
  if(world.access_type==='premium'&&capabilities.earlyWorldAccess&&Boolean((world.metadata as Record<string,unknown>|null)?.early_access))return'included';
  return userWorld?.access_status==='available'?'available':'locked';
}

export function placeContextSnapshot(place:PlaceContext){return{worldId:place.world.id,worldSlug:place.world.slug,worldName:place.world.name,worldDescription:place.world.description,worldAccessType:place.world.accessType,worldVisualContext:place.world.visualContext,locationId:place.location.id,locationSlug:place.location.slug,locationName:place.location.name,locationDescription:place.location.description,locationType:place.location.type,locationCategory:place.location.category,locationHours:place.location.hours,locationPossibleActivities:place.location.possibleActivities,locationVisualContext:place.location.visualContext,locationLore:place.location.lore,locationVirtualType:place.location.virtualType??null,locationReferencePolicy:place.location.referencePolicy??null,ancestry:place.ancestry,district:place.district??null,adjacentDistricts:place.adjacentDistricts??[],nearby:place.nearby,path:place.path,clock:place.clock,contextVersion:place.contextVersion};}
