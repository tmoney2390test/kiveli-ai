import {describe,expect,it} from 'vitest';
import {locationsForExploreCategory} from '../lib/explore';
import {buildWorldPlaceDirectory} from '../lib/worldPlaceDirectory';
import {PORT_VERVELLE_ARRIVAL_ID,PORT_VERVELLE_PHOTOGRAPHED_LOCATION_SLUGS,PORT_VERVELLE_WORLD_ID,portVervelleLocations,portVervelleWorld} from './port-vervelle';

describe('Port Vervelle world seed',()=>{
  it('publishes the canonical world identity and arrival point',()=>{
    expect(portVervelleWorld.slug).toBe('port-vervelle');
    expect(portVervelleWorld.name).toBe('Port Vervelle');
    expect(portVervelleWorld.default_arrival_location_id).toBe(PORT_VERVELLE_ARRIVAL_ID);
    expect(portVervelleWorld.metadata.residentCompanionCount).toBe(42);
    expect(portVervelleWorld.metadata.maleResidentCompanionCount).toBe(12);
    expect(portVervelleWorld.metadata.residentRosterVersion).toBe(2);
    expect(portVervelleLocations.find((location)=>location.id===PORT_VERVELLE_ARRIVAL_ID)?.slug).toBe('porto-marina');
  });

  it('contains six districts and 44 public places with unique slugs',()=>{
    expect(portVervelleLocations).toHaveLength(50);
    expect(portVervelleLocations.filter((location)=>location.location_type==='district')).toHaveLength(6);
    expect(new Set(portVervelleLocations.map((location)=>location.slug))).toHaveProperty('size',50);
    const directory=buildWorldPlaceDirectory(portVervelleLocations,PORT_VERVELLE_WORLD_ID);
    expect(directory.sections.filter((section)=>section.kind==='district')).toHaveLength(6);
    expect(directory.totalPlaceCount).toBe(44);
    expect(directory.sections.find((section)=>section.district?.slug==='porto-vecchio')?.places.map((place)=>place.slug)).toEqual(expect.arrayContaining(['sotto-sale','museo-marittimo-vervelle']));
  });

  it('publishes the complete five-property lodging ladder',()=>{
    const lodgingSlugs=['locanda-vela','palazzo-sereno','hotel-coralline','casa-livia','hotel-celeste'];
    const lodging=portVervelleLocations.filter((location)=>lodgingSlugs.includes(location.slug));
    expect(lodging.map((location)=>location.slug)).toEqual(expect.arrayContaining(lodgingSlugs));
    expect(lodging).toHaveLength(5);
    expect(lodging.every((location)=>location.category==='hotel'&&location.metadata?.lodging===true)).toBe(true);
    expect(locationsForExploreCategory(portVervelleLocations,'lodging').map((location)=>location.slug)).toEqual(expect.arrayContaining(lodgingSlugs));
    expect(lodging.find((location)=>location.slug==='locanda-vela')?.metadata?.roomCount).toBe(16);
    expect(lodging.find((location)=>location.slug==='palazzo-sereno')?.metadata?.roomCount).toBe(24);
    expect(lodging.find((location)=>location.slug==='hotel-coralline')?.metadata?.roomCount).toBe(52);
    expect(lodging.find((location)=>location.slug==='casa-livia')?.metadata?.roomCount).toBe(9);
  });

  it('keeps every child inside Port Vervelle and resolves nested hotel places to Capo Vervelle',()=>{
    const ids=new Set(portVervelleLocations.map((location)=>location.id));
    expect(portVervelleLocations.every((location)=>location.world_id===PORT_VERVELLE_WORLD_ID)).toBe(true);
    expect(portVervelleLocations.every((location)=>!location.parent_location_id||ids.has(location.parent_location_id))).toBe(true);
    const directory=buildWorldPlaceDirectory(portVervelleLocations,PORT_VERVELLE_WORLD_ID);
    expect(directory.sections.find((section)=>section.district?.slug==='capo-vervelle')?.places.map((place)=>place.slug)).toContain('celeste-spa');
  });

  it('maps every photographed slug to a canonical Port Vervelle location',()=>{
    const locationsBySlug=new Map(portVervelleLocations.map((location)=>[location.slug,location]));
    expect(PORT_VERVELLE_PHOTOGRAPHED_LOCATION_SLUGS).toHaveLength(28);
    for(const slug of PORT_VERVELLE_PHOTOGRAPHED_LOCATION_SLUGS){
      const location=locationsBySlug.get(slug);
      expect(location,`${slug} should be canonical`).toBeDefined();
      expect(location?.visual_asset_key).toBe(slug);
      expect(location?.metadata?.photoStatus).toBe('ready');
    }
  });

  it('packages a full v2 location bible for every district and place',()=>{
    expect(portVervelleLocations.every((location)=>location.canonical_lore?.version===2&&location.canonical_lore.authored===true)).toBe(true);
    expect(portVervelleLocations.every((location)=>(location.canonical_lore?.sensoryDetails?.length??0)>=3&&(location.canonical_lore?.layout?.length??0)>=3)).toBe(true);
  });
});
