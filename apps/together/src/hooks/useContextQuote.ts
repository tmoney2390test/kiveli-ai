import { useEffect, useRef, useState } from 'react';
import { normalizeContextPreference, type DialogueContextQuote } from '@together/domain/src/chat-context';
import { quoteDialogueContext } from '../lib/api';

type Draft=Record<string,unknown>;
function draftKey(value:Draft):string{return JSON.stringify({conversationId:value.conversationId,characterInstanceId:value.characterInstanceId,message:String(value.message??'').trim(),focusPlanId:value.focusPlanId,sceneActionId:value.sceneActionId,entryContext:value.entryContext,attachmentIds:value.attachmentIds??[],mentionedCharacterInstanceIds:value.mentionedCharacterInstanceIds??[],replyToMessageId:value.replyToMessageId,manualSpeakerInstanceId:value.manualSpeakerInstanceId,broadGroupRequest:value.broadGroupRequest===true,letThemTalk:value.letThemTalk===true,messageAction:value.messageAction,anchorMessageId:value.anchorMessageId});}
export function useContextQuote({preference,draft,revision,paused=false,hasPendingPhoto=false}:{preference:unknown;draft:Draft;revision:string;paused?:boolean;hasPendingPhoto?:boolean}){
  const selected=normalizeContextPreference(preference);
  const [included,setIncluded]=useState(false),[quote,setQuote]=useState<DialogueContextQuote|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[refresh,setRefresh]=useState(0);
  const current=useRef<{key:string;quote:DialogueContextQuote}|null>(null),generation=useRef(0);
  const key=draftKey(draft),enabled=selected!=='included'&&!included;
  useEffect(()=>{if(paused)setIncluded(false);},[paused]);
  useEffect(()=>{setIncluded(false);},[selected,draft.conversationId]);
  useEffect(()=>{
    const run=++generation.current;current.current=null;setQuote(null);setError('');setLoading(false);
    if(!enabled||paused||!draft.conversationId||!String(draft.message??'').trim())return;
    if(hasPendingPhoto){setError('Choose Included below for this photo message.');return;}
    const controller=new AbortController();let expiry:ReturnType<typeof setTimeout>|undefined;
    setLoading(true);
    const timer=setTimeout(()=>{void quoteDialogueContext(JSON.parse(key),controller.signal).then((result)=>{
      if(run!==generation.current)return;
      current.current={key,quote:result};setQuote(result);setLoading(false);
      expiry=setTimeout(()=>setRefresh((value)=>value+1),Math.max(500,Date.parse(result.expiresAt)-Date.now()-3000));
    }).catch((caught)=>{if(run!==generation.current||controller.signal.aborted)return;setLoading(false);setError(caught instanceof Error?caught.message:'The message price is unavailable.');});},700);
    return()=>{clearTimeout(timer);if(expiry)clearTimeout(expiry);controller.abort();};
  // The canonical key includes all charge-affecting draft inputs.
  },[key,revision,enabled,paused,hasPendingPhoto,refresh]);
  async function authorize(payload:Draft):Promise<{contextQuoteId?:string;contextPreference?:'included'}|null>{
    if(!enabled)return{contextPreference:'included'};
    if(hasPendingPhoto){setError('Choose Included below for this photo message.');return null;}
    const requested=draftKey(payload),active=current.current;
    if(active?.key===requested&&Date.parse(active.quote.expiresAt)>Date.now()+1000)return{contextQuoteId:active.quote.quoteId};
    if(loading)return null;
    const run=generation.current;
    setLoading(true);setError('');
    try{const next=await quoteDialogueContext(JSON.parse(requested));if(run!==generation.current)return null;current.current={key:requested,quote:next};setQuote(next);setError('Price updated. Tap the action again to send at this maximum.');}
    catch(caught){setError(caught instanceof Error?caught.message:'The message price is unavailable.');}
    finally{setLoading(false);}
    return null;
  }
  return{selected,included,quote,error,loading,visible:selected!=='included',blocked:enabled&&(loading||!quote||hasPendingPhoto),useIncluded:()=>setIncluded(true),useSelected:()=>setIncluded(false),retry:()=>setRefresh((value)=>value+1),authorize};
}
