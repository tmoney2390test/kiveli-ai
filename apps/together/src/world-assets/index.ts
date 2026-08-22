import type { ImageSource } from 'expo-image';
import { neonKyoHero } from './neon-kyo';
import { port_vervelleHero } from './port-vervelle';
import { vespormoorHero } from './vespormoor';

export const worldHeroAssets: Record<string, ImageSource> = {
  'port-vervelle': port_vervelleHero,
  'neon-kyo':neonKyoHero,
  vespormoor:vespormoorHero,
};
