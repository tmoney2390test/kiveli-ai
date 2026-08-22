import AsyncStorage from '@react-native-async-storage/async-storage';

const hintKey='kivelle.auto-dialogue.hint-seen.v1';
let hintSeen:boolean|undefined;

export async function hasSeenAutoDialogueHint():Promise<boolean>{
  if(hintSeen!==undefined)return hintSeen;
  try{hintSeen=(await AsyncStorage.getItem(hintKey))==='1';}catch{hintSeen=false;}
  return hintSeen;
}

export function markAutoDialogueHintSeen():void{
  hintSeen=true;
  void AsyncStorage.setItem(hintKey,'1').catch(()=>undefined);
}
