import type { ImageSource } from 'expo-image';
import { Asset } from 'expo-asset';

export const publicLandingPrimaryHeroAsset: ImageSource = require('../../../assets/characters/vespormoor/evelyn-harrow.jpg');
export const publicLandingPrimaryHeroUri = Asset.fromModule(require('../../../assets/characters/vespormoor/evelyn-harrow.jpg')).uri;
