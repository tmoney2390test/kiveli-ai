import{describe,expect,it}from'vitest';
import type{World}from'../types';
import{advanceHomeWorldIndex,homeWorldDiscoveryOptions,homeWorldSwipeDirection,isHomeWorldSwipe,shouldAutoRotateHomeWorlds}from'./homeWorldDiscovery';

const world=(id:string,releaseWave:number,published=true)=>({
  id,slug:id,name:id,description:id,access_type:'subscription',timezone:'UTC',sort_order:releaseWave*10,
  featured:true,published,visual_context:{},metadata:{releaseWave},
})as World;

describe('home world discovery',()=>{
  it('never promotes the world containing the active conversation',()=>{
    expect(homeWorldDiscoveryOptions([world('juniper',1),world('port',7),world('neon',8)],'neon').map((item)=>item.id)).toEqual(['port','juniper','preview-gilded-coast']);
  });

  it('promotes the newest published alternative first and keeps prepared worlds hidden',()=>{
    expect(homeWorldDiscoveryOptions([world('juniper',1),world('port',7),world('neon',8),world('vespormoor',9,false)],'juniper').map((item)=>item.id)).toEqual(['neon','port','preview-gilded-coast']);
  });

  it('keeps an ops-hidden world out of Home discovery while its published row supports existing chats',()=>{
    const hidden={...world('hidden',10),metadata:{releaseWave:10,catalog_status:'hidden'}} as World;
    expect(homeWorldDiscoveryOptions([world('juniper',1),hidden],'juniper').map((item)=>item.id)).toEqual(['preview-gilded-coast']);
  });

  it('wraps forward and backward rotation',()=>{
    expect(advanceHomeWorldIndex(2,3)).toBe(0);
    expect(advanceHomeWorldIndex(0,3,-1)).toBe(2);
    expect(advanceHomeWorldIndex(4,0)).toBe(0);
  });

  it('only claims deliberate horizontal movement, leaving taps and vertical scroll alone',()=>{
    expect(isHomeWorldSwipe(6,2)).toBe(false);
    expect(isHomeWorldSwipe(15,3)).toBe(true);
    expect(isHomeWorldSwipe(45,50)).toBe(false);
    expect(isHomeWorldSwipe(100,90)).toBe(false);
  });

  it('cycles one world in the swipe direction and ignores short or vertical drags',()=>{
    expect(homeWorldSwipeDirection(-70,5)).toBe(1);
    expect(homeWorldSwipeDirection(70,-5)).toBe(-1);
    expect(homeWorldSwipeDirection(-25,0)).toBe(0);
    expect(homeWorldSwipeDirection(45,80)).toBe(0);
    expect(advanceHomeWorldIndex(0,8,homeWorldSwipeDirection(70,0))).toBe(7);
    expect(advanceHomeWorldIndex(7,8,homeWorldSwipeDirection(-70,0))).toBe(0);
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
