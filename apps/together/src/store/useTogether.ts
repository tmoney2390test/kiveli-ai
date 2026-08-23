import { create } from 'zustand';
import { loadSnapshot } from '../lib/api';
import type { CharacterInstance, Conversation, ConversationAction, GeneratedMedia, Memory, Moment, Relationship, SceneSession, SharedPlan, Snapshot, SnapshotDelta } from '../types';
import { demoSnapshot } from '../demo';
import{beginPendingDialogue,finishPendingDialogue,type PendingDialogue,type PendingDialogueMap}from'../lib/pendingDialogue';
import { mergeReconciledMedia } from '../lib/mediaReconciliation';
import { mergeInboxConversations } from '../lib/messageInbox';

type State={
  snapshot:Snapshot|null;
  browsedWorldId:string|null;
  loading:boolean;
  error:string|null;
  pendingDialogues:PendingDialogueMap;
  setSnapshot:(snapshot:Snapshot)=>void;
  setCoreState:(delta:Partial<Snapshot>)=>void;
  updateCompanion:(companion:CharacterInstance)=>void;
  updateRelationship:(relationship:Relationship)=>void;
  upsertConversation:(conversation:Conversation)=>void;
  upsertMemory:(memory:Memory)=>void;
  removeMemory:(memoryId:string)=>void;
  upsertMoment:(moment:Moment)=>void;
  upsertPlan:(plan:SharedPlan)=>void;
  upsertMedia:(media:GeneratedMedia)=>void;
  removeMedia:(mediaId:string)=>void;
  upsertConversationAction:(action:ConversationAction)=>void;
  removeConversationAction:(actionId:string)=>void;
  upsertSceneSession:(scene:SceneSession)=>void;
  applyServerDelta:(delta:SnapshotDelta)=>void;
  setBrowsedWorldId:(worldId:string|null)=>void;
  beginPendingDialogue:(pending:PendingDialogue)=>void;
  finishPendingDialogue:(conversationId:string,clientRequestId:string)=>void;
  refresh:(options?:{force?:boolean})=>Promise<void>;
  clear:()=>void;
};
const demoMode=__DEV__&&process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE==='true';
let refreshRequest:Promise<void>|null=null;
let refreshGeneration=0;
let refreshSequence=0;
export const useTogether=create<State>((set)=>{
  const patchSnapshot=(update:(snapshot:Snapshot)=>Snapshot)=>set((state)=>state.snapshot?{snapshot:update(state.snapshot),error:null}:state);
  return {snapshot:demoMode?demoSnapshot:null,browsedWorldId:null,loading:false,error:null,pendingDialogues:{},
    setSnapshot:(snapshot)=>set({snapshot,loading:false,error:null}),
    setCoreState:(delta)=>patchSnapshot((snapshot)=>({...snapshot,...delta})),
    updateCompanion:(companion)=>patchSnapshot((snapshot)=>({...snapshot,characters:upsert(snapshot.characters,companion)})),
    updateRelationship:(relationship)=>patchSnapshot((snapshot)=>({...snapshot,relationships:upsert(snapshot.relationships,relationship,'character_instance_id')})),
    upsertConversation:(conversation)=>patchSnapshot((snapshot)=>({...snapshot,conversations:upsert(snapshot.conversations,conversation)})),
    upsertMemory:(memory)=>patchSnapshot((snapshot)=>({...snapshot,memories:upsert(snapshot.memories,memory)})),
    removeMemory:(memoryId)=>patchSnapshot((snapshot)=>({...snapshot,memories:snapshot.memories.filter((item)=>item.id!==memoryId)})),
    upsertMoment:(moment)=>patchSnapshot((snapshot)=>({...snapshot,moments:upsert(snapshot.moments,moment)})),
    upsertPlan:(plan)=>patchSnapshot((snapshot)=>({...snapshot,sharedPlans:upsert(snapshot.sharedPlans,plan)})),
    upsertMedia:(media)=>patchSnapshot((snapshot)=>{
      const current=(snapshot.generatedMedia??[]).find((item)=>item.id===media.id);
      return{...snapshot,generatedMedia:upsert(snapshot.generatedMedia??[],mergeReconciledMedia(current,media))};
    }),
    removeMedia:(mediaId)=>patchSnapshot((snapshot)=>({...snapshot,generatedMedia:(snapshot.generatedMedia??[]).filter((item)=>item.id!==mediaId)})),
    upsertConversationAction:(action)=>patchSnapshot((snapshot)=>({...snapshot,conversationActions:upsert(snapshot.conversationActions??[],action)})),
    removeConversationAction:(actionId)=>patchSnapshot((snapshot)=>({...snapshot,conversationActions:(snapshot.conversationActions??[]).filter((item)=>item.id!==actionId)})),
    upsertSceneSession:(scene)=>patchSnapshot((snapshot)=>({...snapshot,sceneSessions:upsert(snapshot.sceneSessions??[],scene)})),
    applyServerDelta:(delta)=>patchSnapshot((snapshot)=>{
      const scope=<T extends{character_instance_id:string}>(current:T[]|undefined,next:T[]|undefined)=>next?[...(current??[]).filter((item)=>item.character_instance_id!==delta.characterInstanceId),...next]:current;
      return {...snapshot,
        characters:delta.character?upsert(snapshot.characters,delta.character):snapshot.characters,
        relationships:delta.relationship?upsert(snapshot.relationships,delta.relationship,'character_instance_id'):snapshot.relationships,
        conversations:delta.conversation?upsert(snapshot.conversations,delta.conversation):snapshot.conversations,
        memories:scope(snapshot.memories,delta.memories)??snapshot.memories,
        openThreads:scope(snapshot.openThreads,delta.openThreads)??snapshot.openThreads,
        relationshipMilestones:scope(snapshot.relationshipMilestones,delta.relationshipMilestones),
        conversationActions:scope(snapshot.conversationActions,delta.conversationActions),
        sharedPlans:scope(snapshot.sharedPlans,delta.sharedPlans)??snapshot.sharedPlans,
        dates:scope(snapshot.dates,delta.dates)??snapshot.dates,
        lifeEvents:scope(snapshot.lifeEvents as Array<Snapshot['lifeEvents'][number]&{character_instance_id:string}>,delta.lifeEvents as Array<Snapshot['lifeEvents'][number]&{character_instance_id:string}>|undefined)??snapshot.lifeEvents,
        storyArcs:scope(snapshot.storyArcs,delta.storyArcs),
        relationshipPlaces:scope(snapshot.relationshipPlaces,delta.relationshipPlaces),
        conversationEvents:delta.conversationEvents?mergeMany(snapshot.conversationEvents,delta.conversationEvents):snapshot.conversationEvents,
      };
    }),
    setBrowsedWorldId:(browsedWorldId)=>set({browsedWorldId}),
    beginPendingDialogue:(pending)=>set((state)=>({pendingDialogues:beginPendingDialogue(state.pendingDialogues,pending)})),
    finishPendingDialogue:(conversationId,clientRequestId)=>set((state)=>({pendingDialogues:finishPendingDialogue(state.pendingDialogues,conversationId,clientRequestId)})),
    refresh:async(options)=>{
      if(demoMode)return;
      if(refreshRequest&&!options?.force)return refreshRequest;
      const generation=refreshGeneration;
      const sequence=++refreshSequence;
      set({loading:true,error:null});
      const request=(async()=>{try{const snapshot=await loadSnapshot();if(generation===refreshGeneration&&sequence===refreshSequence)set((state)=>({snapshot:{...snapshot,conversations:mergeInboxConversations(snapshot.conversations,state.snapshot?.conversations??[])},loading:false,error:null}));}catch(error){if(generation===refreshGeneration&&sequence===refreshSequence)set({loading:false,error:error instanceof Error?error.message:'Could not load Kivelle.'});}finally{if(generation===refreshGeneration&&sequence===refreshSequence)refreshRequest=null;}})();
      refreshRequest=request;
      return request;
    },
    clear:()=>{refreshGeneration+=1;refreshSequence+=1;refreshRequest=null;set({snapshot:demoMode?demoSnapshot:null,browsedWorldId:null,loading:false,error:null,pendingDialogues:{}});},
  };
});

function upsert<T extends Record<string,unknown>>(items:T[],item:T,key:'id'|'character_instance_id'='id'):T[]{const value=item[key];const index=items.findIndex((entry)=>entry[key]===value);if(index<0)return[item,...items];return items.map((entry,position)=>position===index?item:entry);}
function mergeMany<T extends Record<string,unknown>>(items:T[],next:T[]):T[]{return next.reduce((current,item)=>upsert(current,item),items);}
