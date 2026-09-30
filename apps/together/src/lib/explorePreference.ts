import AsyncStorage from '@react-native-async-storage/async-storage';

export type ExploreIntent='for_you'|'scenarios'|'people'|'places'|'tonight'|'worlds';
export type ExplorePreference={worldSlug:string|null;intent:ExploreIntent;scrollY:number};

const prefix='kivelle.explore.preference.v1';
const defaults:ExplorePreference={worldSlug:null,intent:'for_you',scrollY:0};

export async function readExplorePreference(scope:string):Promise<ExplorePreference>{
  try{
    const saved=await AsyncStorage.getItem(key(scope));
    if(!saved)return{...defaults};
    return normalize(JSON.parse(saved) as Partial<ExplorePreference>);
  }catch{return{...defaults};}
}

export async function writeExplorePreference(scope:string,preference:ExplorePreference){
  await AsyncStorage.setItem(key(scope),JSON.stringify(normalize(preference)));
}

export function mergeExplorePreference(current:ExplorePreference,patch:Partial<ExplorePreference>):ExplorePreference{
  return normalize({...current,...patch});
}

function normalize(value:Partial<ExplorePreference>):ExplorePreference{
  const intent:ExploreIntent=isIntent(value.intent)&&value.intent!=='tonight'&&value.intent!=='worlds'?value.intent:'for_you';
  return{
    worldSlug:typeof value.worldSlug==='string'&&value.worldSlug.trim()?value.worldSlug.trim():null,
    intent,
    scrollY:typeof value.scrollY==='number'&&Number.isFinite(value.scrollY)?Math.max(0,Math.round(value.scrollY)):0,
  };
}

function isIntent(value:unknown):value is ExploreIntent{return value==='for_you'||value==='scenarios'||value==='people'||value==='places'||value==='tonight'||value==='worlds';}
function key(scope:string){return`${prefix}:${scope||'default'}`;}
