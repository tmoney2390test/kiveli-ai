import { hasOpenBuildWorldAccess } from '@together/domain/src/world-access';
import type { CharacterInstance, CharacterTemplate, CharacterVersion, CharacterWorldPresence, Location, PlaceContext, Snapshot, World } from '../types';
import { userExperienceTimezone } from './experienceTimezone';

export function worldById(snapshot:Snapshot,worldId?:string|null){return worldId?snapshot.worlds.find((world)=>world.id===worldId):undefined;}
export function locationById(snapshot:Snapshot,locationId?:string|null){return locationId?snapshot.locations.find((location)=>location.id===locationId):undefined;}
export function worldForLocation(snapshot:Snapshot,locationId?:string|null){const location=locationById(snapshot,locationId);return worldById(snapshot,location?.world_id);}
export function locationsForWorld(snapshot:Snapshot,worldId:string){return snapshot.locations.filter((location)=>location.world_id===worldId).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||a.name.localeCompare(b.name));}
export function childLocations(snapshot:Snapshot,parentId:string){return snapshot.locations.filter((location)=>location.parent_location_id===parentId).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||a.name.localeCompare(b.name));}
export function nearbyLocations(snapshot:Snapshot,locationId:string){const location=locationById(snapshot,locationId);if(!location)return[];return snapshot.locations.filter((item)=>item.id!==location.id&&item.world_id===location.world_id&&((location.parent_location_id&&item.parent_location_id===location.parent_location_id)||item.parent_location_id===location.id||location.parent_location_id===item.id)).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||a.name.localeCompare(b.name));}
export function locationAncestry(snapshot:Snapshot,locationId:string){const result:Location[]=[];const visited=new Set<string>();let location=locationById(snapshot,locationId);while(location?.parent_location_id){if(visited.has(location.parent_location_id)||visited.size>16)break;visited.add(location.parent_location_id);const parent=locationById(snapshot,location.parent_location_id);if(!parent||parent.world_id!==location.world_id)break;result.unshift(parent);location=parent;}return result;}
export function placePath(snapshot:Snapshot,locationId:string){const location=locationById(snapshot,locationId);if(!location)return'';const world=worldById(snapshot,location.world_id);return[world?.name,...locationAncestry(snapshot,locationId).map((item)=>item.name),location.name].filter(Boolean).join(' → ');}
export function buildClientPlaceContext(snapshot:Snapshot,locationId:string,now=new Date()):PlaceContext|undefined{
  const location=locationById(snapshot,locationId),world=worldById(snapshot,location?.world_id);
  if(!location||!world)return undefined;
  const worldTimezone=world.timezone||'UTC',timezone=userExperienceTimezone(snapshot);
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,weekday:'long',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const part=(key:string)=>parts.find((item)=>item.type===key)?.value??'';
  const hour=Number(part('hour'));
  const ancestry=locationAncestry(snapshot,locationId);
  const district=location.location_type==='district'?location:[...ancestry].reverse().find((item)=>item.location_type==='district');
  const adjacentDistricts=(district?.canonical_lore?.nearbyLocationSlugs??[])
    .map((slug)=>snapshot.locations.find((item)=>item.world_id===world.id&&item.slug===slug&&item.location_type==='district'))
    .filter((item):item is Location=>Boolean(item));
  const explicitNearby=location.canonical_lore?.nearbyLocationSlugs??[];
  const nearby=(explicitNearby.length?explicitNearby.map((slug)=>snapshot.locations.find((item)=>item.world_id===world.id&&item.slug===slug)).filter((item):item is Location=>Boolean(item)):nearbyLocations(snapshot,locationId)).slice(0,8);
  const districtContext=district?{id:district.id,slug:district.slug,name:district.name,type:'district' as const,description:district.description,visualContext:district.canonical_visual_context??{},lore:district.canonical_lore??{}}:undefined;
  return{
    contextVersion:1,
    world:{id:world.id,slug:world.slug,name:world.name,description:world.description,timezone:worldTimezone,accessType:world.access_type,visualContext:world.visual_context??{}},
    location:{id:location.id,slug:location.slug,name:location.name,type:location.location_type,description:location.description,category:location.category,hours:location.hours??null,possibleActivities:location.possible_activities,visualContext:location.canonical_visual_context??{},lore:location.canonical_lore??{}},
    ancestry:ancestry.map((item)=>({id:item.id,slug:item.slug,name:item.name,type:item.location_type,description:item.description,visualContext:item.canonical_visual_context??{},lore:item.canonical_lore??{}})),
    ...(districtContext?{district:districtContext}:{}),
    adjacentDistricts:adjacentDistricts.map((item)=>({id:item.id,slug:item.slug,name:item.name,type:'district' as const,description:item.description,visualContext:item.canonical_visual_context??{},lore:item.canonical_lore??{}})),
    nearby:nearby.map((item)=>({id:item.id,slug:item.slug,name:item.name,type:item.location_type,category:item.category,description:item.description,possibleActivities:item.possible_activities})),
    path:placePath(snapshot,locationId),
    clock:{timezone,localIso:`${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`,weekday:part('weekday'),localTime:`${part('hour')}:${part('minute')}`,daypart:hour<5?'overnight':hour<12?'morning':hour<17?'afternoon':hour<22?'evening':'late_night'},
  };
}

