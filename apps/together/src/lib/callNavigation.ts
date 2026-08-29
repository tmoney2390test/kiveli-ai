export function callReturnHref(characterInstanceId?:string|null):string{
  const character=characterInstanceId?.trim();
  return character?`/chat?character=${encodeURIComponent(character)}`:'/chat';
}
