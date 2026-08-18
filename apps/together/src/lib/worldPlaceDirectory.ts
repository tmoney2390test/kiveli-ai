import type { Location } from '../types';
import { EXPLORE_CATEGORIES, isBrowsableLocation, matchesExploreCategory, type ExploreCategoryId } from './explore';

export type WorldPlaceDirectorySection={
  id:string;
  kind:'district'|'citywide';
  district?:Location;
  places:Location[];
  totalPlaceCount:number;
};

export type WorldPlaceDirectory={
  sections:WorldPlaceDirectorySection[];
  places:Location[];
  categories:Array<{id:ExploreCategoryId;label:string;count:number}>;
  totalPlaceCount:number;
  visiblePlaceCount:number;
};

const hierarchyTypes=new Set(['region','district','neighborhood']);

export function buildWorldPlaceDirectory(locations:Location[],worldId:string,options:{query?:string;category?:ExploreCategoryId|null}={}):WorldPlaceDirectory{
  const worldLocations=locations.filter((location)=>location.world_id===worldId);
  const byId=new Map(worldLocations.map((location)=>[location.id,location]));
  const districts=worldLocations.filter((location)=>location.location_type==='district').sort(sortLocations);
  const places=worldLocations.filter(isDirectoryPlace).sort(sortLocations);
  const districtPlaces=new Map(districts.map((district)=>[district.id,[] as Location[]]));
  const citywide:Location[]=[];

  for(const place of places){
    const district=findDistrict(place,byId);
    const bucket=district?districtPlaces.get(district.id):undefined;
    if(bucket)bucket.push(place);else citywide.push(place);
  }

  const query=options.query?.trim().toLowerCase()??'';
  const category=options.category??null;
  const filterPlaces=(items:Location[],district?:Location)=>{
    const districtMatches=Boolean(query&&district&&searchText(district).includes(query));
    return items.filter((place)=>(!category||matchesExploreCategory(place,category))&&(!query||districtMatches||searchText(place).includes(query)));
  };

  const sections:WorldPlaceDirectorySection[]=districts.flatMap((district)=>{
    const all=districtPlaces.get(district.id)??[];
    const visible=filterPlaces(all,district);
    const districtMatches=Boolean(query&&searchText(district).includes(query));
    if((query||category)&&!visible.length&&!districtMatches)return[];
    return[{id:district.id,kind:'district' as const,district,places:visible,totalPlaceCount:all.length}];
  });
  const visibleCitywide=filterPlaces(citywide);
  if(visibleCitywide.length||(!query&&!category&&citywide.length))sections.push({id:'citywide',kind:'citywide',places:visibleCitywide,totalPlaceCount:citywide.length});

  return{
    sections,
    places,
    categories:EXPLORE_CATEGORIES.map((item)=>({...item,count:places.filter((place)=>matchesExploreCategory(place,item.id)).length})).filter((item)=>item.count>0),
    totalPlaceCount:places.length,
    visiblePlaceCount:sections.reduce((count,section)=>count+section.places.length,0),
  };
}

export function isDirectoryPlace(location:Location){return isBrowsableLocation(location)&&!hierarchyTypes.has(location.location_type);}

function findDistrict(location:Location,byId:Map<string,Location>){
  const visited=new Set<string>();
  let current=location;
  while(current.parent_location_id&&!visited.has(current.parent_location_id)){
    visited.add(current.parent_location_id);
    const parent=byId.get(current.parent_location_id);
    if(!parent||parent.world_id!==location.world_id)return undefined;
    if(parent.location_type==='district')return parent;
    current=parent;
  }
  return undefined;
}

function searchText(location:Location){
  const tags=Array.isArray(location.metadata?.tags)?location.metadata.tags.join(' '):'';
  return`${location.name} ${location.description} ${location.category} ${location.possible_activities.join(' ')} ${tags} ${location.canonical_lore?.summary??''}`.toLowerCase();
}

function sortLocations(left:Location,right:Location){return(left.sort_order??0)-(right.sort_order??0)||left.name.localeCompare(right.name);}
