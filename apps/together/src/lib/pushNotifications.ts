import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { invoke } from './api';

const SAFE_ROUTES=new Set(['/home','/chat','/group-chat','/dates','/moments','/notifications']);

export type PushRegistrationResult={registered:boolean;permission:'granted'|'denied'|'unavailable'};

export function configureForegroundNotifications(){
  if(Platform.OS==='web')return;
  Notifications.setNotificationHandler({handleNotification:()=>Promise.resolve({
    shouldShowBanner:true,shouldShowList:true,shouldPlaySound:false,shouldSetBadge:false,
  })});
}

export async function registerPushNotifications(requestPermission:boolean):Promise<PushRegistrationResult>{
  if(Platform.OS==='web')return{registered:false,permission:'unavailable'};
  let permission=await Notifications.getPermissionsAsync();
  if(permission.status!=='granted'&&requestPermission)permission=await Notifications.requestPermissionsAsync();
  if(permission.status!=='granted')return{registered:false,permission:'denied'};
  const projectId=String(Constants.easConfig?.projectId??Constants.expoConfig?.extra?.eas?.projectId??'');
  if(!projectId)return{registered:false,permission:'unavailable'};
  const token=await Notifications.getExpoPushTokenAsync({projectId});
  await invoke('together-notifications',{action:'register',token:token.data,platform:Platform.OS});
  return{registered:true,permission:'granted'};
}

export async function deactivatePushNotifications(){
  if(Platform.OS==='web')return;
  await invoke('together-notifications',{action:'deactivate',platform:Platform.OS});
}

export function openPushResponse(response:Notifications.NotificationResponse){
  const data=response.notification.request.content.data??{};
  const route=typeof data.route==='string'&&SAFE_ROUTES.has(data.route.split('?')[0]??'')?data.route:'/home';
  if(typeof data.proactiveMessageId==='string'){
    void invoke('together-notifications',{action:'opened',proactiveMessageId:data.proactiveMessageId}).catch(()=>undefined);
  }
  router.push(route as never);
}
