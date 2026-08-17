import type { ImageSource } from 'expo-image';
import { worldHeroAssets } from './world-assets';
import { mappedLocationAsset } from './location-assets';

export const characterAssets:Record<string,number>={
  maya:require('../assets/maya-portrait.png'),
  chloe:require('../assets/chloe-portrait.png'),
  alex:require('../assets/alex-portrait.png'),
  'miranda-serrano':require('../assets/characters/juniper-city/miranda-serrano.jpg'),
  'nia-brooks':require('../assets/characters/juniper-city/nia-brooks.jpg'),
  'sophie-laurent':require('../assets/characters/juniper-city/sophie-laurent.jpg'),
  'priya-kapoor':require('../assets/characters/juniper-city/priya-kapoor.jpg'),
  'jade-nguyen':require('../assets/characters/juniper-city/jade-nguyen.jpg'),
  'camila-reyes':require('../assets/characters/juniper-city/camila-reyes.jpg'),
  'hannah-mercin':require('../assets/characters/juniper-city/hannah-mercin.jpg'),
  'amara-okafor':require('../assets/characters/juniper-city/amara-okafor.jpg'),
  'elena-markovic':require('../assets/characters/juniper-city/elena-markovic.jpg'),
  'lena-park':require('../assets/characters/juniper-city/lena-park.jpg'),
  'zoe-bennett':require('../assets/characters/juniper-city/zoe-bennett.jpg'),
  'tessa-morgan':require('../assets/characters/juniper-city/tessa-morgan.jpg'),
  'samira-haddad':require('../assets/characters/juniper-city/samira-haddad.jpg'),
  'avery-ellis':require('../assets/characters/juniper-city/avery-ellis.jpg'),
  'mateo-alvarez':require('../assets/characters/juniper-city/mateo-alvarez.jpg'),
  'ethan-cole':require('../assets/characters/juniper-city/ethan-cole.jpg'),
  'darius-king':require('../assets/characters/juniper-city/darius-king.jpg'),
  'kenji-sato':require('../assets/characters/juniper-city/kenji-sato.jpg'),
  'luca-moretti':require('../assets/characters/juniper-city/luca-moretti.jpg'),
  'claire-holloway':require('../assets/characters/juniper-city/claire-holloway.jpg'),
  'becka-shaw':require('../assets/characters/juniper-city/becka-shaw.jpg'),
  'emma-callahan':require('../assets/characters/juniper-city/emma-callahan.jpg'),
  'brooke-sullivan':require('../assets/characters/juniper-city/brooke-sullivan.jpg'),
};
export const cityLifeAsset=require('../assets/locations/juniper-city/juniper-city.png');
export const appIconAsset=require('../assets/icon.png');
export {worldHeroAssets};
export function worldHeroAsset(slug?:string|null):ImageSource{if(!slug||slug==='juniper-city')return cityLifeAsset;return worldHeroAssets[slug]??cityLifeAsset;}

// Location art deliberately resolves through one seam so authored location imagery can
// replace the world fallback without changing Explore, World, Date, or Plan screens.
export function locationHeroAsset(worldSlug?:string|null,locationSlug?:string|null):ImageSource{return mappedLocationAsset(worldSlug,locationSlug)??worldHeroAsset(worldSlug);}
