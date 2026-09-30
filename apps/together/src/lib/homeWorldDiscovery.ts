import { withComingSoonWorlds } from './comingSoonWorlds';
import { worldReleaseRank } from './worldSelectorOrder';
import type { World } from '../types';
import { isWorldCatalogVisible } from '@together/domain/src/world-access';

export function homeWorldDiscoveryOptions(worlds:World[],currentWorldId?:string|null):World[]{
  return withComingSoonWorlds(worlds
    .filter((world)=>isWorldCatalogVisible(world)&&world.id!==currentWorldId))
    .sort((left,right)=>worldReleaseRank(left)-worldReleaseRank(right)||releaseOrder(right)-releaseOrder(left)||Number(right.featured)-Number(left.featured)||right.sort_order-left.sort_order||left.name.localeCompare(right.name));
}

export function advanceHomeWorldIndex(current:number,count:number,delta=1){
  if(count<=0)return 0;
  return((current+delta)%count+count)%count;
}

export function isHomeWorldSwipe(dx:number,dy:number){
  return Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.4;
}

export function homeWorldSwipeDirection(dx:number,dy:number): -1 | 0 | 1 {
  if(!isHomeWorldSwipe(dx,dy)||Math.abs(dx)<40)return 0;
  return dx<0?1:-1;
}

export function shouldAutoRotateHomeWorlds({count,reducedMotion,appActive,documentVisible}:{
  count:number;
  reducedMotion:boolean;
  appActive:boolean;
  documentVisible:boolean;
}){
  return count>1&&!reducedMotion&&appActive&&documentVisible;
}

function releaseOrder(world:World){
  const wave=Number(world.metadata?.releaseWave);
  return Number.isFinite(wave)?wave:world.sort_order;
}
