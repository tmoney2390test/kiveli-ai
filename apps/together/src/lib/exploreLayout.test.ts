import{describe,expect,it}from'vitest';
import{EXPLORE_VISIBLE_INTENTS,exploreResponsiveLayout,normalizeVisibleExploreIntent}from'./exploreLayout';

describe('Explore responsive layout',()=>{
  it('keeps the requested four visible filters without changing their underlying keys',()=>{
    expect(EXPLORE_VISIBLE_INTENTS).toEqual([
      {id:'for_you',label:'For you'},
      {id:'tonight',label:'Tonight'},
      {id:'people',label:'People'},
      {id:'places',label:'Places'},
    ]);
    expect(normalizeVisibleExploreIntent('worlds')).toBe('for_you');
  });

  it.each([
    [360,false,true,268],
    [390,false,false,284],
    [430,false,false,284],
    [768,false,false,284],
    [1440,true,false,220],
  ])('fits the Explore header and discovery rail at %ipx', (width,desktop,stackHeader,cardWidth)=>{
    const layout=exploreResponsiveLayout(width,desktop,24);
    expect(layout.stackHeader).toBe(stackHeader);
    expect(layout.worldDiscoveryCardWidth).toBe(cardWidth);
    expect(layout.worldDiscoveryCardWidth).toBeLessThan(width-40);
  });

  it('clears the floating navigation and safe area without adding desktop whitespace',()=>{
    expect(exploreResponsiveLayout(390,false,34).bottomClearance).toBe(126);
    expect(exploreResponsiveLayout(1280,true,34).bottomClearance).toBe(48);
  });
});
