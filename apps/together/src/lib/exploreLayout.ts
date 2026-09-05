import type{ExploreIntent}from'./explorePreference';

export const EXPLORE_VISIBLE_INTENTS:ReadonlyArray<{id:Exclude<ExploreIntent,'worlds'>;label:string}>=[
  {id:'for_you',label:'For you'},
  {id:'tonight',label:'Tonight'},
  {id:'people',label:'People'},
  {id:'places',label:'Places'},
];

export function normalizeVisibleExploreIntent(intent:ExploreIntent):Exclude<ExploreIntent,'worlds'>{
  return intent==='worlds'?'for_you':intent;
}

export function exploreResponsiveLayout(viewportWidth:number,desktop:boolean,safeAreaBottom=0){
  const width=Math.max(320,viewportWidth);
  return{
    stackHeader:!desktop&&width<390,
    worldDiscoveryCardWidth:desktop?220:Math.min(284,Math.max(248,width-92)),
    bottomClearance:desktop?48:72+Math.max(8,safeAreaBottom)+20,
  };
}
