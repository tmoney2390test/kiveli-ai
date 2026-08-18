import type { CharacterInstance, InteractionMode, SceneEntryReason, SharedPlan, Snapshot } from '../types';
import { worldForLocation } from './place';

type Commitment={id:string;title:string;startsAt:string;endsAt?:string;kind:'plan'|'date';location?:string};
export type ClientConversationContext={
  interactionMode:InteractionMode;
  entryReason:SceneEntryReason;
  sceneBehavior:{acknowledgeArrival:boolean;activityAwareness:boolean;departurePressure:boolean};
  scene:{locationId?:string;location:string;activity:string;summary:string;source:'active_date'|'active_plan'|'scene'|'life_engine'|'character_state';activeEventId?:string;mediaUrl?:string;localTime:string;worldName?:string};
  nextCommitment?:Commitment;
  activePlan?:Commitment;
  activeDate?:Commitment;
  startingSoon?:Commitment&{hoursUntil:number};
  recentPlan?:Commitment&{completedAt:string};
  story?:{title:string;chapter:string};
  thread?:{label:string;prompt:string};
  prompts:string[];
};

export function buildClientConversationContext(snapshot:Snapshot,character:CharacterInstance,now=new Date()):ClientConversationContext{
  const location=snapshot.locations.find((item)=>item.id===character.current_location_id)?.name??worldForLocation(snapshot,character.current_location_id)?.name??'Current place';
  const characterPlans=(snapshot.sharedPlans??[]).filter((plan)=>plan.character_instance_id===character.id);
  const activePlanRow=characterPlans.find((plan)=>isActivePlan(plan,now));
  const planUserPresent=Boolean(activePlanRow?.attendance?.user&&!activePlanRow.attendance.user.left_at);
  const activeDateRow=snapshot.dates.find((date)=>date.character_instance_id===character.id&&date.status==='active');
  const activeSceneRow=(snapshot.sceneSessions??[]).find((scene)=>scene.character_instance_id===character.id&&!scene.ended_at&&sceneIsCurrent(scene,now));
  const conversation=snapshot.conversations.find((item)=>item.character_instance_id===character.id&&!item.archived_at);
  const storedScene=readSceneMetadata(conversation?.metadata?.activeScene);
  const storedValid=Boolean(storedScene?.interactionMode==='co_present'&&(!storedScene.validUntil||new Date(storedScene.validUntil)>now));
  const activeSceneActivity=activeSceneRow?sceneActivity(activeSceneRow):storedValid?storedScene?.activityLabel??humanizeActivity(storedScene?.activityKey):undefined;
  const activeEvent=snapshot.lifeEvents.filter((event)=>event.character_instance_id===character.id&&event.metadata?.planStatus!=='cancelled'&&Boolean(event.ends_at)&&new Date(event.starts_at).getTime()<=now.getTime()&&new Date(event.ends_at!).getTime()>=now.getTime()).sort((a,b)=>Number(b.significance??0)-Number(a.significance??0))[0];
  const activeLocationId=activeSceneRow?.location_id??(storedValid?storedScene?.locationId:undefined)??activeDateRow?.together_date_templates.location_id??(planUserPresent?activePlanRow?.location_id:undefined)??character.current_location_id;
  const sceneLocation=snapshot.locations.find((item)=>item.id===activeLocationId)?.name??location;
  const sceneWorld=worldForLocation(snapshot,activeLocationId);
  const localTime=formatWorldTime(now,sceneWorld?.timezone);
  const media=(snapshot.generatedMedia??[]).filter((item)=>item.character_instance_id===character.id&&item.status==='ready'&&item.signed_url&&(item.location_id===activeLocationId||item.location_id===character.current_location_id)).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0];
  const plans=characterPlans.filter((plan)=>plan.status==='scheduled'&&new Date(plan.starts_at)>now).map((plan)=>planCommitment(plan,snapshot));
  const dates=snapshot.dates.filter((date)=>date.character_instance_id===character.id&&date.status==='upcoming'&&date.scheduled_for&&new Date(date.scheduled_for)>now).map((date)=>({id:date.id,title:date.together_date_templates.name,startsAt:date.scheduled_for!,kind:'date' as const,location:snapshot.locations.find((item)=>item.id===date.together_date_templates.location_id)?.name}));
  const nextCommitment=[...plans,...dates].sort((a,b)=>new Date(a.startsAt).getTime()-new Date(b.startsAt).getTime())[0];
  const hoursUntil=nextCommitment?(new Date(nextCommitment.startsAt).getTime()-now.getTime())/3600000:Infinity;
  const startingSoon=nextCommitment&&hoursUntil>=0&&hoursUntil<=12?{...nextCommitment,hoursUntil}:undefined;
  const activePlan=activePlanRow?planCommitment(activePlanRow,snapshot):undefined;
  const activeDate=activeDateRow?{id:activeDateRow.id,title:activeDateRow.together_date_templates.name,startsAt:activeDateRow.scheduled_for??activeDateRow.completed_at??now.toISOString(),endsAt:activeDateRow.completed_at??undefined,kind:'date' as const,location:snapshot.locations.find((item)=>item.id===activeDateRow.together_date_templates.location_id)?.name}:undefined;
  const recentRow=characterPlans.filter((plan)=>plan.status==='completed'&&new Date(plan.ends_at).getTime()<=now.getTime()&&new Date(plan.ends_at).getTime()>now.getTime()-7*86400000).sort((a,b)=>new Date(b.ends_at).getTime()-new Date(a.ends_at).getTime())[0];
  const recentPlan=recentRow?{...planCommitment(recentRow,snapshot),completedAt:recentRow.completed_at??recentRow.ends_at}:undefined;
  const activeStory=(snapshot.storyArcs??[]).find((item)=>item.character_instance_id===character.id&&item.status==='active');
  const chapter=activeStory?.together_story_arc_templates?.chapters.find((item)=>item.id===activeStory.current_chapter_id);
  const openThread=snapshot.openThreads.find((item)=>item.character_instance_id===character.id&&item.follow_up_eligible);
  const subject=openThread?.display_subject??openThread?.subject??String(openThread?.topic??'').match(/user's\s+([a-z ]+)/i)?.[1]?.replace(/\s+went.*$/i,'')??'something important';
  const thread=openThread?{label:subject,prompt:openThread.followup_prompt??`I should tell you how my ${subject.toLowerCase()} went.`}:undefined;
  const activeCommitment=activeDate??(planUserPresent?activePlan:undefined);
  const interactionMode:InteractionMode=activeSceneRow||storedValid||activeDate||planUserPresent?'co_present':'remote';
  const entryReason:SceneEntryReason=activeSceneRow?(storedScene?.entryReason??sceneEntryReason(activeSceneRow.source)):storedValid?(storedScene?.entryReason??'continued_scene'):activeDate?'active_date':planUserPresent?'shared_plan':'direct_chat';
  const acknowledgeArrival=interactionMode==='co_present'&&entryReason==='user_drop_in'&&!storedScene?.arrivalAcknowledgedAt;
  const departureAt=activeSceneRow?.expected_end_at??storedScene?.validUntil??activeCommitment?.endsAt;
  const departurePressure=Boolean(departureAt&&new Date(departureAt).getTime()-now.getTime()<20*60000);
  const sceneActivityLabel=activeSceneActivity??activeDate?.title??(planUserPresent?activePlan?.title:undefined)??character.current_activity;
  const eventEstablishesPresence=Boolean(activeEvent?.location_id&&activeEvent.location_id===character.current_location_id&&['life_event','active_event'].includes(String(character.current_presence_source)));
  const sceneSource:ClientConversationContext['scene']['source']=activeSceneRow||storedValid?'scene':activeDate?'active_date':planUserPresent?'active_plan':character.current_presence_source==='life_event'||character.current_presence_source==='active_event'?'life_engine':'character_state';
  const prompts=smartReplies({character,location:sceneLocation,activity:sceneActivityLabel,thread,nextCommitment,activePlan:activeCommitment,startingSoon,recentPlan,storyTitle:activeStory?.together_story_arc_templates?.title,now,interactionMode});
  return{interactionMode,entryReason,sceneBehavior:{acknowledgeArrival,activityAwareness:interactionMode==='co_present'||eventEstablishesPresence,departurePressure},scene:{locationId:activeLocationId??undefined,location:sceneLocation,activity:sceneActivityLabel,summary:interactionMode==='co_present'?`You are together at ${sceneLocation} while ${character.together_character_templates.name} is ${sceneActivityLabel.toLowerCase()}.`:eventEstablishesPresence?activeEvent!.narrative_summary:`${character.together_character_templates.name} is ${sceneActivityLabel.toLowerCase()}.`,source:sceneSource,activeEventId:eventEstablishesPresence?activeEvent?.id:undefined,mediaUrl:media?.signed_url??undefined,localTime,worldName:sceneWorld?.name},nextCommitment,activePlan,activeDate,startingSoon,recentPlan,story:activeStory?{title:activeStory.together_story_arc_templates?.title??'A story in progress',chapter:chapter?.title??activeStory.current_chapter_id}:undefined,thread,prompts};
}

