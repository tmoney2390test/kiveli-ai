export type PendingDialogue={
  conversationId:string;
  characterInstanceId:string;
  clientRequestId:string;
  startedAt:string;
  showTyping:boolean;
};

export type PendingDialogueMap=Record<string,PendingDialogue>;

export function beginPendingDialogue(current:PendingDialogueMap,pending:PendingDialogue):PendingDialogueMap{
  return{...current,[pending.conversationId]:pending};
}

export function finishPendingDialogue(current:PendingDialogueMap,conversationId:string,clientRequestId:string):PendingDialogueMap{
  const pending=current[conversationId];
  if(!pending||pending.clientRequestId!==clientRequestId)return current;
  const next={...current};
  delete next[conversationId];
  return next;
}
