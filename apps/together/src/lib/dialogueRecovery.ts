const PERSISTED_FAILURE_CODES=new Set(['STREAM_INTERRUPTED','PROVIDER_TIMEOUT','PROVIDER_UNAVAILABLE','CONFLICT','UNKNOWN']);

type RecoverableMessage={role:string;client_request_id?:string|null};

export function dialogueFailureMayHavePersisted(error:unknown):boolean{
  if(error instanceof TypeError)return true;
  if(!error||typeof error!=='object')return false;
  const candidate=error as {code?:unknown;retryable?:unknown;message?:unknown};
  if(candidate.retryable===true)return true;
  if(typeof candidate.code==='string'&&PERSISTED_FAILURE_CODES.has(candidate.code))return true;
  const message=typeof candidate.message==='string'?candidate.message:'';
  return /(?:failed to fetch|network request failed|load failed|stream|connection|reply was interrupted)/i.test(message);
}

export function persistedDialogueResponseForRequest<T extends RecoverableMessage>(messages:readonly T[],clientRequestId:string):T|null{
  const userIndex=messages.findIndex((message)=>message.role==='user'&&message.client_request_id===clientRequestId);
  if(userIndex<0)return null;
  return messages.slice(userIndex+1).find((message)=>message.role==='assistant'||message.role==='system')??null;
}