function formatWorldTime(now:Date,timezone?:string){try{return new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit',timeZone:timezone||'UTC'}).format(now);}catch{return now.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}}
function readSceneMetadata(value:unknown):{interactionMode?:InteractionMode;entryReason?:SceneEntryReason;arrivalAcknowledgedAt?:string;validUntil?:string;locationId?:string;activityKey?:string;activityLabel?:string}|null{if(!value||typeof value!=='object')return null;const row=value as Record<string,unknown>;return{interactionMode:row.interactionMode==='co_present'?'co_present':'remote',entryReason:typeof row.entryReason==='string'?row.entryReason as SceneEntryReason:undefined,arrivalAcknowledgedAt:typeof row.arrivalAcknowledgedAt==='string'?row.arrivalAcknowledgedAt:undefined,validUntil:typeof row.validUntil==='string'?row.validUntil:undefined,locationId:typeof row.locationId==='string'?row.locationId:undefined,activityKey:typeof row.activityKey==='string'?row.activityKey:undefined,activityLabel:typeof row.activityLabel==='string'?row.activityLabel:undefined};}
function smartReplies(input:{character:CharacterInstance;location:string;activity:string;thread?:{prompt:string};nextCommitment?:Commitment;activePlan?:Commitment;startingSoon?:Commitment&{hoursUntil:number};recentPlan?:Commitment;storyTitle?:string;now:Date;interactionMode:InteractionMode}):string[]{
  if(input.interactionMode==='co_present')return['What are you doing here?',`How is ${input.activity.toLowerCase()} going?`,'Mind if I hang out for a bit?'];
  if(input.activePlan)return[`This is actually a good call.`,`What should we do next here?`,`Remember this part.`];
  if(input.startingSoon)return[input.startingSoon.hoursUntil<=4?`Still good for ${new Date(input.startingSoon.startsAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}?`:`I'm looking forward to ${input.startingSoon.title}.`,`What should we get there?`,`How is your day looking before we go?`];
  if(input.nextCommitment){const hours=(new Date(input.nextCommitment.startsAt).getTime()-input.now.getTime())/3600000;return hours<=48?[`Still good for ${hours<=24?'tomorrow':input.nextCommitment.title}?`,'Should we figure out the details?',`What time are you free beforehand?`]:[`I'm looking forward to ${input.nextCommitment.title}.`,`What should we know before we go?`,`Should we add anything to the plan?`];}
  if(input.recentPlan)return[`${input.recentPlan.location??input.recentPlan.title} was a good call.`,`We should do that again.`,`What was your favorite part?`];
  if(input.thread)return[input.thread.prompt,`What have you been up to at ${input.location}?`,'Tell me the part you have not told me yet'];
  if(input.storyTitle)return[`What is happening with ${input.storyTitle}?`,'How are you feeling about it?',`What is the scene at ${input.location}?`];
  const activity=input.activity.toLowerCase();
  if(/coffee|cafe/.test(activity))return['How is coffee going?','Who are you with?','Tell me what happened today'];
  if(/photo|shoot|studio/.test(activity))return['How did the shoot go?','What are you working on?','Show me what caught your eye'];
  if(input.character.current_mood.toLowerCase()==='playful')return['What trouble are you causing?','Tease me about something',`How is ${input.location}?`];
  return['What are you doing right now?',`What is happening at ${input.location}?`,'Tell me something real'];
}

function planCommitment(plan:SharedPlan,snapshot:Snapshot):Commitment{return{id:plan.id,title:plan.title,startsAt:plan.starts_at,endsAt:plan.ends_at,kind:'plan',location:snapshot.locations.find((item)=>item.id===plan.location_id)?.name};}
function isActivePlan(plan:SharedPlan,now:Date){if(!['active','scheduled'].includes(plan.status))return false;const starts=new Date(plan.starts_at).getTime(),ends=new Date(plan.ends_at).getTime();return Number.isFinite(starts)&&Number.isFinite(ends)&&starts-30*60_000<=now.getTime()&&now.getTime()<ends;}
function sceneIsCurrent(scene:{started_at:string;expected_end_at?:string|null},now:Date){const start=new Date(scene.started_at).getTime();const end=scene.expected_end_at?new Date(scene.expected_end_at).getTime():start+3*60*60_000;return Number.isFinite(start)&&Number.isFinite(end)&&start<=now.getTime()&&now.getTime()<end;}
function sceneActivity(scene:{activity_key?:string|null;state:Record<string,unknown>}){const explicit=typeof scene.state.activityLabel==='string'?scene.state.activityLabel.trim():'';if(explicit)return explicit;const key=String(scene.state.currentActivityKey??scene.activity_key??'together').replace(/[_-]+/g,' ').trim();return key&&key!=='together'?key.replace(/^./,(character)=>character.toUpperCase()):'Spending time together';}
function sceneEntryReason(source:string):SceneEntryReason{return source==='date'?'active_date':source==='shared_plan'?'shared_plan':source==='drop_in'?'user_drop_in':'continued_scene';}
function humanizeActivity(value:unknown){if(typeof value!=='string')return undefined;const key=value.replace(/[_-]+/g,' ').trim();return key&&key!=='together'?key.replace(/^./,(character)=>character.toUpperCase()):'Spending time together';}
