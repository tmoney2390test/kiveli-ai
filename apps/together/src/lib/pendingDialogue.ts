export type PendingDialogue={
  conversationId:string;
  characterInstanceId:string;
  clientRequestId:string;
  startedAt:string;
  showTyping:boolean;
};

export type PendingDialogueMap=Record<string,PendingDialogue>;

// The server's reply lease is three minutes. Release an orphaned client turn
// shortly afterward so a suspended browser tab cannot lock the composer forever.
export const STALLED_PENDING_DIALOGUE_AFTER_MS=190_000;

export function stalledPendingDialogueDelay(pending:PendingDialogue,nowMs=Date.now()):number{
  const startedAt=Date.parse(pending.startedAt);
  return Number.isFinite(startedAt)?Math.max(0,startedAt+STALLED_PENDING_DIALOGUE_AFTER_MS-nowMs):0;
}

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
