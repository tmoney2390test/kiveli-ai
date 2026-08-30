import{AppError}from'./types.ts';

export function chatPhotoLatencyBucket(milliseconds:number):string{
  if(milliseconds<2_000)return'under_2s';
  if(milliseconds<5_000)return'2_to_5s';
  if(milliseconds<10_000)return'5_to_10s';
  if(milliseconds<30_000)return'10_to_30s';
  return'over_30s';
}

export function chatPhotoByteBucket(bytes:number):string{
  if(bytes<=512*1024)return'up_to_512kb';
  if(bytes<=2*1024*1024)return'512kb_to_2mb';
  if(bytes<=5*1024*1024)return'2mb_to_5mb';
  return'5mb_to_10mb';
}

export function chatPhotoEdgeBucket(edge:number):string{
  if(edge<=768)return'up_to_768px';
  if(edge<=1536)return'769_to_1536px';
  return'1537_to_2048px';
}

export function chatPhotoFailureCode(error:unknown):string{
  return error instanceof AppError?error.code:'PROVIDER_UNAVAILABLE';
}

const SAFE_TELEMETRY_KEYS=new Set(['stage','failureCode','provider','latencyBucket','byteSizeBucket','longEdgeBucket']);
export function safeChatPhotoTelemetry(input:Record<string,unknown>):Record<string,string|number|boolean>{
  return Object.fromEntries(Object.entries(input).filter(([key,value])=>SAFE_TELEMETRY_KEYS.has(key)&&['string','number','boolean'].includes(typeof value)))as Record<string,string|number|boolean>;
}
