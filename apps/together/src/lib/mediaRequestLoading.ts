import type { MediaMomentMode } from './mediaMomentPicker';

export function shouldLoadDirectVideoOptions(input:{visible:boolean;mode:MediaMomentMode;characterId:string;loadedCharacterId:string|null}):boolean{
  return input.visible&&input.mode==='video'&&input.loadedCharacterId!==input.characterId;
}
