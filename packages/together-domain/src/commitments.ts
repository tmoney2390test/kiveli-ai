export type CommitmentStatus='proposed'|'scheduled'|'active'|'completed'|'missed'|'cancelled';
export type CommitmentTemporalState='future'|'today'|'imminent'|'en_route'|'active'|'grace'|'expired';
export type CommitmentTimePrecision='exact'|'approximate'|'daypart'|'window'|'day';
export type CommitmentParticipationMode='live'|'flexible'|'ambient';
export type CommitmentMissReason='user_absent'|'character_absent'|'system_failure'|'connection_failure'|'cancelled';
export type CommitmentCompletionReason='elapsed'|'user_ended'|'date_completed'|'trip_completed'|'system_reconciled';
export type ManualCommitmentEndBlocker='already_ended'|'date_owned'|'not_active'|'not_started'|'already_elapsed'|'user_not_present'|'companion_not_present'|'scene_not_active';

export type CommitmentTimingInput={
  status:string;
  startsAt?:string|null;
  endsAt?:string|null;
  windowStartsAt?:string|null;
  windowEndsAt?:string|null;
  graceEndsAt?:string|null;
  timezone?:string|null;
  participationMode?:string|null;
  userJoinedAt?:string|null;
  characterJoinedAt?:string|null;
};

export type MissedCommitmentImpact={trust:number;respect:number;conflict:number;affinity:number};

export function manualCommitmentEndEligibility(input:{
  status:string;
  source?:string|null;
  startsAt?:string|null;
  endsAt?:string|null;
  userPresent:boolean;
  companionPresent:boolean;
  activeScene:boolean;
},now=new Date()):{allowed:boolean;blocker:ManualCommitmentEndBlocker|null}{
  if(['completed','missed','cancelled'].includes(input.status))return{allowed:false,blocker:'already_ended'};
  if(input.source==='date')return{allowed:false,blocker:'date_owned'};
  if(!['scheduled','active'].includes(input.status))return{allowed:false,blocker:'not_active'};
  const start=parseDate(input.startsAt),end=parseDate(input.endsAt);
  if(!start||now.getTime()<start.getTime())return{allowed:false,blocker:'not_started'};
  if(end&&now.getTime()>=end.getTime())return{allowed:false,blocker:'already_elapsed'};
  if(!input.userPresent)return{allowed:false,blocker:'user_not_present'};
  if(!input.companionPresent)return{allowed:false,blocker:'companion_not_present'};
  if(!input.activeScene)return{allowed:false,blocker:'scene_not_active'};
  return{allowed:true,blocker:null};
}

export function resolveElapsedCommitmentEnd(input:{status:string;source?:string|null;endsAt?:string|null},now=new Date()):{shouldFinalize:boolean;completedAt:string|null;reason:'elapsed'|null}{
  if(input.source==='date'||!['scheduled','active'].includes(input.status))return{shouldFinalize:false,completedAt:null,reason:null};
  const end=parseDate(input.endsAt);
  if(!end||now.getTime()<end.getTime())return{shouldFinalize:false,completedAt:null,reason:null};
  return{shouldFinalize:true,completedAt:end.toISOString(),reason:'elapsed'};
}

export function deriveCommitmentTemporalState(input:CommitmentTimingInput,now=new Date()):CommitmentTemporalState{
  if(['completed','missed','cancelled'].includes(String(input.status)))return'expired';
  const start=parseDate(input.startsAt??input.windowStartsAt),end=parseDate(input.endsAt??input.windowEndsAt),grace=parseDate(input.graceEndsAt);
  if(!start)return'future';
  const nowMs=now.getTime(),startMs=start.getTime(),endMs=end?.getTime()??startMs+90*60_000;
  if(nowMs>=endMs)return'expired';
  if(nowMs>=startMs){
    const live=(input.participationMode??'live')==='live';
    if(live&&!input.userJoinedAt&&nowMs<(grace?.getTime()??startMs+30*60_000))return'grace';
    return'active';
  }
  const until=startMs-nowMs;
  if(until<=20*60_000)return'en_route';
  if(until<=90*60_000)return'imminent';
  if(sameLocalDay(start,now,input.timezone??'UTC'))return'today';
  return'future';
}

