import type{ExploreIntent}from'./explorePreference';

export type VisibleExploreIntent=Exclude<ExploreIntent,'worlds'|'tonight'>;

export const EXPLORE_VISIBLE_INTENTS:ReadonlyArray<{id:VisibleExploreIntent;label:string}>=[
  {id:'for_you',label:'For you'},
  {id:'scenarios',label:'Scenarios'},
  {id:'people',label:'People'},
  {id:'places',label:'Places'},
];

export function normalizeVisibleExploreIntent(intent:ExploreIntent):VisibleExploreIntent{
  return intent==='worlds'||intent==='tonight'?'for_you':intent;
}

export function exploreIntentSections(intent:VisibleExploreIntent,searching:boolean){
  return{
    recommendations:intent==='for_you'&&!searching,
    events:intent==='for_you'&&!searching,
    people:intent==='for_you'||intent==='people',
    scenarios:intent==='scenarios'||intent==='for_you'&&!searching,
    places:intent==='for_you'||intent==='places',
    worlds:intent==='for_you',
  };
}

export function exploreResponsiveLayout(viewportWidth:number,desktop:boolean,safeAreaBottom=0){
  const width=Math.max(320,viewportWidth);
  return{
    stackHeader:!desktop&&width<390,
    worldDiscoveryCardWidth:desktop?220:Math.min(284,Math.max(248,width-92)),
    bottomClearance:desktop?48:72+Math.max(8,safeAreaBottom)+20,
  };
}
