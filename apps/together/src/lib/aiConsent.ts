type Handler = (userId: string, review: boolean) => Promise<boolean>;
let generation=0;
let handler: Handler | null = null;
let cached: { userId: string; expires: number } | null = null;
export function installAiConsentHandler(value: Handler): () => void { handler=value; return()=>{if(handler===value)handler=null;cached=null;generation++;}; }
export function invalidateAiConsent() { cached=null;generation++; }
export async function ensureAiConsent(userId: string, review=false): Promise<boolean> {
  if(!review&&cached?.userId===userId&&cached.expires>Date.now())return true;
  const started=generation;
  const accepted=await handler?.(userId,review)??false;
  if(started!==generation)return false;
  if(accepted)cached={userId,expires:Date.now()+60_000};
  else cached=null;
  return accepted;
}
export function isAiFeatureRequest(name:string,body:unknown):boolean {
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
