import type { ImageSource } from 'expo-image';
import { juniperCityLocationAssets } from './juniper-city';
import { portVervelleLocationAssets } from './port-vervelle';

export const locationAssetsByWorld:Record<string,Record<string,ImageSource>>={
  'juniper-city':juniperCityLocationAssets,
  'port-vervelle':portVervelleLocationAssets,
};

export function mappedLocationAsset(worldSlug?:string|null,locationSlug?:string|null):ImageSource|undefined{
  if(!worldSlug||!locationSlug)return undefined;
  return locationAssetsByWorld[worldSlug]?.[locationSlug];
}

