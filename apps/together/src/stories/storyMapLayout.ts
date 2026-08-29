export type StoryMapHotspot = { left: number; top: number; width: number };

/** Coordinates target the playable portion of the Vespormoor concept map after its decorative header/footer are cropped. */
export const VESPORMOOR_STORY_MAP_HOTSPOTS: Readonly<Record<string, StoryMapHotspot>> = {
  'saint-mercy': { left: 22, top: 8, width: 22 },
  'black-lantern': { left: 58, top: 9, width: 25 },
  'blackglass-library': { left: 82, top: 3, width: 16 },
  'saint-orison-chapel': { left: 3, top: 31, width: 22 },
  observatory: { left: 59, top: 37, width: 27 },
  'vesper-boatworks': { left: 81, top: 49, width: 18 },
  'stillwater-house': { left: 4, top: 52, width: 27 },
  'lake-vesper': { left: 35, top: 68, width: 27 },
  'morrow-and-quill': { left: 63, top: 76, width: 32 },
  'bell-tower': { left: 5, top: 84, width: 24 },
};

const fallbackHotspots: StoryMapHotspot[] = [
  { left: 34, top: 18, width: 25 },
  { left: 36, top: 44, width: 25 },
  { left: 66, top: 58, width: 25 },
  { left: 35, top: 86, width: 25 },
];

export function storyMapHotspot(locationId: string, index: number): StoryMapHotspot {
  return VESPORMOOR_STORY_MAP_HOTSPOTS[locationId] ?? fallbackHotspots[index % fallbackHotspots.length]!;
}
