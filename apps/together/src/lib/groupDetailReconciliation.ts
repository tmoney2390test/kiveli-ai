import type { GroupDetail, GroupDetailDelta, GroupTimelinePage } from '../types';
import { mergeReconciledMedia } from './mediaReconciliation';
import { reconcileMessages } from './messageReconciliation';

export function applyGroupDetailDelta(current:GroupDetail,delta:GroupDetailDelta):GroupDetail{
  return{
    ...current,
    conversation:{...current.conversation,...delta.conversation},
    messages:reconcileMessages(current.messages,delta.messages),
    reactions:mergeById(current.reactions,delta.reactions),
    generatedMedia:mergeMedia(current.generatedMedia,delta.generatedMedia),
    mediaOffers:mergeById(current.mediaOffers,delta.mediaOffers),
    sharedPlans:mergeById(current.sharedPlans,delta.sharedPlans),
    conversationActions:mergeById(current.conversationActions,delta.conversationActions),
    conversationEvents:mergeById(current.conversationEvents,delta.conversationEvents),
    syncedAt:delta.syncedAt,
  };
}

export function prependGroupTimelinePage(current:GroupDetail,page:GroupTimelinePage):GroupDetail{
  return{
    ...current,
    messages:reconcileMessages(page.messages,current.messages),
    reactions:mergeById(page.reactions,current.reactions),
    generatedMedia:mergeMedia(page.generatedMedia,current.generatedMedia),
    mediaOffers:mergeById(page.mediaOffers,current.mediaOffers),
    hasMoreMessages:page.hasMore,
  };
}

export function mergeGroupMedia(current:GroupDetail,media:GroupDetail['generatedMedia']):GroupDetail{
  return{...current,generatedMedia:mergeMedia(current.generatedMedia,media)};
}

function mergeMedia(current:GroupDetail['generatedMedia'],next:GroupDetail['generatedMedia']){
  const byId=new Map(current.map((item)=>[item.id,item]));
  for(const item of next)byId.set(item.id,mergeReconciledMedia(byId.get(item.id),item));
  return[...byId.values()].sort((left,right)=>new Date(left.created_at).getTime()-new Date(right.created_at).getTime());
}

function mergeById<T extends{id:string;created_at?:string;updated_at?:string}>(current:T[],next:T[]):T[]{
  const byId=new Map(current.map((item)=>[item.id,item]));
  for(const item of next)byId.set(item.id,{...byId.get(item.id),...item});
  return[...byId.values()].sort((left,right)=>timestamp(left)-timestamp(right));
}
function timestamp(item:{created_at?:string;updated_at?:string}){const value=new Date(item.created_at??item.updated_at??0).getTime();return Number.isFinite(value)?value:0;}
