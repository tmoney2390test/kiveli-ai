import { worldHeroAssets } from './world-assets';

export const characterAssets:Record<string,number>={
  maya:require('../assets/maya-portrait.png'),
  chloe:require('../assets/chloe-portrait.png'),
  alex:require('../assets/alex-portrait.png'),
};
export const cityLifeAsset=require('../assets/city-life.png');
export const appIconAsset=require('../assets/icon.png');
export {worldHeroAssets};
export function worldHeroAsset(slug?:string|null){if(!slug||slug==='juniper-city')return cityLifeAsset;return worldHeroAssets[slug]??cityLifeAsset;}
