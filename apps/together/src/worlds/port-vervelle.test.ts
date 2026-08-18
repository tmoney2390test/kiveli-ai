import {describe,expect,it} from 'vitest';
import {buildWorldPlaceDirectory} from '../lib/worldPlaceDirectory';
import {PORT_VERVELLE_ARRIVAL_ID,PORT_VERVELLE_PHOTOGRAPHED_LOCATION_SLUGS,PORT_VERVELLE_WORLD_ID,portVervelleLocations,portVervelleWorld} from './port-vervelle';

describe('Port Vervelle world seed',()=>{
  it('publishes the canonical world identity and arrival point',()=>{
    expect(portVervelleWorld.slug).toBe('port-vervelle');
    expect(portVervelleWorld.name).toBe('Port Vervelle');
    expect(portVervelleWorld.default_arrival_location_id).toBe(PORT_VERVELLE_ARRIVAL_ID);
    expect(portVervelleWorld.metadata.residentCompanionCount).toBe(30);
    expect(portVervelleWorld.metadata.residentPortraitStatus).toBe('pending');
    expect(portVervelleLocations.find((location)=>location.id===PORT_VERVELLE_ARRIVAL_ID)?.slug).toBe('porto-marina');
  });

  it('contains six districts and 38 public places with unique slugs',()=>{
    expect(portVervelleLocations).toHaveLength(44);
    expect(portVervelleLocations.filter((location)=>location.location_type==='district')).toHaveLength(6);
    expect(new Set(portVervelleLocations.map((location)=>location.slug))).toHaveProperty('size',44);
    const directory=buildWorldPlaceDirectory(portVervelleLocations,PORT_VERVELLE_WORLD_ID);
    expect(directory.sections.filter((section)=>section.kind==='district')).toHaveLength(6);
    expect(directory.totalPlaceCount).toBe(38);
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
});
