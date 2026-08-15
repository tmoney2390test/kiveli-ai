import type { ImageSource } from 'expo-image';
import { vesper_cityHero } from './vesper-city';
import { solara_coastHero } from './solara-coast';
import { kairoHero } from './kairo';
import { alder_ridgeHero } from './alder-ridge';
import { aureliaHero } from './aurelia';
import { isla_marenHero } from './isla-maren';

export const worldHeroAssets: Record<string, ImageSource> = {
  'vesper-city': vesper_cityHero,
  'solara-coast': solara_coastHero,
  'kairo': kairoHero,
  'alder-ridge': alder_ridgeHero,
  'aurelia': aureliaHero,
  'isla-maren': isla_marenHero,
};
