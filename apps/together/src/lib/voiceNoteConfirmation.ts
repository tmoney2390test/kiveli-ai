import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { storedVoiceNoteConfirmationHidden,voiceNoteConfirmationKey } from './voiceNoteConfirmationPreference';

async function currentUserId():Promise<string>{const{data}=await supabase.auth.getSession();return data.session?.user.id??'signed-out';}

export async function isVoiceNoteConfirmationHidden():Promise<boolean>{
  try{return storedVoiceNoteConfirmationHidden(await AsyncStorage.getItem(voiceNoteConfirmationKey(await currentUserId())));}catch{return false;}
}

export async function hideVoiceNoteConfirmation():Promise<void>{
  await AsyncStorage.setItem(voiceNoteConfirmationKey(await currentUserId()),'true');
}
