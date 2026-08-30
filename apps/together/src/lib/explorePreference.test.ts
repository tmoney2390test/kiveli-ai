import {beforeEach,describe,expect,it,vi} from'vitest';

const storage=new Map<string,string>();
vi.mock('@react-native-async-storage/async-storage',()=>({default:{
  getItem:vi.fn((key:string)=>Promise.resolve(storage.get(key)??null)),
  setItem:vi.fn((key:string,value:string)=>{storage.set(key,value);return Promise.resolve();}),
}}));

import{mergeExplorePreference,readExplorePreference,writeExplorePreference}from'./explorePreference';

describe('Explore preference',()=>{
  beforeEach(()=>storage.clear());

  it('persists the selected world, intent, and safe scroll position per Life',async()=>{
    await writeExplorePreference('life-1',{worldSlug:'neon-kyo',intent:'places',scrollY:417.4});
    expect(await readExplorePreference('life-1')).toEqual({worldSlug:'neon-kyo',intent:'places',scrollY:417});
    expect(await readExplorePreference('life-2')).toEqual({worldSlug:null,intent:'for_you',scrollY:0});
  });

  it('normalizes invalid persisted values',()=>{
    expect(mergeExplorePreference({worldSlug:null,intent:'for_you',scrollY:0},{intent:'obsolete' as never,scrollY:-30})).toEqual({worldSlug:null,intent:'for_you',scrollY:0});
  });
});
