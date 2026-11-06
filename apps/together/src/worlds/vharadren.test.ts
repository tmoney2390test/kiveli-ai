import{describe,expect,it}from'vitest';
import{
  VHARADREN_ARRIVAL_ID,
  VHARADREN_WORLD_ID,
  vharadrenAssetSlots,
  vharadrenCharacterSlugs,
  vharadrenLocations,
  vharadrenWorld,
}from'./vharadren';

describe('Vharadren playable world',()=>{
  it('publishes the complete subscription world and real hero slot',()=>{
    expect(vharadrenWorld.id).toBe(VHARADREN_WORLD_ID);
    expect(vharadrenWorld.slug).toBe('vharadren');
    expect(vharadrenWorld.access_type).toBe('subscription');
    expect(vharadrenWorld.entitlement_key).toBe('worlds.standard');
    expect(vharadrenWorld.default_arrival_location_id).toBe(VHARADREN_ARRIVAL_ID);
    expect(vharadrenAssetSlots.hero).toEqual({key:'vharadren-hero',status:'ready'});
    expect(vharadrenWorld.metadata.scheduleClock).toBe('user_local');
  });

  it('packages six districts and 45 distinct public places',()=>{
    const districts=vharadrenLocations.filter((location)=>location.location_type==='district');
    const places=vharadrenLocations.filter((location)=>location.parent_location_id);
    expect(vharadrenLocations).toHaveLength(51);
    expect(districts).toHaveLength(6);
    expect(places).toHaveLength(45);
    expect(districts.map((district)=>places.filter((place)=>place.parent_location_id===district.id).length).sort((a,b)=>a-b)).toEqual([7,7,7,8,8,8]);
    expect(vharadrenLocations.find((location)=>location.id===VHARADREN_ARRIVAL_ID)?.slug).toBe('gilded-steps-market');
  });

  it('keeps every location prompt-ready with a complete authored art catalog',()=>{
    expect(new Set(vharadrenLocations.map((location)=>location.id)).size).toBe(51);
    expect(new Set(vharadrenLocations.map((location)=>location.slug)).size).toBe(51);
    expect(vharadrenLocations.every((location)=>location.canonical_visual_context?.canonicalPrompt?.includes('Vharadren'))).toBe(true);
    expect(vharadrenLocations.every((location)=>location.canonical_lore?.version===2&&location.canonical_lore.authored===true)).toBe(true);
    expect(vharadrenLocations.every((location)=>location.metadata?.photoStatus==='ready')).toBe(true);
    expect(vharadrenAssetSlots.locations).toHaveLength(51);
    expect(vharadrenAssetSlots.locations.every((slot)=>slot.status==='ready')).toBe(true);
    expect(vharadrenWorld.metadata.locationPhotoStatus).toBe('ready');
    expect(vharadrenWorld.metadata.mappedLocationPhotoCount).toBe(51);
  });

  it('registers all 52 portrait slots without bundling server-only adult character depth',()=>{
    expect(vharadrenWorld.metadata.residentCompanionCount).toBe(52);
    expect(vharadrenWorld.metadata.portraitSlotCount).toBe(52);
    expect(vharadrenWorld.metadata.residentGenderRatio).toEqual({women:36,men:16});
    expect(vharadrenWorld.metadata.weeklyScheduleRowCount).toBe(2184);
    expect(vharadrenCharacterSlugs).toHaveLength(52);
    expect(new Set(vharadrenCharacterSlugs).size).toBe(52);
    expect(vharadrenCharacterSlugs).toContain('sable-wren');
    expect(vharadrenCharacterSlugs).toContain('princess-maris-vaelorian');
    expect(vharadrenCharacterSlugs).toContain('celia-thatch');
    expect(vharadrenAssetSlots.portraits).toHaveLength(52);
    expect(vharadrenAssetSlots.portraits.every((slot)=>slot.status==='ready')).toBe(true);
    const publicCatalog=JSON.stringify({vharadrenWorld,vharadrenLocations,vharadrenCharacterSlugs,vharadrenAssetSlots});
    expect(publicCatalog).not.toMatch(/privateTruth|adultContinuity|intimateAnatomy|hiddenSexual/);
  });
});
