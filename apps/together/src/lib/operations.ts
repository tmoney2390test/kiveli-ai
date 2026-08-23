import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { invoke } from './api';

export type SupportCategory='bug'|'billing'|'safety'|'account'|'feedback'|'other';
export type OperationsDashboard={generatedAt:string;health:{status:'healthy'|'attention'};metrics:Record<string,number>;recentErrors:Array<Record<string,unknown>>;supportTickets:Array<Record<string,unknown>>;note:string};

function safeError(value:unknown){
  const error=value instanceof Error?value:new Error(typeof value==='string'?value:'Unexpected client error');
  const sanitize=(text:string)=>text.replace(/sk-[A-Za-z0-9_-]+/g,'[secret]').replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [redacted]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]');
  return{name:error.name.slice(0,100),message:sanitize(error.message||'Unexpected client error').slice(0,600),stack:sanitize(error.stack??'').slice(0,4000)};
}

export async function reportClientError(error:unknown,input:{route?:string;surface?:string;correlationId?:string;metadata?:Record<string,string|number|boolean|null>}={}){
  if(process.env.EXPO_PUBLIC_KIVELLE_ERROR_REPORTING_ENABLED==='false')return;
  const safe=safeError(error),stackHash=safe.stack?await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,safe.stack):undefined;
  await invoke('together-ops',{action:'report_client_error',route:input.route??'unknown',surface:input.surface??'client',errorName:safe.name,messageSafe:safe.message,stackSafe:safe.stack||undefined,stackHash,platform:Platform.OS,appVersion:Constants.expoConfig?.version??'unknown',buildId:Constants.expoConfig?.runtimeVersion?String(Constants.expoConfig.runtimeVersion):undefined,correlationId:input.correlationId,metadata:input.metadata??{}});
}

export const createSupportTicket=(input:{category:SupportCategory;subject:string;message:string;correlationId?:string;conversationId?:string})=>invoke<{ticket:{id:string;status:string;created_at:string}}>('together-ops',{action:'create_support_ticket',...input});
export const loadMySupportTickets=()=>invoke<{tickets:Array<{id:string;category:SupportCategory;subject:string;status:string;priority:string;created_at:string;updated_at:string}>}>('together-ops',{action:'my_tickets'});
export const loadOperationsDashboard=()=>invoke<OperationsDashboard>('together-ops',{action:'dashboard'});
export const updateSupportTicket=(ticketId:string,status:string,priority?:string)=>invoke<{ticket:Record<string,unknown>}>('together-ops',{action:'update_ticket',ticketId,status,priority});
