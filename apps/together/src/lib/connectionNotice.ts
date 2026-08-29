import type { ConnectionPhase } from '../providers/NetworkStatusProvider';

export type ConnectionBannerMode='offline'|'reconnected'|'failed'|null;

/** Connectivity changes stay quiet until they affect an attempted send. */
export function connectionBannerMode(input:{
  phase:ConnectionPhase;
  sendFailed:boolean;
  sendScoped:boolean;
}):ConnectionBannerMode{
  if(input.sendScoped&&input.phase==='offline')return'offline';
  if(input.sendScoped&&input.phase==='reconnected')return'reconnected';
  return input.sendFailed?'failed':null;
}
