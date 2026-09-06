const PERSISTED_FAILURE_CODES=new Set(['STREAM_INTERRUPTED','PROVIDER_TIMEOUT','PROVIDER_UNAVAILABLE','CONFLICT','UNKNOWN']);

// A disconnected browser can lose the terminal stream event while the edge
// function continues normally. Keep looking beyond the current p95 first-token
// window so a persisted reply replaces the optimistic row without a refresh.
export const DIALOGUE_RECOVERY_DELAYS_MS=[250,750,1_500,3_000,5_000,7_500,10_000] as const;
// Dialogue turns use a three-minute server lease. A persisted user message with
// no response is safe to replay only after that lease has had time to expire;
// replaying sooner could run the same provider request twice.
export const STALE_DIALOGUE_REPLAY_AFTER_MS=185_000;

type RecoverableMessage={
  role:string;
  client_request_id?:string|null;
  delivery_status?:string|null;
  created_at?:string|null;
  provider_metadata?:Record<string,unknown>|null;
};

export function dialogueFailureMayHavePersisted(error:unknown):boolean{
  if(error instanceof TypeError)return true;
  if(!error||typeof error!=='object')return false;
  const candidate=error as {code?:unknown;retryable?:unknown;message?:unknown;name?:unknown};
  if(candidate.name==='AbortError')return true;
  if(candidate.retryable===true)return true;
  if(typeof candidate.code==='string'&&PERSISTED_FAILURE_CODES.has(candidate.code))return true;
  const message=typeof candidate.message==='string'?candidate.message:'';
  return /(?:failed to fetch|network(?: request)?\s*(?:failed|error)|load failed|stream|connection|offline|timed? out|taking longer|reply was interrupted)/i.test(message);
}

export function persistedDialogueResponseForRequest<T extends RecoverableMessage>(messages:readonly T[],clientRequestId:string):T|null{
  const userIndex=messages.findIndex((message)=>message.role==='user'&&message.client_request_id===clientRequestId);
  if(userIndex<0)return null;
  return messages.slice(userIndex+1).find((message)=>message.role==='assistant'||message.role==='system')??null;
}

export function latestUnansweredDialogueRequest<T extends RecoverableMessage>(messages:readonly T[]):T|null{
  for(let index=messages.length-1;index>=0;index-=1){
    const message=messages[index]!;
    if(message.role==='assistant'||message.role==='system')return null;
    if(message.role==='user')return message.delivery_status==='complete'&&
        typeof message.client_request_id==='string'&&
        message.client_request_id.length>0&&
        message.provider_metadata?.uiHidden!==true
      ?message
      :null;
  }
  return null;
}

export function staleDialogueReplayDelay(message:RecoverableMessage,nowMs=Date.now()):number|null{
  const createdAt=Date.parse(String(message.created_at??''));
  if(!Number.isFinite(createdAt))return null;
  return Math.max(0,createdAt+STALE_DIALOGUE_REPLAY_AFTER_MS-nowMs);
}
