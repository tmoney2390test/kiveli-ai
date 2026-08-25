import{describe,expect,it}from'vitest';
import{NORTHVALE_ARRIVAL_ID,NORTHVALE_CANONICAL_LORE,NORTHVALE_WORLD_ID,northvaleLocations,northvaleWorld}from'./northvale';

describe('NorthVale playable world',()=>{
  it('publishes a complete authored world with Vespormoor-scale metadata',()=>{
    expect(northvaleWorld.id).toBe(NORTHVALE_WORLD_ID);
    expect(northvaleWorld.slug).toBe('northvale');
    expect(northvaleWorld.name).toBe('NorthVale');
    expect(northvaleWorld.published).toBe(true);
    expect(northvaleWorld.default_arrival_location_id).toBe(NORTHVALE_ARRIVAL_ID);
    expect(northvaleWorld.metadata.locationCount).toBe(51);
    expect(northvaleWorld.metadata.districtCount).toBe(6);
    expect(northvaleWorld.metadata.residentCompanionCount).toBe(45);
  });

  it('preserves the mining town, White Sunday, ski history, and Accord as canonical lore',()=>{
    expect(NORTHVALE_CANONICAL_LORE.miningFoundation).toContain('1884');
    expect(NORTHVALE_CANONICAL_LORE.whiteSunday).toContain('February 18, 1912');
    expect(NORTHVALE_CANONICAL_LORE.skiTown).toContain('1947');
    expect(NORTHVALE_CANONICAL_LORE.valeAccord).toContain('1978');
    expect(NORTHVALE_CANONICAL_LORE.presentSeason).toContain('Juniper House');
  });

  it('packages six districts and 45 distinct public places',()=>{
    const districts=northvaleLocations.filter((location)=>location.location_type==='district');
    const places=northvaleLocations.filter((location)=>location.parent_location_id);
    expect(northvaleLocations).toHaveLength(51);
    expect(districts).toHaveLength(6);
    expect(places).toHaveLength(45);
    const counts=districts.map((district)=>places.filter((place)=>place.parent_location_id===district.id).length).sort((a,b)=>a-b);
    expect(counts).toEqual([7,7,7,7,7,10]);
    expect(northvaleLocations.find((location)=>location.id===NORTHVALE_ARRIVAL_ID)?.slug).toBe('lantern-square');
  });

  it('keeps every location prompt-ready and uniquely addressable',()=>{
    expect(new Set(northvaleLocations.map((location)=>location.id)).size).toBe(51);
    expect(new Set(northvaleLocations.map((location)=>location.slug)).size).toBe(51);
    expect(northvaleLocations.every((location)=>location.canonical_visual_context?.canonicalPrompt?.includes('NorthVale'))).toBe(true);
    expect(northvaleWorld.metadata.locationPhotoStatus).toBe('ready');
    expect(northvaleWorld.metadata.mappedLocationPhotoCount).toBe(51);
    expect(northvaleLocations.every((location)=>location.metadata?.photoStatus==='ready')).toBe(true);
    expect(northvaleLocations.every((location)=>location.visual_asset_key===`northvale-location-${location.slug}`)).toBe(true);
  });

  it('packages a full v2 public location bible and private-access etiquette',()=>{
    expect(northvaleLocations.every((location)=>location.canonical_lore?.version===2&&location.canonical_lore.authored===true)).toBe(true);
    expect(northvaleLocations.every((location)=>(location.canonical_lore?.sensoryDetails?.length??0)>=3&&(location.canonical_lore?.layout?.length??0)>=3)).toBe(true);
  });
});
