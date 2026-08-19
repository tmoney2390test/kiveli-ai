import { buildMemoryRecallPlan, decayEmotionalResidue, isDurableUserMemory, type MemoryActivationContext } from '../../../packages/together-domain/src/index.ts';

type Row = Record<string, any>;
type MemoryRow = Row & { id: string };

export type MemoryContextEntry = { id:string; text:string; type:string; pinned:boolean; importance:number; sourceType?:string; episodeId?:string; locationId?:string|null; worldId?:string|null; contextTags?:string[] };
export type ActivatedMemoryContext = { silent:MemoryContextEntry[]; callbacks:MemoryContextEntry[]; directRecall:MemoryContextEntry[]; callbackAllowance:number; retrievedIds:string[]; debug?:Array<{id:string;activation:number;mode:string;reasonCodes:string[]}> };

const flagEnabled = () => Deno.env.get('KIVELLE_MEMORY_ACTIVATION_V2') !== 'false';

export async function retrieveActivatedMemories(input:{db:any;userId:string;characterInstanceId:string;userMessage:string;intent:string;storedRows:Row[];semanticRows?:Row[];currentScene?:Row|null;relationship?:Row|null;recentAssistantMessages?:Array<{content?:string}>;now:Date}):Promise<ActivatedMemoryContext>{
  const candidates=new Map<string,MemoryRow>();
  for(const item of input.storedRows){const id=String(item.id??'');if(id&&durableRow(item))candidates.set(id,{...item,id});}
  for(const item of input.semanticRows??[]){const id=String(item.id??'');if(!id||!durableRow(item))continue;candidates.set(id,{...(candidates.get(id)??{}),...item,id,metadata:{...(candidates.get(id)?.metadata??{}),...(item.metadata??{})}});}
  if(!flagEnabled()){
    const fallback=[...candidates.values()].slice(0,8).map((row)=>present(row));
    await markRetrieved(input.db,input.userId,fallback.map((item)=>item.id),input.now);
    return{silent:fallback,callbacks:[],directRecall:[],callbackAllowance:0,retrievedIds:fallback.map((item)=>item.id)};
  }
  const scene=input.currentScene??{};
  const recentAssistantMemoryIds=(input.recentAssistantMessages??[]).flatMap((message)=>extractMemoryIds(String(message.content??''),candidates));
  const activation:MemoryActivationContext={now:input.now,query:input.userMessage,intent:input.intent,worldId:scene.worldId??scene.world_id,locationId:scene.locationId??scene.location_id,activityKey:scene.activityKey??scene.activity,interactionKey:scene.lastInteractionKey,participantInstanceIds:Array.isArray(scene.participantInstanceIds)?scene.participantInstanceIds:undefined,relationshipStage:input.relationship?.relationship_stage??input.relationship?.stage,currentMood:scene.mood,recentAssistantMemoryIds};
  const plan=buildMemoryRecallPlan([...candidates.values()],activation,input.intent==='memory_overview'?20:10);
  const silent=plan.silentContext.map((item)=>present(candidates.get(item.id)??{},item));
  const callbacks=plan.callbackCandidates.map((item)=>present(candidates.get(item.id)??{},item));
  const directRecall=plan.directRecall.map((item)=>present(candidates.get(item.id)??{},item));
  const retrievedIds=[...new Set([...silent,...callbacks,...directRecall].map((item)=>item.id))];
  await markRetrieved(input.db,input.userId,retrievedIds,input.now);
  return{silent,callbacks,directRecall,callbackAllowance:plan.explicitCallbackAllowance,retrievedIds,debug:plan.silentContext.concat(plan.callbackCandidates,plan.directRecall).map((item)=>({id:item.id,activation:item.activationScore,mode:item.recallMode,reasonCodes:item.reasonCodes}))};
}

export async function markMentionedMemories(input:{db:any;userId:string;memoryIds:string[];now:Date;reinforcedIds?:string[]}):Promise<void>{
  const ids=[...new Set(input.memoryIds)].filter(Boolean);
  if(ids.length)await input.db.rpc('kivelle_touch_memories',{p_user_id:input.userId,p_memory_ids:ids,p_kind:'mentioned',p_now:input.now.toISOString()});
  const reinforced=[...new Set(input.reinforcedIds??[])].filter(Boolean);
  if(reinforced.length)await input.db.rpc('kivelle_touch_memories',{p_user_id:input.userId,p_memory_ids:reinforced,p_kind:'reinforced',p_now:input.now.toISOString()});
}

export function activeEmotionalResidue(row:Row|null|undefined,now:Date){
  if(!row)return null;
  const intensity=decayEmotionalResidue({intensity:Number(row.intensity??0),startedAt:String(row.started_at),halfLifeMinutes:Number(row.half_life_minutes??120),now});
  return intensity>=.08?{tone:String(row.tone),valence:Number(row.valence??0),intensity,expiresAt:String(row.expires_at)}:null;
}

function present(row:Row,override?:{id:string;canonicalText:string;memoryType:string;importance:number}):MemoryContextEntry{return{id:String(override?.id??row.id),text:String(override?.canonicalText??row.canonical_text??''),type:String(override?.memoryType??row.memory_type??'semantic'),pinned:Boolean(row.pinned),importance:Number(override?.importance??row.importance??.5),sourceType:row.source_type??undefined,episodeId:row.episode_id??undefined,locationId:row.location_id??null,worldId:row.world_id??null,contextTags:Array.isArray(row.context_tags)?row.context_tags.map(String):[]};}
function durableRow(row:Row){return isDurableUserMemory({memoryType:String(row.memory_type??'semantic'),canonicalText:String(row.canonical_text??'')});}
async function markRetrieved(db:any,userId:string,ids:string[],now:Date){if(!ids.length)return;await db.rpc('kivelle_touch_memories',{p_user_id:userId,p_memory_ids:ids,p_kind:'retrieved',p_now:now.toISOString()});}
function extractMemoryIds(content:string,rows:Map<string,Row>){const text=content.toLowerCase();return[...rows.entries()].filter(([,row])=>{const value=String(row.canonical_text??'').toLowerCase();const words=value.split(/[^a-z0-9]+/).filter((word:string)=>word.length>4);return words.length>1&&words.filter((word:string)=>text.includes(word)).length>=2;}).map(([id])=>id);}
