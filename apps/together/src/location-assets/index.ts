import type { ImageSource } from 'expo-image';
import { juniperCityLocationAssets } from './juniper-city';
import { neonKyoLocationAssets } from './neon-kyo';
import { northvaleLocationAssets } from './northvale';
import { portVervelleLocationAssets } from './port-vervelle';

export const locationAssetsByWorld:Record<string,Record<string,ImageSource>>={
  'juniper-city':juniperCityLocationAssets,
  'neon-kyo':neonKyoLocationAssets,
  'northvale':northvaleLocationAssets,
  'port-vervelle':portVervelleLocationAssets,
};

export function mappedLocationAsset(worldSlug?:string|null,locationSlug?:string|null):ImageSource|undefined{
  if(!worldSlug||!locationSlug)return undefined;
  return locationAssetsByWorld[worldSlug]?.[locationSlug];
}

