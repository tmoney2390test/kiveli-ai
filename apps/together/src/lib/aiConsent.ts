type Handler = (userId: string, review: boolean) => Promise<boolean>;
export class AiConsentCheckError extends Error {
  readonly code = 'CONSENT_CHECK_UNAVAILABLE';
  readonly retryable = true;
  constructor() { super('Your privacy choice could not be checked. Please try again.'); }
}
let generation=0;
let handler: Handler | null = null;
let cached: { userId: string; expires: number } | null = null;
export function installAiConsentHandler(value: Handler): () => void {
  handler=value;invalidateAiConsent();
  return()=>{if(handler===value){handler=null;invalidateAiConsent();}};
}
export function invalidateAiConsent() { cached=null;generation++; }
export async function ensureAiConsent(userId: string, review=false): Promise<boolean> {
  if(!review&&cached?.userId===userId&&cached.expires>Date.now())return true;
  if(review)invalidateAiConsent();
  // A failed lookup is not a declined choice. Recheck once after transport
  // failure or a lifecycle invalidation, without starting the AI operation.
  for(let attempt=0;attempt<2;attempt++){
    const current=handler,started=generation;
    if(!current||!userId)throw new AiConsentCheckError();
    let accepted:boolean;
    try{accepted=await current(userId,review&&attempt===0);}
    catch(error){
      cached=null;
      const retryable=error instanceof TypeError||error instanceof AiConsentCheckError
        ||Boolean(error&&typeof error==='object'&&'retryable'in error&&error.retryable===true);
      if(!retryable)throw error;
      if(attempt===0&&handler===current)continue;
      throw new AiConsentCheckError();
    }
    if(handler!==current)throw new AiConsentCheckError();
    if(!accepted){cached=null;return false;}
    if(started!==generation)continue;
    cached={userId,expires:Date.now()+60_000};
    return true;
  }
  throw new AiConsentCheckError();
}
export function isAiFeatureRequest(name:string,body:unknown):boolean {
  if(['together-dialogue','together-group-dialogue'].includes(name)&&body&&typeof body==='object'&&'messageAction'in body&&body.messageAction==='restore')return false;
  const action=body&&typeof body==='object'&&'action'in body?String(body.action):'';
  if(name==='together-dialogue-quote')return true;
  if(['status','options','quote','overview','list','history','abandon','cancel'].includes(action))return false;
  const surface=name.split('?')[0];
  if(['together-dialogue','together-group-dialogue','together-story-dialogue','together-scene-reaction','together-dialogue-suggestion'].includes(surface??''))return true;
  const actions:Record<string,string[]>={
    'together-media':['request','accept_offer','retry','edit','animate','video_direct_generate','enhance_video_prompt'],
    'together-multimodal':['confirm_user_image','request_voice_note','preview_voice'],
    'together-creator':['create_draft','regenerate_draft_section','generate_draft_appearance','quick_create','generate_appearance','update_draft_section','complete_draft_appearance_upload','finalize_draft','update'],
    'together-call':['start','join','transcribe','speak','turn','connect','end'],
    'together-dialogue-quote':['quote'],
  };
  return Boolean(actions[surface??'']?.includes(action));
}
