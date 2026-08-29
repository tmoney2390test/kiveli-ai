import type { ImageSource } from 'expo-image';
import { neonKyoHero } from './neon-kyo';
import { port_vervelleHero } from './port-vervelle';
import { vespormoorHero } from './vespormoor';
import { northvaleHero } from './northvale';
import { eosMeridianHero } from './eos-meridian';

export const worldHeroAssets: Record<string, ImageSource> = {
  'port-vervelle': port_vervelleHero,
  'neon-kyo':neonKyoHero,
  vespormoor:vespormoorHero,
  northvale:northvaleHero,
  'eos-meridian':eosMeridianHero,
};
