import{describe,expect,it}from'vitest';
import{VESPORMOOR_ARRIVAL_ID,VESPORMOOR_CANONICAL_LORE,VESPORMOOR_WORLD_ID,vespormoorLocations,vespormoorWorld}from'./vespormoor';

describe('Vespormoor playable world',()=>{
  it('publishes a complete authored world with its resident roster',()=>{
    expect(vespormoorWorld.id).toBe(VESPORMOOR_WORLD_ID);
    expect(vespormoorWorld.slug).toBe('vespormoor');
    expect(vespormoorWorld.name).toBe('Vespormoor');
    expect(vespormoorWorld.published).toBe(true);
    expect(vespormoorWorld.default_arrival_location_id).toBe(VESPORMOOR_ARRIVAL_ID);
    expect(vespormoorWorld.metadata.contentStatus).toBe('complete_world_v1');
    expect(vespormoorWorld.metadata.locationCatalogStatus).toBe('ready');
    expect(vespormoorWorld.metadata.locationCount).toBe(51);
    expect(vespormoorWorld.metadata.districtCount).toBe(6);
    expect(vespormoorWorld.metadata.residentRosterStatus).toBe('ready');
    expect(vespormoorWorld.metadata.residentCompanionCount).toBe(45);
  });

  it('preserves the Covenant, Burning Winter, and lake mystery as canonical lore',()=>{
    expect(VESPORMOOR_CANONICAL_LORE.covenant).toContain('Vesper Covenant');
    expect(VESPORMOOR_CANONICAL_LORE.burningWinter).toContain('1846');
    expect(VESPORMOOR_CANONICAL_LORE.lakeWarning).toBe('Nothing beneath the water shall be awakened.');
    expect(VESPORMOOR_CANONICAL_LORE.presentThreat).toContain('weakening');
  });

  it('packages six districts and all 45 authored sub-locations with prompt-ready context',()=>{
    const districts=vespormoorLocations.filter((location)=>location.location_type==='district');
    const subLocations=vespormoorLocations.filter((location)=>location.parent_location_id);
    expect(vespormoorLocations).toHaveLength(51);
    expect(districts).toHaveLength(6);
    expect(subLocations).toHaveLength(45);
    expect(vespormoorLocations.find((location)=>location.id===VESPORMOOR_ARRIVAL_ID)?.slug).toBe('vesper-square');
    expect(vespormoorLocations.every((location)=>location.canonical_visual_context?.canonicalPrompt?.includes('Vespormoor'))).toBe(true);
    expect(vespormoorLocations.every((location)=>location.metadata?.photoStatus==='slot_ready')).toBe(true);
    expect(vespormoorLocations.every((location)=>location.visual_asset_key===`vespormoor-location-${location.slug}`)).toBe(true);
  });

  it('packages the supplied hero and distinct per-location image slots',()=>{
    expect(vespormoorWorld.hero_asset_key).toBe('vespormoor-hero');
    expect(vespormoorWorld.metadata.photoStatus).toBe('hero_ready');
    expect(vespormoorWorld.metadata.locationPhotoStatus).toBe('individual_slots_ready');
  });

  it('packages a full v2 public location bible without leaking gated story layers',()=>{
    expect(vespormoorLocations.every((location)=>location.canonical_lore?.version===2&&location.canonical_lore.authored===true)).toBe(true);
    expect(vespormoorLocations.every((location)=>(location.canonical_lore?.sensoryDetails?.length??0)>=3&&(location.canonical_lore?.layout?.length??0)>=3)).toBe(true);
    expect(JSON.stringify(vespormoorLocations)).not.toContain('sealed Undercroft route');
    expect(JSON.stringify({world:vespormoorWorld,locations:vespormoorLocations})).not.toMatch(/vampire|shapeshifter/i);
  });
});
