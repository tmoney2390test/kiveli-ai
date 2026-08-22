import type { World } from '../types';

export function homeWorldDiscoveryOptions(worlds:World[],currentWorldId?:string|null):World[]{
  return worlds
    .filter((world)=>world.published&&world.id!==currentWorldId)
    .sort((left,right)=>releaseOrder(right)-releaseOrder(left)||Number(right.featured)-Number(left.featured)||right.sort_order-left.sort_order||left.name.localeCompare(right.name));
}

function releaseOrder(world:World){
  const wave=Number(world.metadata?.releaseWave);
  return Number.isFinite(wave)?wave:world.sort_order;
}
