import type { ImageSource } from 'expo-image';
import { worldHeroAssets } from './world-assets';

export const characterAssets:Record<string,number>={
  maya:require('../assets/maya-portrait.png'),
  chloe:require('../assets/chloe-portrait.png'),
  alex:require('../assets/alex-portrait.png'),
};
export const cityLifeAsset=require('../assets/city-life.png');
export const appIconAsset=require('../assets/icon.png');

const cinematicWorldAssets:Record<string,ImageSource>={
  'vesper-city':require('../assets/worlds/vesper-city/hero.webp'),
};
const authoredLocationAssets:Record<string,Record<string,ImageSource>>={
  'vesper-city':{
    'velvet-hour':require('../assets/worlds/vesper-city/velvet-hour.webp'),
    'riverwalk':require('../assets/worlds/vesper-city/riverwalk.webp'),
    'pixel-and-pint':require('../assets/worlds/vesper-city/pixel-and-pint.webp'),
    'paper-trail':require('../assets/worlds/vesper-city/paper-trail.webp'),
  },
};

export {worldHeroAssets};
export function worldHeroAsset(slug?:string|null):ImageSource{if(!slug||slug==='juniper-city')return cityLifeAsset;return cinematicWorldAssets[slug]??worldHeroAssets[slug]??cityLifeAsset;}
export function locationHeroAsset(worldSlug?:string|null,locationSlug?:string|null):ImageSource{if(worldSlug&&locationSlug){const authored=authoredLocationAssets[worldSlug]?.[locationSlug];if(authored)return authored;}return worldHeroAsset(worldSlug);}