export type WorldCharacterCatalogEntry={
  template:CharacterTemplate;
  version:CharacterVersion;
  instance?:CharacterInstance;
  presence?:CharacterWorldPresence;
};

/** Published residents of a world, whether or not the current Life has met them yet. */
export function characterCatalogForWorld(snapshot:Snapshot,worldId:string):WorldCharacterCatalogEntry[]{
  const instancesByTemplate=new Map(snapshot.characters.map((instance)=>[instance.character_template_id,instance]));
  const residentPresenceByVersion=new Map((snapshot.characterWorldPresence??[])
    .filter((presence)=>presence.presence_type==='resident')
    .map((presence)=>[presence.character_version_id,presence]));
  const world=worldById(snapshot,worldId);

  return(snapshot.discoverableCharacters??[])
    .filter((template)=>template.can_be_selected!==false&&!['draft','archived'].includes(String(template.lifecycle_status??'published')))
    .flatMap((template):WorldCharacterCatalogEntry[]=>{
      const version=template.together_character_versions;
      if(!version)return[];
      const instance=instancesByTemplate.get(template.id);
      const presence=residentPresenceByVersion.get(version.id);
      const residentWorldSlug=String(template.discovery_metadata?.residentWorldSlug??'');
      const authoredWorld=template.first_meeting?.world_id;
      const belongsHere=presence
        ?presence.world_id===worldId
        :residentWorldSlug
          ?residentWorldSlug===world?.slug
          :authoredWorld===worldId;
      if(!belongsHere)return[];
      return[{template,version,instance,presence}];
    })
    .sort((left,right)=>{
      const leftEstablished=Boolean(left.instance?.contact_added_at||left.instance?.introduced_at);
      const rightEstablished=Boolean(right.instance?.contact_added_at||right.instance?.introduced_at);
      const leftFeatured=left.template.discovery_metadata?.featured===true;
      const rightFeatured=right.template.discovery_metadata?.featured===true;
      return Number(rightEstablished)-Number(leftEstablished)
        ||Number(rightFeatured)-Number(leftFeatured)
        ||left.template.name.localeCompare(right.template.name);
    });
}

export function characterByRouteKey(snapshot:Snapshot,key?:string|null){
  if(!key)return undefined;
  return snapshot.characters.find((character)=>character.id===key||character.character_template_id===key||character.together_character_templates.slug===key||character.together_character_templates.public_handle===key);
}

/** A companion's resident world is canonical; travel or stale current-location state cannot rewrite it. */
export function characterResidentWorld(snapshot:Snapshot,character?:CharacterInstance|null):World|undefined{
  if(!character)return undefined;
  const presence=(snapshot.characterWorldPresence??[]).find((item)=>item.character_version_id===character.character_version_id&&item.presence_type==='resident');
  if(presence)return worldById(snapshot,presence.world_id);
  const template=snapshot.discoverableCharacters.find((item)=>item.id===character.character_template_id)??character.together_character_templates;
  const residentWorldSlug=String(template.discovery_metadata?.residentWorldSlug??'');
  if(residentWorldSlug){const world=snapshot.worlds.find((item)=>item.slug===residentWorldSlug);if(world)return world;}
  const authoredWorldId=template.first_meeting?.world_id;
  return worldById(snapshot,authoredWorldId)??worldForLocation(snapshot,character.current_location_id);
}

