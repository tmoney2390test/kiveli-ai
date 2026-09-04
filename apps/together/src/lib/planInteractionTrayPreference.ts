import AsyncStorage from '@react-native-async-storage/async-storage';

const prefix='kivelli:plan-interaction-tray-hidden:v1';

export function planInteractionTrayPreferenceKey(userId:string,planId:string){
  return `${prefix}:${userId}:${planId}`;
}

export async function isPlanInteractionTrayHidden(userId:string,planId:string){
  if(!userId||!planId)return false;
  try{return await AsyncStorage.getItem(planInteractionTrayPreferenceKey(userId,planId))==='1';}catch{return false;}
}

export async function hidePlanInteractionTray(userId:string,planId:string){
  if(!userId||!planId)return;
  try{await AsyncStorage.setItem(planInteractionTrayPreferenceKey(userId,planId),'1');}catch{/* Dismissal still applies to the current mounted chat. */}
}

export function shouldShowPlanInteractionTray(input:{activePlanId?:string|null;dismissedPlanId?:string|null;preferenceReady:boolean}){
  if(!input.activePlanId)return true;
  return input.preferenceReady&&input.dismissedPlanId!==input.activePlanId;
}