export function commitmentRelevanceScore(input:CommitmentTimingInput&{missResolutionStatus?:string|null},now=new Date()):number{
  if(input.status==='missed'&&input.missResolutionStatus&&!['repaired','resolved'].includes(input.missResolutionStatus))return 1;
  const state=deriveCommitmentTemporalState(input,now);
  if(state==='active'||state==='grace')return 1;
  if(state==='en_route')return .95;
  if(state==='imminent')return .85;
  if(state==='today')return .68;
  if(input.status==='proposed')return .62;
  if(state==='future'){
    const start=parseDate(input.startsAt??input.windowStartsAt);if(!start)return.25;
    const days=(start.getTime()-now.getTime())/86_400_000;
    return days<=2?.42:days<=7?.25:.12;
  }
  return .08;
}

export function missedCommitmentImpact(input:{significance?:number;relationshipStage?:string;priorMisses?:number;reason:CommitmentMissReason;advanceNotice?:boolean}):MissedCommitmentImpact{
  if(input.advanceNotice||['system_failure','connection_failure','character_absent','cancelled'].includes(input.reason))return{trust:0,respect:0,conflict:0,affinity:0};
  const significance=Math.max(0,Math.min(1,Number(input.significance??.5)));
  const serious=['dating','exclusive','long_term'].includes(String(input.relationshipStage??''));
  const repeats=Math.min(2,Math.max(0,Number(input.priorMisses??0)));
  const base=1+(significance>=.65?1:0)+(significance>=.85?1:0)+(serious?1:0)+repeats;
  return{trust:-Math.min(5,base),respect:-Math.min(4,Math.max(1,base-1)),conflict:Math.min(5,base),affinity:significance>=.75?-1:0};
}

export function missedCommitmentRepairImpact(input:{impact:Partial<MissedCommitmentImpact>;apology:boolean;credibleReason:boolean;attemptedRepair:boolean;dismissive?:boolean}):MissedCommitmentImpact{
  if(input.dismissive)return{trust:0,respect:-1,conflict:1,affinity:0};
  const lostTrust=Math.max(0,-Number(input.impact.trust??0)),lostRespect=Math.max(0,-Number(input.impact.respect??0)),addedConflict=Math.max(0,Number(input.impact.conflict??0));
  const strength=(input.apology?1:0)+(input.credibleReason?1:0)+(input.attemptedRepair?1:0);
  if(!strength)return{trust:0,respect:0,conflict:0,affinity:0};
  const factor=Math.min(1,.25+strength*.22);
  return{trust:Math.min(lostTrust,Math.max(1,Math.round(lostTrust*factor))),respect:Math.min(lostRespect,Math.round(lostRespect*factor)),conflict:-Math.min(addedConflict,Math.max(1,Math.round(addedConflict*factor))),affinity:input.apology&&input.attemptedRepair?1:0};
}

export function classifyMissExplanation(text:string){
  const lower=text.toLowerCase();
  const apology=/\b(sorry|apolog(?:y|ize|ise|ized|ised)|my fault|feel awful)\b/.test(lower);
  const credibleReason=/\b(emergency|hospital|sick|ill|child|daughter|son|family|accident|work emergency|car broke|phone died|lost service|connection|internet|power outage)\b/.test(lower);
  const attemptedRepair=/\b(make it up|make this right|reschedule|another time|try again|can we still|new date|new time)\b/.test(lower);
  const dismissive=/\b(whatever|not a big deal|calm down|who cares|get over it)\b/.test(lower);
  return{apology,credibleReason,attemptedRepair,dismissive};
}

function parseDate(value?:string|null){if(!value)return null;const date=new Date(value);return Number.isFinite(date.getTime())?date:null;}
function sameLocalDay(a:Date,b:Date,timezone:string){try{const format=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'});return format.format(a)===format.format(b);}catch{return a.toISOString().slice(0,10)===b.toISOString().slice(0,10);}}
