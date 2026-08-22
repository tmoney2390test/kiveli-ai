import{describe,expect,it}from'vitest';
import{homeWorldDiscoveryOptions}from'./homeWorldDiscovery';
import type{World}from'../types';

const world=(id:string,releaseWave:number,published=true)=>({
  id,slug:id,name:id,description:id,access_type:'subscription',timezone:'UTC',sort_order:releaseWave*10,
  featured:true,published,visual_context:{},metadata:{releaseWave},
})as World;

describe('Home world discovery',()=>{
  it('never promotes the world containing the active conversation',()=>{
    expect(homeWorldDiscoveryOptions([world('juniper',1),world('port',7),world('neon',8)],'neon').map((item)=>item.id)).toEqual(['port','juniper']);
  });

  it('promotes the newest published alternative first and keeps prepared worlds hidden',()=>{
    expect(homeWorldDiscoveryOptions([world('juniper',1),world('port',7),world('neon',8),world('vespormoor',9,false)],'juniper').map((item)=>item.id)).toEqual(['neon','port']);
  });
});
