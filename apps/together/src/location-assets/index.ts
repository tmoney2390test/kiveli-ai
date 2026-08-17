import type { ImageSource } from 'expo-image';
import { juniperCityLocationAssets } from './juniper-city';

export const locationAssetsByWorld:Record<string,Record<string,ImageSource>>={
  'juniper-city':juniperCityLocationAssets,
};

export function mappedLocationAsset(worldSlug?:string|null,locationSlug?:string|null):ImageSource|undefined{
  if(!worldSlug||!locationSlug)return undefined;
  return locationAssetsByWorld[worldSlug]?.[locationSlug];
}

