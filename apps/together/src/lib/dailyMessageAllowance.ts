import type { DailyMessageAllowance } from '../types';

export function currentDailyMessageAllowance(allowance?:DailyMessageAllowance,now=Date.now()):DailyMessageAllowance|undefined{
  if(!allowance||allowance.limit===null||allowance.remaining===null)return allowance;
  const resetAt=Date.parse(allowance.resetAt);
  if(!Number.isFinite(resetAt)||resetAt>now)return allowance;
  const nextReset=new Date(now);nextReset.setUTCHours(24,0,0,0);
  return{limit:allowance.limit,used:0,remaining:allowance.limit,resetAt:nextReset.toISOString()};
}

export function isDailyMessageAllowanceExhausted(allowance?:DailyMessageAllowance,now=Date.now()):boolean{
  return currentDailyMessageAllowance(allowance,now)?.remaining===0;
}

export function dailyMessageAllowancePresentation(allowance?:DailyMessageAllowance,now=Date.now()):{copy:string;exhausted:boolean}|null{
  const current=currentDailyMessageAllowance(allowance,now);
  const remaining=current?.remaining;
  const limit=current?.limit;
  if(typeof limit!=='number'||typeof remaining!=='number'||remaining>5)return null;
  if(remaining===0)return{copy:`You’ve used today’s ${limit} free messages.`,exhausted:true};
  return{copy:`${remaining} free message${remaining===1?'':'s'} left today.`,exhausted:false};
}
