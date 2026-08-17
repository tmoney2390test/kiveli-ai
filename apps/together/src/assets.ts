import type { ImageSource } from 'expo-image';
import { worldHeroAssets } from './world-assets';
import { mappedLocationAsset } from './location-assets';

export const characterAssets:Record<string,number>={
  maya:require('../assets/maya-portrait.png'),
  chloe:require('../assets/chloe-portrait.png'),
  alex:require('../assets/alex-portrait.png'),
};
export const cityLifeAsset=require('../assets/city-life.png');
export const appIconAsset=require('../assets/icon.png');
export {worldHeroAssets};
export function worldHeroAsset(slug?:string|null):ImageSource{if(!slug||slug==='juniper-city')return cityLifeAsset;return worldHeroAssets[slug]??cityLifeAsset;}

// Location art deliberately resolves through one seam so authored location imagery can
// replace the world fallback without changing Explore, World, Date, or Plan screens.
export function locationHeroAsset(worldSlug?:string|null,locationSlug?:string|null):ImageSource{return mappedLocationAsset(worldSlug,locationSlug)??worldHeroAsset(worldSlug);}
