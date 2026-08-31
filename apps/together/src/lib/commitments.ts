import{invoke}from'./api';
import type { PlanCompletionReason, PlanExperience, PlanParticipantResponse } from '../types';
import { createClientRequestId } from './requestId';

export type CommitmentTimePrecision='exact'|'approximate'|'daypart'|'window'|'day';
export type CommitmentTemporalState='future'|'today'|'imminent'|'en_route'|'active'|'grace'|'expired';
export type CommitmentAttendance={id:string;participant_type:'user'|'character';joined_at:string;left_at?:string|null};
export type MissResolution={id:string;status:'awaiting_explanation'|'explained'|'repaired'|'unresolved'|'resolved';miss_reason:'user_absent'|'character_absent'|'system_failure'|'connection_failure'|'cancelled';explanation?:string|null;impact_applied?:Record<string,number>;repair_impact?:Record<string,number>;metadata?:Record<string,unknown>};
export type PlanTranscriptMessage={id:string;role:'user'|'assistant';content:string;created_at:string;character_instance_id:string|null;speaker_character_instance_id:string|null};
export type PlanHistoryMedia={id:string;source:'generated'|'shared';signed_url:string;created_at:string;character_instance_id:string|null;message_id:string|null;width:number|null;height:number|null;content_type:string};
export type PlanHistory={captured_at:string|null;transcript:PlanTranscriptMessage[];transcript_truncated:boolean;media:PlanHistoryMedia[]};
export type Commitment={id:string;character_instance_id:string;participant_instance_ids?:string[];participant_responses?:PlanParticipantResponse[];source_conversation_id?:string|null;title:string;activity_key:string;world_id?:string|null;location_id?:string|null;starts_at?:string|null;ends_at?:string|null;window_starts_at?:string|null;window_ends_at?:string|null;time_precision?:CommitmentTimePrecision;world_timezone?:string|null;user_timezone?:string|null;original_time_expression?:string|null;participation_mode?:'live'|'flexible'|'ambient';grace_minutes?:number;grace_ends_at?:string|null;status:'proposed'|'scheduled'|'active'|'completed'|'missed'|'cancelled';missed_at?:string|null;miss_reason?:string|null;companion_state?:'expected'|'late'|'absent'|'cancelled';companion_eta_at?:string|null;companion_reason?:string|null;participation_level?:'arrived'|'brief'|'participated'|'meaningful'|null;finalized_at?:string|null;completed_at?:string|null;completion_reason?:PlanCompletionReason|null;scene_episode_id?:string|null;source?:string;note?:string|null;metadata?:Record<string,unknown>;history?:PlanHistory;temporalState?:CommitmentTemporalState;attendance?:{user:CommitmentAttendance|null;character:CommitmentAttendance|null};missResolution?:MissResolution|null;together_locations?:{id?:string;name?:string;slug?:string}|null;together_worlds?:{name?:string;slug?:string;timezone?:string}|null};

export const getCommitment=(planId:string)=>invoke<Commitment>('together-plan',{action:'get',planId});
export const joinCommitment=(planId:string,characterInstanceId:string,requestId=createClientRequestId())=>invoke<PlanExperience>('together-plan',{action:'join',planId,characterInstanceId,requestId});
export const getPlanExperience=(planId:string,characterInstanceId:string)=>invoke<PlanExperience>('together-plan',{action:'experience',planId,characterInstanceId});
export const endPlanExperience=(planId:string,characterInstanceId:string,sceneId?:string,requestId=createClientRequestId())=>invoke<PlanExperience>('together-plan',{action:'end',planId,characterInstanceId,sceneId,requestId});
export const switchPlanExperience=<T=PlanExperience>(input:{currentPlanId:string;characterInstanceId:string;activityKey:string;locationId:string;sourceConversationId:string;sceneId?:string;requestId?:string})=>invoke<T>('together-plan',{action:'switch',...input,requestId:input.requestId??createClientRequestId()});
/** @deprecated Use endPlanExperience for user-facing copy and intent. */
export const wrapPlanExperience=(planId:string,characterInstanceId:string,sceneId?:string,requestId=createClientRequestId())=>invoke<PlanExperience>('together-plan',{action:'wrap_up',planId,characterInstanceId,sceneId,requestId});
export const leaveCommitment=(planId:string,requestId=createClientRequestId())=>invoke<PlanExperience>('together-plan',{action:'leave',planId,requestId});
export const explainMissedCommitment=(planId:string,characterInstanceId:string,explanation:string,conversationId?:string)=>invoke<Commitment>('together-plan',{action:'explain_miss',planId,characterInstanceId,explanation,conversationId});
export const rescheduleCommitment=(planId:string,input:{startsAt?:string;windowStartsAt?:string;windowEndsAt?:string;timePrecision?:CommitmentTimePrecision;originalTimeExpression?:string;conversationId?:string})=>invoke<Commitment>('together-plan',{action:'reschedule',planId,...input});
export const createCommitment=<T=unknown>(input:{characterInstanceId:string;activityKey:string;locationId:string;startsAt?:string;windowStartsAt?:string;windowEndsAt?:string;timePrecision?:CommitmentTimePrecision;originalTimeExpression?:string;participationMode?:'live'|'flexible'|'ambient';requestId:string;note?:string;title?:string;source?:'chat'|'manual_planner'|'location'|'discover'|'date'|'story';sourceConversationId?:string})=>invoke<T>('together-plan',{action:'create',source:'manual_planner',...input});

