import{describe,expect,it}from'vitest';
import{juniperCityMappedLocationSlugs}from'./catalog';

describe('Juniper City location art catalog',()=>{
  it('uses unique canonical location slugs for the imported art',()=>{
    expect(new Set(juniperCityMappedLocationSlugs).size).toBe(juniperCityMappedLocationSlugs.length);
    expect(juniperCityMappedLocationSlugs).toContain('maya-apartment');
    expect(juniperCityMappedLocationSlugs).toContain('meridian-fitness');
    expect(juniperCityMappedLocationSlugs).toContain('taqueria-lumen');
    expect(juniperCityMappedLocationSlugs).toContain('juniper-civic-arena');
    expect(juniperCityMappedLocationSlugs).toContain('photography-studio');
    expect(juniperCityMappedLocationSlugs).toContain('skyline-rooftop');
    expect(juniperCityMappedLocationSlugs).toContain('chloe-design-studio');
  });
});
