export function shouldLoadDirectVideoOptions(input:{visible:boolean;mode:'photo'|'video';characterId:string;loadedCharacterId:string|null}):boolean{
  return input.visible&&input.mode==='video'&&input.loadedCharacterId!==input.characterId;
}