export function commitmentTemporalState(plan:Commitment,now=new Date()):CommitmentTemporalState{
 if(['completed','missed','cancelled'].includes(plan.status))return'expired';
 const start=parse(plan.starts_at??plan.window_starts_at),end=parse(plan.ends_at??plan.window_ends_at),grace=parse(plan.grace_ends_at);if(!start)return'future';
 const nowMs=now.getTime(),startMs=start.getTime(),endMs=end?.getTime()??startMs+90*60000;
 if(nowMs>=endMs)return'expired';
 if(nowMs>=startMs){if((plan.participation_mode??'live')==='live'&&!plan.attendance?.user&&nowMs<(grace?.getTime()??startMs+30*60000))return'grace';return'active';}
 const until=startMs-nowMs;if(until<=20*60000)return'en_route';if(until<=90*60000)return'imminent';if(sameDay(start,now,plan.user_timezone??deviceTimezone()))return'today';return'future';
}
export function commitmentTimeLabel(plan:Commitment,viewerTimezone?:string){
 const timezone=viewerTimezone??plan.user_timezone??deviceTimezone();
 if(!plan.starts_at){if(plan.original_time_expression)return plan.original_time_expression;if(plan.window_starts_at&&plan.window_ends_at)return`${formatAt(plan.window_starts_at,timezone)} – ${formatAt(plan.window_ends_at,timezone)}`;return'Time not settled';}
 return formatAt(plan.starts_at,timezone);
}
export function commitmentStatusLabel(plan:Commitment){const state=plan.temporalState??commitmentTemporalState(plan);if(plan.status==='missed')return'MISSED';if(plan.status==='completed')return'SHARED';if(plan.status==='cancelled')return'CANCELLED';if(plan.status==='proposed')return'TIME TO SET';return state==='grace'?'WAITING FOR YOU':state==='en_route'?'STARTING SOON':state==='imminent'?'COMING UP':state==='today'?'TODAY':state==='active'?'HAPPENING NOW':'UPCOMING';}
export function planCompletionLabel(plan:Pick<Commitment,'completion_reason'|'completed_at'|'ends_at'>){if(plan.completion_reason==='user_ended')return'You ended the plan early';if(plan.completion_reason==='elapsed')return'Ended at the scheduled time';if(plan.completion_reason==='date_completed')return'Date completed';if(plan.completion_reason==='trip_completed')return'Trip completed';return plan.completed_at?'Saved to your shared history':'Shared';}
function parse(value?:string|null){if(!value)return null;const date=new Date(value);return Number.isFinite(date.getTime())?date:null;}
function formatAt(value?:string|null,timezone?:string|null){if(!value)return'';try{return new Intl.DateTimeFormat(undefined,{timeZone:timezone||'UTC',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));}catch{return new Date(value).toLocaleString();}}
function sameDay(a:Date,b:Date,zone:string){try{const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});return formatter.format(a)===formatter.format(b);}catch{return a.toISOString().slice(0,10)===b.toISOString().slice(0,10);}}
function deviceTimezone(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}catch{return'UTC';}}
