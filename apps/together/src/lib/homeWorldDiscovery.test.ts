import{describe,expect,it}from'vitest';
import type{World}from'../types';
import{advanceHomeWorldIndex,homeWorldDiscoveryOptions,shouldAutoRotateHomeWorlds}from'./homeWorldDiscovery';

const world=(id:string,releaseWave:number,published=true)=>({
  id,slug:id,name:id,description:id,access_type:'subscription',timezone:'UTC',sort_order:releaseWave*10,
  featured:true,published,visual_context:{},metadata:{releaseWave},
})as World;

describe('home world discovery',()=>{
  it('never promotes the world containing the active conversation',()=>{
    expect(homeWorldDiscoveryOptions([world('juniper',1),world('port',7),world('neon',8)],'neon').map((item)=>item.id)).toEqual(['port','juniper']);
  });

  it('promotes the newest published alternative first and keeps prepared worlds hidden',()=>{
    expect(homeWorldDiscoveryOptions([world('juniper',1),world('port',7),world('neon',8),world('vespormoor',9,false)],'juniper').map((item)=>item.id)).toEqual(['neon','port']);
  });

  it('wraps forward and backward rotation',()=>{
    expect(advanceHomeWorldIndex(2,3)).toBe(0);
    expect(advanceHomeWorldIndex(0,3,-1)).toBe(2);
    expect(advanceHomeWorldIndex(4,0)).toBe(0);
  });

  it('pauses for reduced motion, hidden pages, and backgrounded apps',()=>{
    const ready={count:3,reducedMotion:false,appActive:true,documentVisible:true};
    expect(shouldAutoRotateHomeWorlds(ready)).toBe(true);
    expect(shouldAutoRotateHomeWorlds({...ready,reducedMotion:true})).toBe(false);
    expect(shouldAutoRotateHomeWorlds({...ready,documentVisible:false})).toBe(false);
    expect(shouldAutoRotateHomeWorlds({...ready,appActive:false})).toBe(false);
    expect(shouldAutoRotateHomeWorlds({...ready,count:1})).toBe(false);
  });
});
