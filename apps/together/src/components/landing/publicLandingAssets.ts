import type { ImageSource } from 'expo-image';
import { Asset } from 'expo-asset';

// A small local hero keeps cold launch/sign-in usable without a network request.
export const publicLandingPrimaryHeroAsset: ImageSource = require('../../../assets/startup/welcome.webp');
export const publicLandingPrimaryHeroUri = Asset.fromModule(require('../../../assets/startup/welcome.webp')).uri;
