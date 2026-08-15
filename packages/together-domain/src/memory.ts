import type { MemoryCandidate, MemoryRecord, MemoryType } from './types.ts';

export function canonicalMemoryKey(type:MemoryType,text:string):string{return`${type}:${normalize(text)}`;}
export function extractMemoryCandidates(message:string):MemoryCandidate[]{
  const candidates:MemoryCandidate[]=[];const trimmed=message.trim();
  const pet=/\bmy\s+(dog|cat|pet)(?:'s| is)?\s+name\s+is\s+([a-z][a-z'-]{1,30})\b/i.exec(trimmed);
  if(pet){const animal=pet[1]!.toLowerCase(),name=title(pet[2]!);push(candidates,'semantic',`User's ${animal} is named ${name}.`,.86,.97,'personal',`pet:${animal}:name`,{subject:animal,name});}
  const neutral=/\bi\s+(?:do not|don't)\s+(?:hate|dislike)\s+([^.!?]{2,60}?)(?:\s+anymore|\s+now)?(?:[.!?]|$)/i.exec(trimmed);
  const dislike=!neutral?/\bi\s+(?:really\s+)?(?:hate|can't stand|do not like|don't like)\s+([^.!?]{2,60})/i.exec(trimmed):null;
  const like=/\bi\s+(?:actually\s+)?(?:really\s+)?(?:love|like|enjoy)\s+([^.!?]{2,60}?)(?:\s+now)?(?:[.!?]|$)/i.exec(trimmed);
  if(neutral){const item=cleanObject(neutral[1]!);push(candidates,'preference',`User no longer dislikes ${item}.`,.7,.93,'none',`preference:${normalize(item)}`,{preference:'neutral',item,correction:true});}
  else if(dislike){const item=cleanObject(dislike[1]!);push(candidates,'preference',`User dislikes ${item}.`,.68,.91,'none',`preference:${normalize(item)}`,{preference:'dislike',item});}
  else if(like){const item=cleanObject(like[1]!);push(candidates,'preference',`User likes ${item}.`,.58,.84,'none',`preference:${normalize(item)}`,{preference:'like',item});}
  const emotion=/\bi(?:'m| am)\s+(nervous|anxious|excited|worried|scared)\s+(?:about\s+)?([^.!?]{2,80})/i.exec(trimmed);
  if(emotion){const topic=cleanObject(emotion[2]!);push(candidates,'emotional',`User feels ${emotion[1]!.toLowerCase()} about ${topic}.`,.72,.86,'personal',`emotion:${normalize(topic)}`);}
  return candidates;
}
export function mergeMemory(existing:MemoryRecord|undefined,candidate:MemoryCandidate,now=new Date().toISOString()):MemoryRecord{
  if(!existing)return{id:crypto.randomUUID(),...candidate,pinned:false,status:'active',createdAt:now,updatedAt:now};
  const sameFact=existing.dedupeKey===candidate.dedupeKey;
  return{...existing,...candidate,id:existing.id,pinned:existing.pinned,status:'active',createdAt:existing.createdAt,importance:Math.max(existing.importance,candidate.importance),confidence:sameFact?Math.min(1,Math.max(existing.confidence,candidate.confidence)+.02):candidate.confidence,updatedAt:now,metadata:{...existing.metadata,...candidate.metadata,...(!sameFact?{correctedAt:now,previousText:existing.canonicalText}:{})}};
}
export function rankMemories(memories:readonly MemoryRecord[],query:string,limit=8):MemoryRecord[]{
  const terms=new Set(normalize(query).split(' ').filter((term)=>term.length>2));
  return memories.filter((memory)=>memory.status==='active').map((memory)=>{const words=new Set(normalize(memory.canonicalText).split(' '));let overlap=0;for(const term of terms)if(words.has(term))overlap++;return{memory,score:overlap*2+memory.importance+(memory.pinned?3:0)+(memory.type==='semantic'?1:0)};}).sort((a,b)=>b.score-a.score||b.memory.updatedAt.localeCompare(a.memory.updatedAt)).slice(0,limit).map(({memory})=>memory);
}
function push(target:MemoryCandidate[],type:MemoryType,canonicalText:string,importance:number,confidence:number,sensitivity:MemoryCandidate['sensitivity'],subjectKey:string,metadata?:Record<string,unknown>):void{target.push({type,canonicalText,importance,confidence,sensitivity,dedupeKey:canonicalMemoryKey(type,canonicalText),subjectKey,...(metadata?{metadata}:{})});}
function normalize(value:string):string{return value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function title(value:string):string{return value[0]!.toUpperCase()+value.slice(1).toLowerCase();}
function cleanObject(value:string):string{return value.trim().replace(/\s+(?:a lot|so much|though)$/i,'').toLowerCase();}
