import type { CharacterInstance, Snapshot } from '../types';

export type ClientConversationContext={
  scene:{location:string;activity:string;summary:string;source:'active_event'|'character_state';activeEventId?:string;mediaUrl?:string};
  nextCommitment?:{id:string;title:string;startsAt:string;kind:'plan'|'date';location?:string};
  story?:{title:string;chapter:string};
  thread?:{label:string;prompt:string};
  prompts:string[];
};

export function buildClientConversationContext(snapshot:Snapshot,character:CharacterInstance,now=new Date()):ClientConversationContext{
  const location=snapshot.locations.find((item)=>item.id===character.current_location_id)?.name??'Juniper City';
  const activeEvent=snapshot.lifeEvents.filter((event)=>event.character_instance_id===character.id&&event.metadata?.planStatus!=='cancelled'&&new Date(event.starts_at).getTime()<=now.getTime()&&(!event.ends_at||new Date(event.ends_at).getTime()>=now.getTime())).sort((a,b)=>Number(b.significance??0)-Number(a.significance??0))[0];
  const sceneLocation=snapshot.locations.find((item)=>item.id===(activeEvent?.location_id??character.current_location_id))?.name??location;
  const media=(snapshot.generatedMedia??[]).filter((item)=>item.character_instance_id===character.id&&item.status==='ready'&&item.signed_url&&(item.location_id===activeEvent?.location_id||item.location_id===character.current_location_id)).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0];
  const plans=(snapshot.sharedPlans??[]).filter((plan)=>plan.character_instance_id===character.id&&plan.status==='scheduled'&&new Date(plan.starts_at)>now).map((plan)=>({id:plan.id,title:plan.title,startsAt:plan.starts_at,kind:'plan' as const,location:snapshot.locations.find((item)=>item.id===plan.location_id)?.name}));
  const dates=snapshot.dates.filter((date)=>date.character_instance_id===character.id&&date.status==='upcoming'&&date.scheduled_for&&new Date(date.scheduled_for)>now).map((date)=>({id:date.id,title:date.together_date_templates.name,startsAt:date.scheduled_for!,kind:'date' as const,location:snapshot.locations.find((item)=>item.id===date.together_date_templates.location_id)?.name}));
  const nextCommitment=[...plans,...dates].sort((a,b)=>new Date(a.startsAt).getTime()-new Date(b.startsAt).getTime())[0];
  const activeStory=(snapshot.storyArcs??[]).find((item)=>item.character_instance_id===character.id&&item.status==='active');
  const chapter=activeStory?.together_story_arc_templates?.chapters.find((item)=>item.id===activeStory.current_chapter_id);
  const openThread=snapshot.openThreads.find((item)=>item.character_instance_id===character.id&&item.follow_up_eligible);
  const subject=openThread?.display_subject??openThread?.subject??String(openThread?.topic??'').match(/user's\s+([a-z ]+)/i)?.[1]?.replace(/\s+went.*$/i,'')??'something important';
  const thread=openThread?{label:subject,prompt:openThread.followup_prompt??`I should tell you how my ${subject.toLowerCase()} went.`}:undefined;
  const prompts=smartReplies({character,location:sceneLocation,thread,nextCommitment,storyTitle:activeStory?.together_story_arc_templates?.title});
  return{scene:{location:sceneLocation,activity:activeEvent?.title??character.current_activity,summary:activeEvent?.narrative_summary??`${character.together_character_templates.name} is ${character.current_activity}.`,source:activeEvent?'active_event':'character_state',activeEventId:activeEvent?.id,mediaUrl:media?.signed_url??undefined},nextCommitment,story:activeStory?{title:activeStory.together_story_arc_templates?.title??'A story in progress',chapter:chapter?.title??activeStory.current_chapter_id}:undefined,thread,prompts};
}

function smartReplies(input:{character:CharacterInstance;location:string;thread?:{prompt:string};nextCommitment?:{title:string;startsAt:string};storyTitle?:string}):string[]{
  if(input.thread)return[input.thread.prompt,`What have you been up to at ${input.location}?`,'Tell me the part you have not told me yet'];
  if(input.nextCommitment){const hours=(new Date(input.nextCommitment.startsAt).getTime()-Date.now())/3600000;return hours<=48?[`Still good for ${hours<=24?'tomorrow':input.nextCommitment.title}?`,'Should we figure out the details?',`What time are you free beforehand?`]:[`I'm looking forward to ${input.nextCommitment.title}.`,`What should we know before we go?`,`Should we add anything to the plan?`];}
  if(input.storyTitle)return[`What is happening with ${input.storyTitle}?`,'How are you feeling about it?',`What is the scene at ${input.location}?`];
  const activity=input.character.current_activity.toLowerCase();
  if(/coffee|cafe/.test(activity))return['How is coffee going?','Who are you with?','Tell me what happened today'];
  if(/photo|shoot|studio/.test(activity))return['How did the shoot go?','What are you working on?','Show me what caught your eye'];
  if(input.character.current_mood.toLowerCase()==='playful')return['What trouble are you causing?','Tease me about something',`How is ${input.location}?`];
  return['What are you doing right now?',`What is happening at ${input.location}?`,'Tell me something real'];
}
