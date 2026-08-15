import type { OpenThread } from './types.ts';

export function extractOpenThreads(message:string,now=new Date()):OpenThread[]{
  const presentation=/\b(?:i\s+)?(?:have|got|give|giving)\s+(?:a\s+)?(?:huge|big|important)?\s*(presentation|interview|exam|appointment)\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(message);
  if(!presentation)return[];
  const topic=presentation[1]!.toLowerCase(),expectedAt=resolveDay(presentation[2]!.toLowerCase(),now).toISOString();
  return[{topic:`Ask how the user's ${topic} went.`,dedupeKey:`event:${topic}:${expectedAt.slice(0,10)}`,expectedAt,importance:.84,createdAt:now.toISOString(),followUpEligible:false}];
}
export function updateThreadEligibility(thread:OpenThread,now=new Date()):OpenThread{
  if(thread.resolvedAt||!thread.expectedAt)return thread;
  return{...thread,followUpEligible:now.getTime()>=new Date(thread.expectedAt).getTime()};
}
export function resolveAnsweredThreads(threads:readonly OpenThread[],message:string,now=new Date()):OpenThread[]{
  const outcome=/\b(went|was|did|finished|done|nailed|passed|failed|great|well|bad|okay|ok|terrible|over)\b/i.test(message);
  return threads.map((thread)=>{
    const subject=thread.topic.match(/user's\s+([a-z]+)/i)?.[1]??'';
    const refersToSubject=Boolean(subject&&new RegExp(`\\b${subject}\\b`,'i').test(message))||/\b(it|that)\b/i.test(message);
    return thread.followUpEligible&&outcome&&refersToSubject&&!thread.resolvedAt?{...thread,resolvedAt:now.toISOString(),followUpEligible:false}:thread;
  });
}
function resolveDay(word:string,now:Date):Date{
  const result=new Date(now);result.setUTCHours(12,0,0,0);if(word==='today')return result;if(word==='tomorrow'){result.setUTCDate(result.getUTCDate()+1);return result;}
  const index=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(word);const delta=(index-result.getUTCDay()+7)%7;result.setUTCDate(result.getUTCDate()+(delta===0?7:delta));return result;
}
