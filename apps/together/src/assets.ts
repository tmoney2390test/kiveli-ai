import type { ImageSource } from 'expo-image';
import { worldHeroAssets } from './world-assets';

export const characterAssets:Record<string,number>={
  maya:require('../assets/maya-portrait.png'),
  chloe:require('../assets/chloe-portrait.png'),
  alex:require('../assets/alex-portrait.png'),
};
export const cityLifeAsset=require('../assets/city-life.png');
export const appIconAsset=require('../assets/icon.png');

// Explore, World and Location surfaces resolve art through these helpers.
// Location-specific authored art can be added here without changing any screen.
const authoredLocationAssets:Record<string,Record<string,ImageSource>>={};

export {worldHeroAssets};
export function worldHeroAsset(slug?:string|null):ImageSource{if(!slug||slug==='juniper-city')return cityLifeAsset;return worldHeroAssets[slug]??cityLifeAsset;}
export function locationHeroAsset(worldSlug?:string|null,locationSlug?:string|null):ImageSource{if(worldSlug&&locationSlug){const authored=authoredLocationAssets[worldSlug]?.[locationSlug];if(authored)return authored;}return worldHeroAsset(worldSlug);}
