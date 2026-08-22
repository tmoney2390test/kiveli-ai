const PERSISTED_FAILURE_CODES=new Set(['STREAM_INTERRUPTED','PROVIDER_TIMEOUT','PROVIDER_UNAVAILABLE','CONFLICT','UNKNOWN']);

export function dialogueFailureMayHavePersisted(error:unknown):boolean{
  if(error instanceof TypeError)return true;
  if(!error||typeof error!=='object')return false;
  const candidate=error as {code?:unknown;retryable?:unknown;message?:unknown};
  if(candidate.retryable===true)return true;
  if(typeof candidate.code==='string'&&PERSISTED_FAILURE_CODES.has(candidate.code))return true;
  const message=typeof candidate.message==='string'?candidate.message:'';
  return /(?:failed to fetch|network request failed|load failed|stream|connection|reply was interrupted)/i.test(message);
}
