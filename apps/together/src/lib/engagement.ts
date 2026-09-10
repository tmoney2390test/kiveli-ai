export type EngagementFilters = { from: string; to: string; tier: 'all'|'free'|'paid'; includeInternal: boolean };
export type EngagementReport = EngagementFilters & {
 generatedAt:string; previousFrom:string;
 coverage:{eligibleAccounts:number;excludedInternal:number;optedOut:number;instrumentedSince:string|null;timezone:string};
 summary:{activeUsers:number;chatters:number;messages:number;signups:number;previousChatters:number;previousMessages:number;previousSignups:number;returningChatters:number;paidAccounts:number;active5m:number;dau:number;wau:number;mau:number};
 daily:Array<{day:string;active:number;messages:number;signups:number}>;
 cohorts:Array<{week:string;day:number;eligible:number;returned:number}>;
 activation:{accounts:number;onboardingViewed:number;companionSelected:number;successfulExchange:number;secondChatDay:number};
 characters:Array<{id:string;name:string;slug:string;users:number;messages:number;returning:number}>;
 worlds:Array<{id:string;name:string;users:number;messages:number}>;
 scenarios:Array<{scenario_id:string;sessions:number;users:number;completed:number;paused:number;active:number}>;
 media:Array<{media_type:string;requested:number;ready:number;failed:number;pending:number;p95_ms:number|null;retried:number}>;
 providers:Array<{provider:string;model:string;requests:number;failed:number;cost:number;priced:number;p95_ms:number|null}>;
 features:Array<{event_name:string;events:number;users:number}>;
 proactive:{queued:number;delivered:number;opened:number;suppressed:number;replied:number};
 foreground:{sessions:number;minutes:number;accounts:number};platforms:Array<{platform:string;users:number;minutes:number}>;
};
export function engagementRange(days:number,now=new Date()):Pick<EngagementFilters,'from'|'to'>{
 const to=now.toISOString(),start=new Date(now);start.setUTCDate(start.getUTCDate()-days+1);start.setUTCHours(0,0,0,0);
 return {from:start.toISOString(),to};
}
export function customEngagementRange(from:string,to:string,now=new Date()):Pick<EngagementFilters,'from'|'to'>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))throw new Error('Enter dates as YYYY-MM-DD.');
 const start=new Date(`${from}T00:00:00Z`),last=new Date(`${to}T00:00:00Z`);
 if(!Number.isFinite(+start)||!Number.isFinite(+last)||start.toISOString().slice(0,10)!==from||last.toISOString().slice(0,10)!==to)throw new Error('Enter valid calendar dates.');
 const end=Math.min(+last+86400000,+now);
 if(+start>=end||+last<+start||end-+start>93*86400000)throw new Error('Choose up to 93 days ending today or earlier.');
 return {from:start.toISOString(),to:new Date(end).toISOString()};
}
export function percentage(part:number,total:number):string{return total>0?`${(100*part/total).toFixed(1)}%`:'—';}
export function periodChange(current:number,previous:number):string{
 if(previous===0)return current===0?'No change':'New activity';
 const change=100*(current-previous)/previous;return `${change>0?'+':''}${change.toFixed(1)}% vs previous period`;
}
export function csvCell(value:unknown):string{
 const raw=String(value??'');const safe=/^[\s]*[=+@-]/.test(raw)?`'${raw}`:raw;
 return `"${safe.replace(/"/g,'""')}"`;
}
export function engagementCsv(report:EngagementReport):string{
 const rows:unknown[][]=[['Kivelle aggregate engagement'],['From UTC',report.from],['To UTC',report.to],['Current tier',report.tier],['Include internal',report.includeInternal],['Generated',report.generatedAt],[],['Summary','Value'],...Object.entries(report.summary),[],['Day UTC','Active accounts','Human messages','Signups'],...report.daily.map(d=>[d.day,d.active,d.messages,d.signups]),[],['Signup week UTC','Return day','Eligible','Returned'],...report.cohorts.map(c=>[c.week,c.day,c.eligible,c.returned]),[],['Character','Chatters','Human messages','Chatters on multiple days'],...report.characters.map(c=>[c.name,c.users,c.messages,c.returning]),[],['Current companion world','Chatters','Messages'],...report.worlds.map(w=>[w.name,w.users,w.messages]),[],['Scenario','Sessions','Users','Currently completed','Currently paused','Currently active'],...report.scenarios.map(s=>[s.scenario_id,s.sessions,s.users,s.completed,s.paused,s.active]),[],['Media','Requested','Ready','Failed','Pending','Retried','P95 ms'],...report.media.map(m=>[m.media_type,m.requested,m.ready,m.failed,m.pending,m.retried,m.p95_ms]),[],['Provider','Model','Requests','Failures','Known cost USD','Priced requests','P95 ms'],...report.providers.map(p=>[p.provider,p.model,p.requests,p.failed,p.cost,p.priced,p.p95_ms]),[],['Feature','Events','Accounts'],...report.features.map(f=>[f.event_name,f.events,f.users]),[],['Coverage','Value'],...Object.entries(report.coverage),[],['Definitions','Current tier and world attribution; consented Kivelle accounts only. Costs may be incomplete; no revenue or profit claim. Retention is an exact UTC return day. Historical activity can change after deletion/reset.']];
 return rows.map(r=>r.map(csvCell).join(',')).join('\r\n');
}
export type EngagementSurface='home'|'chat'|'group_chat'|'explore'|'companions'|'scenarios'|'creator'|'call'|'world'|'moments'|'settings'|'onboarding'|'other';
export function engagementSurface(path:string):EngagementSurface|null{
 const route=path.split('?')[0]!.replace(/\/$/,'')||'/';
 if(/^\/(ops|debug|auth|login|sign-in|age-confirmation)(\/|$)/.test(route))return null;
 if(route==='/'||route==='/home')return 'home';
 if(route.startsWith('/create/companion'))return 'creator';
 if(route.startsWith('/world/')||route.startsWith('/location/'))return 'world';
 const map:Record<string,EngagementSurface>={'/chat':'chat','/group-chat':'group_chat','/explore':'explore','/discover':'explore','/companions':'companions','/scenarios':'scenarios','/create-companion':'creator','/call':'call','/world':'world','/moments':'moments','/settings':'settings','/choose-companion':'onboarding'};
 return map[route]??'other';
}
