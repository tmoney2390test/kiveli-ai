import type { ClientSurface } from './platform-content-policy.ts';
export type { ClientSurface } from './platform-content-policy.ts';
export type AdultAccessProperties={premium_access:boolean;adult_eligible:boolean;adult_mode_enabled:boolean;client_surface:ClientSurface};

export function adultPipelineAuthorized(input:AdultAccessProperties&{global_enabled:boolean}):boolean{
  // adult_mode_enabled now represents a short-lived server-issued website
  // session, not a user-facing preference. Eligible website accounts receive
  // that session automatically; native and unverified clients still fail shut.
  return input.global_enabled&&input.client_surface==='web'&&input.premium_access&&input.adult_eligible&&input.adult_mode_enabled;
}

export function isAtLeast18(value:string,now:Date):boolean{
  const parts=value.split('-').map(Number);if(parts.length!==3)return false;
  const year=parts[0]!,month=parts[1]!,day=parts[2]!,birth=new Date(Date.UTC(year,month-1,day));
  if(!Number.isFinite(birth.getTime())||birth.getUTCFullYear()!==year||birth.getUTCMonth()!==month-1||birth.getUTCDate()!==day||birth>now)return false;
  let age=now.getUTCFullYear()-year;if(now.getUTCMonth()<month-1||(now.getUTCMonth()===month-1&&now.getUTCDate()<day))age--;
  return age>=18&&age<=120;
}
