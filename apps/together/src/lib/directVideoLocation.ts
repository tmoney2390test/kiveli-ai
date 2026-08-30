import type { DirectVideoLocationOption, DirectVideoLocationSource, VideoGenerationOptions } from '../types';

export function selectedDirectVideoLocation(options:VideoGenerationOptions|null,source:DirectVideoLocationSource,locationId=''):DirectVideoLocationOption|null{
  const locations=options?.locationOptions;if(!locations)return null;
  if(source==='current')return locations.current;
  if(source==='home')return locations.home??null;
  return locations.places.find((place)=>place.locationId===locationId)??null;
}

export function directVideoLocationReady(options:VideoGenerationOptions|null,source:DirectVideoLocationSource,locationId=''):boolean{
  return Boolean(selectedDirectVideoLocation(options,source,locationId));
}
