/** Branching currently starts from the latest completed direct-chat reply.
 * A copied prefix is history, not a writable message in this path. */
export function canOfferChatBranch(input:{
  conversationKind:string;
  isBranch:boolean;
  latestAssistantMessageId:string|null;
  candidateMessageId:string;
  candidateIsPrefix:boolean;
  replyPending:boolean;
  pendingImage:boolean;
  branching:boolean;
}):boolean{
  return (input.conversationKind==='direct'||input.conversationKind==='first_meeting')
    &&!input.isBranch&&!input.candidateIsPrefix
    &&Boolean(input.latestAssistantMessageId)
    &&input.candidateMessageId===input.latestAssistantMessageId
    &&!input.replyPending&&!input.pendingImage&&!input.branching;
}
