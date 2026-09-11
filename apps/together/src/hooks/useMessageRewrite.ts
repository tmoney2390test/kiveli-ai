import { useEffect, useRef, useState } from 'react';
import { canRewriteMessage, messageRewriteVersion } from '@together/domain/src/message-rewrite';
import { quoteDialogueContext, rewriteDialogueMessage } from '../lib/api';
import { createClientRequestId } from '../lib/requestId';
import { confirmAction } from '../lib/dialogs';
import type { Conversation, Message, Snapshot } from '../types';

type Options={userId?:string;profile?:Snapshot['profile'];conversation?:Conversation|null;messages:Message[];pending:boolean;characterInstanceId?:string;onMessage:(message:Message)=>void;onError:(message:string)=>void;onFinished:()=>void};
export function useMessageRewrite(options:Options){
  const [busy,setBusy]=useState(false);
  const live=useRef(options);live.current=options;
  const inFlight=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const preference=(options.conversation?.metadata?.chatPreferences as {contentMode?:unknown}|undefined)?.contentMode??options.profile?.content_preferences?.contentMode;
  const available=(message:Message)=>Boolean(options.profile?.age_verified_at)&&preference==='explicit'&&!busy&&!options.pending&&canRewriteMessage(message,options.messages);
  async function run(message:Message,action:'spice'|'restore'){
    const start=live.current,scope=`${start.userId}:${start.conversation?.id}`;
    const current=()=>mounted.current&&`${live.current.userId}:${live.current.conversation?.id}`===scope;
    if(inFlight.current||start.pending||!start.userId||!start.conversation||!canRewriteMessage(message,start.messages))return;
    inFlight.current=true;setBusy(true);start.onError('');
    const payload={conversationId:start.conversation.id,...(start.characterInstanceId?{characterInstanceId:start.characterInstanceId}:{}),anchorMessageId:message.id,expectedRevision:messageRewriteVersion(message),messageAction:action,clientRequestId:createClientRequestId()};
    const submit=async(contextQuoteId?:string)=>{
      if(!current()||live.current.pending||!canRewriteMessage(message,live.current.messages))return;
      inFlight.current=true;setBusy(true);
      try{
        const result=await rewriteDialogueMessage(start.conversation?.kind==='group',{...payload,...(contextQuoteId?{contextQuoteId}:{}),...(action==='restore'?{contextPreference:'included' as const}:{})});
        if(current()){live.current.onMessage(result.message);live.current.onFinished();}
      }catch(error){if(current())live.current.onError(error instanceof Error?error.message:'The reply could not be rewritten. Your original reply is unchanged.');}
      finally{inFlight.current=false;if(mounted.current)setBusy(false);}
    };
    try{
      if(action==='restore'){await submit();return;}
      const quote=await quoteDialogueContext(payload);
      if(!current())return;
      if(quote.maximumCredits>0){
        inFlight.current=false;setBusy(false);
        confirmAction({title:'Spice this reply?',message:`Uses one message and up to ${quote.maximumCredits} Kivelli credits. Your original reply can be restored.`,confirmLabel:'Spice',onConfirm:async()=>{if(!inFlight.current)await submit(quote.quoteId);}});
      }else await submit(quote.quoteId);
    }catch(error){if(current())live.current.onError(error instanceof Error?error.message:'The reply could not be prepared.');}
    finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  return {busy,available,spice:(message:Message)=>run(message,'spice'),restore:(message:Message)=>run(message,'restore')};
}
