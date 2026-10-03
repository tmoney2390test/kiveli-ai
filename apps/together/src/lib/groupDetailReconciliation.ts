import type { GroupDetail, GroupDetailDelta, GroupTimelinePage } from '../types';
import { mergeReconciledMedia } from './mediaReconciliation';
import { reconcileMessages } from './messageReconciliation';

export function applyGroupDetailDelta(current:GroupDetail,delta:GroupDetailDelta):GroupDetail{
  if (current.conversation.id !== delta.conversation.id || olderSnapshot(current, delta)) return current;
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

/** A full refresh contains only the latest message page, not the entire loaded history. */
export function mergeGroupDetailRefresh(current:GroupDetail|null,next:GroupDetail,removeMessageIds:string[]=[]):GroupDetail{
  if(!current||current.conversation.id!==next.conversation.id)return next;
  if(olderSnapshot(current,next))return current;
  let messages=reconcileMessages(current.messages,next.messages,removeMessageIds);
  const refreshedIds=new Set(next.messages.map(message=>message.id));
  let firstRefreshedIndex=messages.findIndex(message=>refreshedIds.has(message.id));
  if(next.hasMoreMessages&&firstRefreshedIndex>0&&!current.messages.some(message=>refreshedIds.has(message.id))){
    // More than a page may have arrived while away. Keep a contiguous latest
    // page so "load older" can fill the gap, instead of silently claiming that
    // two disconnected windows are complete history. Unsent rows remain visible.
    messages=messages.filter((message,index)=>index>=firstRefreshedIndex||message.id.startsWith('local-'));
    firstRefreshedIndex=messages.findIndex(message=>refreshedIds.has(message.id));
  }
  const retainedIds=new Set(messages.slice(0,Math.max(0,firstRefreshedIndex)).map(message=>message.id));
  // Rows omitted from the refreshed page are authoritative removals there.
  // Only keep assets/reactions belonging to history outside that page. In
  // particular, do not resurrect dismissed actions or missing active offers.
  const outsidePage=<T extends {message_id?:string|null}>(rows:T[])=>rows.filter(row=>row.message_id&&retainedIds.has(row.message_id));
  const oldest=messages[0]?.id;
  const retainedOlderPage=Boolean(oldest&&!oldest.startsWith('local-')&&oldest===current.messages[0]?.id&&oldest!==next.messages[0]?.id);
  return{
    ...next,
    messages,
    reactions:mergeById(outsidePage(current.reactions),next.reactions),
    generatedMedia:mergeMedia(outsidePage(current.generatedMedia),next.generatedMedia),
    mediaOffers:mergeById(outsidePage(current.mediaOffers),next.mediaOffers),
    hasMoreMessages:retainedOlderPage?current.hasMoreMessages:next.hasMoreMessages,
  };
}

function olderSnapshot(current:{syncedAt?:string},incoming:{syncedAt?:string}):boolean{
  return Date.parse(incoming.syncedAt??'')<Date.parse(current.syncedAt??'');
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