/** The canonical private residence for this character in their resident world. */
export function characterHomeLocationId(snapshot:Snapshot,character?:CharacterInstance|null):string|undefined{
  if(!character)return undefined;
  const resident=(snapshot.characterWorldPresence??[]).find((item)=>item.character_version_id===character.character_version_id&&item.presence_type==='resident'&&Boolean(item.home_location_id));
  if(resident?.home_location_id)return resident.home_location_id;
  const currentWorld=worldForLocation(snapshot,character.current_location_id);
  return(snapshot.characterWorldPresence??[]).find((item)=>item.character_version_id===character.character_version_id&&item.world_id===currentWorld?.id&&Boolean(item.home_location_id))?.home_location_id??undefined;
}

export function isCharacterHomeLocation(snapshot:Snapshot,character:CharacterInstance,locationId?:string|null):boolean{
  const homeLocationId=characterHomeLocationId(snapshot,character);
  return Boolean(homeLocationId&&locationId&&homeLocationId===locationId);
}

export function characterCanPlanInWorld(snapshot:Snapshot,character:CharacterInstance|undefined|null,worldId?:string|null){
  return Boolean(character&&worldId&&characterResidentWorld(snapshot,character)?.id===worldId);
}

export function charactersConnectedToWorld(snapshot:Snapshot,worldId:string){const allowedVersions=new Set((snapshot.characterWorldPresence??[]).filter((presence)=>presence.world_id===worldId&&presence.presence_type!=='unavailable').map((presence)=>presence.character_version_id));return snapshot.characters.filter((character)=>worldForLocation(snapshot,character.current_location_id)?.id===worldId||allowedVersions.has(character.character_version_id));}
export function charactersCurrentlyAtLocation(snapshot:Snapshot,locationId:string){return snapshot.characters.filter((character)=>character.current_location_id===locationId&&!/\btravel(?:ling|ing)?\b/i.test(character.current_activity)&&character.current_interruptibility!=='unavailable');}
export function charactersCurrentlyInWorld(snapshot:Snapshot,worldId:string){return snapshot.characters.filter((character)=>worldForLocation(snapshot,character.current_location_id)?.id===worldId&&!/\btravel(?:ling|ing)?\b/i.test(character.current_activity));}
/** Backwards-compatible connected catalog selector; use charactersCurrently* for physical presence. */
export function charactersForWorld(snapshot:Snapshot,worldId:string){return charactersConnectedToWorld(snapshot,worldId);}
export function plansForWorld(snapshot:Snapshot,worldId:string){return(snapshot.sharedPlans??[]).filter((plan)=>(plan.world_id??worldForLocation(snapshot,plan.location_id)?.id)===worldId);}
export function datesForWorld(snapshot:Snapshot,worldId:string){return snapshot.dates.filter((date)=>date.together_date_templates.world_id===worldId);}
export function mediaForWorld(snapshot:Snapshot,worldId:string){return(snapshot.generatedMedia??[]).filter((media)=>(media.world_id??worldForLocation(snapshot,media.location_id)?.id)===worldId);}
export function worldAccessLabel(snapshot:Snapshot,world:World):'FREE'|'INCLUDED'|'OWNED'|'KIVELLE+'|'PREMIUM'{if(hasOpenBuildWorldAccess(world.published))return'INCLUDED';const row=(snapshot.userWorlds??[]).find((item)=>item.world_id===world.id);if(world.access_type==='free')return'FREE';if(row?.access_status==='unlocked')return'OWNED';if(world.access_type==='subscription')return'KIVELLE+';return'PREMIUM';}
export function characterCurrentWorld(snapshot:Snapshot,character?:CharacterInstance){return character?worldForLocation(snapshot,character.current_location_id):undefined;}
