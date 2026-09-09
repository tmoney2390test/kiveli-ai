export type CalderInterval={id:string;start:number;end:number;locationId:string|null;activity:string;kind:'baseline'|'travel'|'event'|'appointment'|'story';priority:number;privateHomeId?:string;blocked?:boolean};
export type CalderLocation={id:string;districtId:string;home?:boolean;ownerId?:string;requiredState?:string|null};
export type CalderTravel={districtOrder:string[];ordinaryMinutes:number[][];districtSlugs:Record<string,string>};
export type CalderReservation={id:string;start:number;end:number;locationId:string;activity:string;kind:'event'|'appointment'|'story';requiredState?:string|null};

export function calderTravelMinutes(from:string|null,to:string|null,locations:CalderLocation[],travel:CalderTravel,flags:string[]=[]):number|null {
  if(!from||!to)return null;
  if(from===to)return 0;
  const a=locations.find(l=>l.id===from),b=locations.find(l=>l.id===to);
  if(!a||!b)return null;
  if((a.requiredState&&!flags.includes(a.requiredState))||(b.requiredState&&!flags.includes(b.requiredState)))return null;
  const aSlug=travel.districtSlugs[a.districtId],bSlug=travel.districtSlugs[b.districtId];
  if(!aSlug||!bSlug)return null;
  if(flags.includes('weather.severe'))return null;
  if(flags.includes('ferry.closed')&&((aSlug==='the-railhead')!==(bSlug==='the-railhead')))return null;
  const i=travel.districtOrder.indexOf(aSlug),j=travel.districtOrder.indexOf(bSlug);
  return i<0||j<0?null:travel.ordinaryMinutes[i]?.[j]??null;
}

export function overlayCalderInterval(intervals:CalderInterval[],overlay:CalderInterval):CalderInterval[] {
  if(overlay.end<=overlay.start)throw new Error('Invalid reservation interval');
  const result:CalderInterval[]=[];
  for(const current of intervals) {
    if(current.end<=overlay.start||current.start>=overlay.end){result.push(current);continue;}
    if(current.priority>overlay.priority)throw new Error('A higher-priority commitment already occupies this time');
    if(current.start<overlay.start)result.push({...current,end:overlay.start});
    if(current.end>overlay.end)result.push({...current,start:overlay.end});
  }
  return [...result,overlay].sort((a,b)=>a.start-b.start);
}

export function reserveCalderEvent(input:{intervals:CalderInterval[];reservation:CalderReservation;locations:CalderLocation[];travel:CalderTravel;flags?:string[]}):{accepted:boolean;intervals:CalderInterval[];reason?:string} {
  const {reservation:r,locations,travel}=input,flags=input.flags??[];
  if(!Number.isFinite(r.start)||!Number.isFinite(r.end)||r.end<=r.start)return {accepted:false,intervals:input.intervals,reason:'Invalid reservation interval'};
  const destination=locations.find(l=>l.id===r.locationId);
  if(!destination)return {accepted:false,intervals:input.intervals,reason:'Unknown destination'};
  if(r.requiredState&&!flags.includes(r.requiredState))return {accepted:false,intervals:input.intervals,reason:'An invitation or story gate is unmet'};
  if(destination.requiredState&&!flags.includes(destination.requiredState))return {accepted:false,intervals:input.intervals,reason:'Destination is not accessible'};
  if(destination.home&&!flags.includes(`home.invited:${destination.id}`))return {accepted:false,intervals:input.intervals,reason:'A specific home invitation is required'};
  const before=[...input.intervals].reverse().find(i=>i.start<r.start&&i.locationId),after=input.intervals.find(i=>i.end>r.end&&i.locationId);
  const inbound=calderTravelMinutes(before?.locationId??null,r.locationId,locations,travel,flags),outbound=calderTravelMinutes(r.locationId,after?.locationId??null,locations,travel,flags);
  if(inbound===null||outbound===null)return {accepted:false,intervals:input.intervals,reason:'Travel is unavailable'};
  const priority=r.kind==='story'?4:r.kind==='appointment'?3:2,start=r.start-inbound,end=r.end+outbound;
  if(input.intervals.some(i=>i.priority>=priority&&i.start<end&&i.end>start))return {accepted:false,intervals:input.intervals,reason:'Reserved travel or another commitment conflicts'};
  let intervals=input.intervals;
  if(inbound)intervals=overlayCalderInterval(intervals,{id:`${r.id}:inbound`,start,end:r.start,locationId:null,activity:'On the way',kind:'travel',priority});
  intervals=overlayCalderInterval(intervals,{...r,priority,...(destination.home?{privateHomeId:destination.id}:{})});
  if(outbound)intervals=overlayCalderInterval(intervals,{id:`${r.id}:outbound`,start:r.end,end,locationId:null,activity:'Returning from the visit',kind:'travel',priority});
  return {accepted:true,intervals};
}

export function resolveCalderPresence(intervals:CalderInterval[],minute:number):CalderInterval|null {
  return intervals.filter(i=>i.start<=minute&&i.end>minute).sort((a,b)=>b.priority-a.priority)[0]??null;
}
