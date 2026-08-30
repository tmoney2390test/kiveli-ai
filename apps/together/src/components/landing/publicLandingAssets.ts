import type { ImageSource } from 'expo-image';
import type { PublicWorld } from '../../lib/publicLanding';

export const publicWorldAssets: Record<PublicWorld['slug'], ImageSource> = {
  'juniper-city': { uri: '/landing/juniper-city.87558d22e240d5a06f101484d48933e8.jpg' },
  'neon-kyo': require('../../../assets/worlds/neon-kyo/neon-kyo-hero.jpg'),
  'port-vervelle': require('../../../assets/worlds/port-vervelle/port-vervelle-hero.jpg'),
  vespormoor: require('../../../assets/worlds/vespormoor/vespormoor-hero.jpg'),
  northvale: require('../../../assets/worlds/northvale/northvale-hero.jpg'),
  'eos-meridian': require('../../../assets/worlds/eos-meridian/eos-meridian-hero.jpg'),
};

export const publicCompanionAssets: Record<string, ImageSource> = {
  'becka-shaw': require('../../../assets/characters/juniper-city/becka-shaw.jpg'),
  'sophie-laurent': require('../../../assets/characters/juniper-city/sophie-laurent.jpg'),
  'bianca-de-luca': require('../../../assets/characters/port-vervelle/bianca-de-luca.jpg'),
  'amelie-rousseau': require('../../../assets/characters/port-vervelle/amelie-rousseau.jpg'),
  'mina-seo': require('../../../assets/characters/neon-kyo/mina-seo.jpg'),
  'aya-mori': require('../../../assets/characters/neon-kyo/aya-mori.jpg'),
  'evelyn-harrow': require('../../../assets/characters/vespormoor/evelyn-harrow.jpg'),
  'mirelle-voss': require('../../../assets/characters/vespormoor/mirelle-voss.jpg'),
  'avery-callahan': require('../../../assets/characters/northvale/avery-callahan.jpg'),
  'mara-ellison': require('../../../assets/characters/northvale/mara-ellison.jpg'),
  'commander-rhea-navarro': require('../../../assets/characters/eos-meridian/commander-rhea-navarro.jpg'),
  'imani-laurent': require('../../../assets/characters/eos-meridian/imani-laurent.jpg'),
};
