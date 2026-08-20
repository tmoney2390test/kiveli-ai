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
  'alessia-romano':require('../assets/characters/port-vervelle/alessia-romano.jpg'),
  'amelie-rousseau':require('../assets/characters/port-vervelle/amelie-rousseau.jpg'),
  'ana-ribeiro':require('../assets/characters/port-vervelle/ana-ribeiro.jpg'),
  'bianca-de-luca':require('../assets/characters/port-vervelle/bianca-de-luca.jpg'),
  'camille-laurent':require('../assets/characters/port-vervelle/camille-laurent.jpg'),
  'chiara-vitale':require('../assets/characters/port-vervelle/chiara-vitale.jpg'),
  'clara-mendes':require('../assets/characters/port-vervelle/clara-mendes.jpg'),
  'elena-moretti':require('../assets/characters/port-vervelle/elena-moretti.jpg'),
  'eva-moreau':require('../assets/characters/port-vervelle/eva-moreau.jpg'),
  'giulia-marchetti':require('../assets/characters/port-vervelle/giulia-marchetti.jpg'),
  'isabella-conti':require('../assets/characters/port-vervelle/isabella-conti.jpg'),
  'lea-benali':require('../assets/characters/port-vervelle/lea-benali.jpg'),
  'lucia-ferraro':require('../assets/characters/port-vervelle/lucia-ferraro.jpg'),
  'margot-lefevre':require('../assets/characters/port-vervelle/margot-lefevre.jpg'),
  'marta-solari':require('../assets/characters/port-vervelle/marta-solari.jpg'),
  'mia-han-andersson':require('../assets/characters/port-vervelle/mia-han-andersson.jpg'),
  'nina-kovac':require('../assets/characters/port-vervelle/nina-kovac.jpg'),
  'sofia-bellini':require('../assets/characters/port-vervelle/sofia-bellini.jpg'),
  'tessa-patel-morgan':require('../assets/characters/port-vervelle/tessa-patel-morgan.jpg'),
  'valentina-costa':require('../assets/characters/port-vervelle/valentina-costa.jpg'),
};
export const cityLifeAsset=require('../assets/locations/juniper-city/juniper-city.png');
export const appIconAsset=require('../assets/icon.png');
export {worldHeroAssets};
export function worldHeroAsset(slug?:string|null):ImageSource{if(!slug||slug==='juniper-city')return cityLifeAsset;return worldHeroAssets[slug]??cityLifeAsset;}

// Location art deliberately resolves through one seam so authored location imagery can
// replace the world fallback without changing Explore, World, Date, or Plan screens.
export function locationHeroAsset(worldSlug?:string|null,locationSlug?:string|null):ImageSource{return mappedLocationAsset(worldSlug,locationSlug)??worldHeroAsset(worldSlug);}
