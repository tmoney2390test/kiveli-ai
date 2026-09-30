import{describe,expect,it}from'vitest';
import{EXPLORE_VISIBLE_INTENTS,exploreIntentSections,exploreResponsiveLayout,normalizeVisibleExploreIntent}from'./exploreLayout';

describe('Explore responsive layout',()=>{
  it('replaces Tonight with Scenarios and migrates old selections to For you',()=>{
    expect(EXPLORE_VISIBLE_INTENTS).toEqual([
      {id:'for_you',label:'For you'},
      {id:'scenarios',label:'Scenarios'},
      {id:'people',label:'People'},
      {id:'places',label:'Places'},
    ]);
    expect(normalizeVisibleExploreIntent('worlds')).toBe('for_you');
    expect(normalizeVisibleExploreIntent('tonight')).toBe('for_you');
  });

  it('keeps each Explore tab focused on its own content',()=>{
    expect(exploreIntentSections('people',false)).toEqual({recommendations:false,events:false,people:true,scenarios:false,places:false,worlds:false});
    expect(exploreIntentSections('scenarios',false)).toEqual({recommendations:false,events:false,people:false,scenarios:true,places:false,worlds:false});
    expect(exploreIntentSections('places',false)).toEqual({recommendations:false,events:false,people:false,scenarios:false,places:true,worlds:false});
    expect(exploreIntentSections('for_you',false)).toEqual({recommendations:true,events:true,people:true,scenarios:true,places:true,worlds:true});
    expect(exploreIntentSections('for_you',true).scenarios).toBe(false);
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
