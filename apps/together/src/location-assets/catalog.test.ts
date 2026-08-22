import{describe,expect,it}from'vitest';
import{juniperCityMappedLocationSlugs,juniperCityPendingLocationAssetSlugs,neonKyoMappedLocationSlugs}from'./catalog';

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

describe('Juniper City geography v2 artwork',()=>{
  it('maps every newly supplied district and destination asset',()=>{
    expect(juniperCityMappedLocationSlugs).toHaveLength(39);
    expect(juniperCityMappedLocationSlugs).toEqual(expect.arrayContaining([
      'northside','marquee-quarter','halcyon-green','riverside','civic-commons',
      'alder-house','northline-motor-lodge','riverhouse-apartments','riverside-landing',
      'rivermark-hotel','juniper-central-station','juniper-medical-center','juniper-city-hall',
    ]));
    expect(juniperCityPendingLocationAssetSlugs).toHaveLength(0);
  });
});

describe('Neon Kyo location art catalog',()=>{
  it('maps all six districts and 45 public places to unique canonical art',()=>{
    expect(neonKyoMappedLocationSlugs).toHaveLength(51);
    expect(new Set(neonKyoMappedLocationSlugs).size).toBe(neonKyoMappedLocationSlugs.length);
    expect(neonKyoMappedLocationSlugs).toEqual(expect.arrayContaining([
      'hikari-core','hikari-crossing','velvet-static','gallery-null','nova-arena',
      'tsuki-tower-17','tsukimi-shrine','paper-moon-books','tea-house-aoi',
    ]));
  });

});
