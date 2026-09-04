import type { ImageSource } from 'expo-image';

// Vharadren is being illustrated in authored batches. Keep this map limited to
// scenes that have passed visual review so unfinished places continue to use
// their normal world-level fallback instead of an unrelated location image.
export const vharadrenLocationAssets:Record<string,ImageSource>={
  'crownspire':require('../../assets/locations/vharadren/crownspire.jpg'),
  'black-march':require('../../assets/locations/vharadren/black-march.jpg'),
  'ember-isles':require('../../assets/locations/vharadren/ember-isles.jpg'),
  'verdant-reach':require('../../assets/locations/vharadren/verdant-reach.jpg'),
  'shattered-coast':require('../../assets/locations/vharadren/shattered-coast.jpg'),
  'ashlands':require('../../assets/locations/vharadren/ashlands.jpg'),
  'dragonbone-citadel':require('../../assets/locations/vharadren/dragonbone-citadel.jpg'),
  'ember-throne-hall':require('../../assets/locations/vharadren/ember-throne-hall.jpg'),
};
