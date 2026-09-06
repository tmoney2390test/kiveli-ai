import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { invoke } from './api';

const SAFE_ROUTES=new Set(['/home','/chat','/group-chat','/dates','/moments','/notifications']);
const INSTALLATION_KEY='kivelle.push.installation.v1';

export type PushRegistrationResult={registered:boolean;permission:'granted'|'denied'|'unavailable'};

export function shouldPresentForegroundPush(currentPath:string,notificationRoute:unknown){
  if(typeof notificationRoute!=="string")return true;
  const destination=notificationRoute.split("?")[0]??"";
  const current=currentPath.split("?")[0]??"";
  return !((destination==="/chat"&&current==="/chat")||(destination==="/group-chat"&&current==="/group-chat"));
}

export function configureForegroundNotifications(currentPath:()=>string=()=>""){
  if(Platform.OS==='web')return;
  Notifications.setNotificationHandler({handleNotification:(notification)=>{
    const shouldPresent=shouldPresentForegroundPush(currentPath(),notification.request.content.data?.route);
    return Promise.resolve({
      shouldShowBanner:shouldPresent,shouldShowList:shouldPresent,shouldPlaySound:false,shouldSetBadge:false,
    });
  }});
}

export async function registerPushNotifications(requestPermission:boolean):Promise<PushRegistrationResult>{
  if(Platform.OS==='web')return{registered:false,permission:'unavailable'};
  let permission=await Notifications.getPermissionsAsync();
  if(permission.status!=='granted'&&requestPermission)permission=await Notifications.requestPermissionsAsync();
  if(permission.status!=='granted')return{registered:false,permission:'denied'};
  const projectId=String(Constants.easConfig?.projectId??Constants.expoConfig?.extra?.eas?.projectId??'');
  if(!projectId)return{registered:false,permission:'unavailable'};
  const token=await Notifications.getExpoPushTokenAsync({projectId});
  await invoke('together-notifications',{action:'register',token:token.data,platform:Platform.OS,deviceId:await installationId()});
  return{registered:true,permission:'granted'};
}

export async function deactivatePushNotifications(){
  if(Platform.OS==='web')return;
  await invoke('together-notifications',{action:'deactivate',deviceId:await installationId()});
}

async function installationId():Promise<string>{
  const existing=await SecureStore.getItemAsync(INSTALLATION_KEY);
  if(existing)return existing;
  const created=Crypto.randomUUID();
  await SecureStore.setItemAsync(INSTALLATION_KEY,created,{keychainAccessible:SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY});
  return created;
}

export function openPushResponse(response:Notifications.NotificationResponse){
  const data=response.notification.request.content.data??{};
  if(data.version!==undefined&&data.version!==1)return;
  const route=typeof data.route==='string'&&SAFE_ROUTES.has(data.route.split('?')[0]??'')?data.route:'/home';
  if(typeof data.proactiveMessageId==='string'){
    void invoke('together-notifications',{action:'opened',proactiveMessageId:data.proactiveMessageId}).catch(()=>undefined);
  }
  router.push(route as never);
}
