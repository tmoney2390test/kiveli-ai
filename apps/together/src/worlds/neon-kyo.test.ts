import {describe,expect,it} from 'vitest';
import {buildWorldPlaceDirectory} from '../lib/worldPlaceDirectory';
import {NEON_KYO_ARRIVAL_ID,NEON_KYO_WORLD_ID,neonKyoLocations,neonKyoWorld} from './neon-kyo';

describe('Neon Kyo world seed',()=>{
  it('publishes the canonical world identity and Hikari arrival point',()=>{
    expect(neonKyoWorld.slug).toBe('neon-kyo');
    expect(neonKyoWorld.name).toBe('Neon Kyo');
    expect(neonKyoWorld.default_arrival_location_id).toBe(NEON_KYO_ARRIVAL_ID);
    expect(neonKyoWorld.social_rhythm).toBe('always_on');
    expect(neonKyoLocations.find((location)=>location.id===NEON_KYO_ARRIVAL_ID)?.slug).toBe('hikari-crossing');
  });

  it('contains six districts and all 45 authored places with unique slugs',()=>{
    expect(neonKyoLocations).toHaveLength(51);
    expect(neonKyoLocations.filter((location)=>location.location_type==='district')).toHaveLength(6);
    expect(new Set(neonKyoLocations.map((location)=>location.slug))).toHaveProperty('size',51);
    const directory=buildWorldPlaceDirectory(neonKyoLocations,NEON_KYO_WORLD_ID);
    expect(directory.sections.filter((section)=>section.kind==='district')).toHaveLength(6);
    expect(directory.totalPlaceCount).toBe(45);
  });

  it('keeps every authored place inside its canonical Neon Kyo district',()=>{
    const ids=new Set(neonKyoLocations.map((location)=>location.id));
    expect(neonKyoLocations.every((location)=>location.world_id===NEON_KYO_WORLD_ID)).toBe(true);
    expect(neonKyoLocations.every((location)=>!location.parent_location_id||ids.has(location.parent_location_id))).toBe(true);
    const directory=buildWorldPlaceDirectory(neonKyoLocations,NEON_KYO_WORLD_ID);
    expect(directory.sections.find((section)=>section.district?.slug==='old-kyo-the-shade')?.places.map((place)=>place.slug)).toEqual(
      expect.arrayContaining(['tsukimi-shrine','whisper-bridge','ryokan-kaze','velvet-shrine','koi-garden','soba-miyako','below-kyo','paper-moon-books','lantern-street','tea-house-aoi']),
    );
  });

  it('maps supplied art for every location while the world hero remains ready',()=>{
    expect(neonKyoWorld.metadata.photoStatus).toBe('ready');
    expect(neonKyoWorld.metadata.locationPhotoStatus).toBe('ready');
    expect(neonKyoWorld.metadata.mappedLocationPhotoCount).toBe(51);
    expect(neonKyoWorld.metadata.residentCompanionCount).toBe(45);
    expect(neonKyoWorld.metadata.residentPortraitStatus).toBe('ready');
    expect(neonKyoWorld.metadata.mappedResidentPortraitCount).toBe(45);
    expect(neonKyoWorld.metadata.maleResidentCompanionCount).toBe(15);
    expect(neonKyoLocations.every((location)=>location.visual_asset_key===location.slug)).toBe(true);
    expect(neonKyoLocations.every((location)=>location.metadata?.photoStatus==='ready')).toBe(true);
  });

  it('packages a full v2 location bible for every district and place',()=>{
    expect(neonKyoLocations.every((location)=>location.canonical_lore?.version===2&&location.canonical_lore.authored===true)).toBe(true);
    expect(neonKyoLocations.every((location)=>(location.canonical_lore?.sensoryDetails?.length??0)>=3&&(location.canonical_lore?.layout?.length??0)>=3)).toBe(true);
  });
});
