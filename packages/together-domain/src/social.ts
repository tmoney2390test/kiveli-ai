import type { KnowledgeFact, KnowledgeTransfer } from './types.ts';

export function transferKnowledge(fact:KnowledgeFact,input:{fromInstanceId:string;toInstanceId:string;eventId:string;reason:string;allowSensitive:boolean;now?:Date}):KnowledgeTransfer|null{
  if(fact.ownerInstanceId!==input.fromInstanceId)return null;
  if(fact.sensitivity==='sensitive'&&!input.allowSensitive)return null;
  return{factId:fact.id,fromInstanceId:input.fromInstanceId,toInstanceId:input.toInstanceId,eventId:input.eventId,reason:input.reason,createdAt:(input.now??new Date()).toISOString()};
}
export function characterKnows(fact:KnowledgeFact,instanceId:string,transfers:readonly KnowledgeTransfer[]):boolean{return fact.ownerInstanceId===instanceId||transfers.some((transfer)=>transfer.factId===fact.id&&transfer.toInstanceId===instanceId);}
