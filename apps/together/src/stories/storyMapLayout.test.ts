import { describe, expect, it } from 'vitest';
import { storyMapHotspot, VESPORMOOR_STORY_MAP_HOTSPOTS } from './storyMapLayout';

const playableLocationIds = [
  'bell-tower', 'black-lantern', 'observatory', 'stillwater-house', 'lake-vesper',
  'morrow-and-quill', 'blackglass-library', 'saint-mercy', 'saint-orison-chapel', 'vesper-boatworks',
];

describe('interactive Story map layout', () => {
  it('places every playable Vespormoor destination directly on the map', () => {
    expect(Object.keys(VESPORMOOR_STORY_MAP_HOTSPOTS).sort()).toEqual([...playableLocationIds].sort());
  });

  it('keeps every hotspot inside the playable artwork', () => {
    for (const [id, hotspot] of Object.entries(VESPORMOOR_STORY_MAP_HOTSPOTS)) {
      expect(hotspot.left, id).toBeGreaterThanOrEqual(0);
      expect(hotspot.top, id).toBeGreaterThanOrEqual(0);
      expect(hotspot.left + hotspot.width, id).toBeLessThanOrEqual(100);
      expect(hotspot.top, id).toBeLessThanOrEqual(92);
    }
  });

  it('provides an on-map fallback for future authored destinations', () => {
    expect(storyMapHotspot('future-location', 2)).toMatchObject({ left: 66, top: 58 });
  });
});
