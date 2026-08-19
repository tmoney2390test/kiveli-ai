import { scoreEpisodeSignificance } from '../../../packages/together-domain/src/index.ts';
import { track } from './together.ts';
import { observationsFromScene, supportBehaviorPatterns } from './kivelle-user-patterns.ts';
import { recordSharedPlaceVisit } from './kivelle-place-perspective.ts';

type Row=Record<string,any>;

/** Consolidates an action ledger into one shared experience. It is intentionally
 * deterministic by default: scene actions are canonical, dialogue is not. */
export async function finalizeSceneSession(input:{db:any;userId:string;sceneSessionId:string;now?:Date}):Promise<Row|null>{
  const now=input.now??new Date();
  const {data:existing}=await input.db.from('together_scene_episodes').select('*').eq('scene_session_id',input.sceneSessionId).maybeSingle();
  if(existing)return existing as Row;
  const {data:scene,error}=await input.db.from('together_scene_sessions').select('*').eq('id',input.sceneSessionId).eq('user_id',input.userId).not('ended_at','is',null).maybeSingle();
  if(error||!scene)return null;
  const [{data:actions},{data:location},{data:relationship},{data:media},{data:plan},{data:participantRows}]=await Promise.all([
    input.db.from('together_scene_actions').select('*').eq('scene_session_id',scene.id).eq('user_id',input.userId).not('completed_at','is',null).order('created_at'),
    input.db.from('together_locations').select('name,category,possible_activities').eq('id',scene.location_id).maybeSingle(),
    input.db.from('together_relationship_states').select('trust,comfort,affinity,familiarity').eq('character_instance_id',scene.character_instance_id).eq('user_id',input.userId).maybeSingle(),
    input.db.from('together_generated_media').select('id').eq('user_id',input.userId).eq('character_instance_id',scene.character_instance_id).eq('scene_session_id',scene.id).eq('status','ready').limit(8),
    scene.shared_plan_id ? input.db.from('together_shared_plans').select('id,location_id,activity_key,title').eq('id',scene.shared_plan_id).maybeSingle() : Promise.resolve({data:null}),
    input.db.from('together_scene_participants').select('character_instance_id,joined_at,left_at,witnessed_from_sequence,witnessed_to_sequence').eq('scene_session_id',scene.id).eq('user_id',input.userId),
  ]);
  const completed=((actions??[]) as Row[]).filter((action)=>!action.decision_status||['accepted','completed'].includes(String(action.decision_status))).filter((action)=>action.result?.proposalAccepted!==true);
  const meaningful=completed.filter((action)=>!['leave','move'].includes(String(action.family)));
  const families=new Set(meaningful.map((action)=>String(action.family)));
  const labels=meaningful.map(actionLabel).filter(Boolean);
  const duration=Math.max(0,(new Date(String(scene.ended_at)).getTime()-new Date(String(scene.started_at)).getTime())/60000);
  const relationshipSignificance=Math.min(1,(Number(relationship?.trust??0)+Number(relationship?.comfort??0)+Number(relationship?.affinity??0)+Number(relationship?.familiarity??0))/360);
  const explicitPhoto=completed.some((action)=>String(action.interaction_key).includes('photo'))||Boolean(media?.length);
  const significance=scoreEpisodeSignificance({durationMinutes:duration,meaningfulActionCount:meaningful.length,actionFamilyCount:families.size,relationshipSignificance,explicitPhoto,routinePenalty:meaningful.length?0:.85});
  const startingLocationId=String(plan?.location_id??completed.find((action)=>String(action.family)==='move'&&action.payload?.fromLocationId)?.payload?.fromLocationId??scene.location_id);
  const {data:startingLocation}=startingLocationId===String(scene.location_id)?{data:location}:await input.db.from('together_locations').select('name,category,possible_activities').eq('id',startingLocationId).maybeSingle();
  const locationName=String(location?.name??'that place');
  const title=episodeTitle(labels,locationName);
  const summary=episodeSummary(labels,locationName,String(startingLocation?.name??locationName),completed);
  const payload={user_id:input.userId,continuity_id:scene.continuity_id,scene_session_id:scene.id,shared_plan_id:scene.shared_plan_id??null,character_instance_id:scene.character_instance_id,world_id:scene.world_id,location_id:scene.location_id,starting_location_id:startingLocationId,ending_location_id:scene.location_id,activity_key:plan?.activity_key??scene.activity_key,attended_seconds:Math.round(Math.max(0,(new Date(String(scene.ended_at)).getTime()-new Date(String(scene.started_at)).getTime())/1000)),meaningful_action_count:meaningful.length,media_count:(media??[]).length,participant_instance_ids:[scene.character_instance_id,...(Array.isArray(scene.participant_instance_ids)?scene.participant_instance_ids:[])].filter((id,index,all)=>Boolean(id)&&all.indexOf(id)===index),title,summary,emotional_tone:scene.state?.emotionalTone??null,significance,started_at:scene.started_at,ended_at:scene.ended_at,action_ids:completed.map((action)=>action.id),context_tags:episodeTags(scene,location,completed),metadata:{version:2,actionCount:completed.length,meaningfulActionCount:meaningful.length,mediaIds:(media??[]).map((item:Row)=>item.id),startingLocationId,endingLocationId:scene.location_id}};
  const {data:episode,error:episodeError}=await input.db.from('together_scene_episodes').insert(payload).select('*').single();
  if(episodeError){const {data:retry}=await input.db.from('together_scene_episodes').select('*').eq('scene_session_id',scene.id).maybeSingle();return retry??null;}
  const memoryIds:string[]=[];
  if(significance>=.55){
    const windows=new Map<string,{joinedAt:string;leftAt:string|null}>((participantRows??[]).map((participant:Row)=>[String(participant.character_instance_id),{joinedAt:String(participant.joined_at??scene.started_at),leftAt:participant.left_at?String(participant.left_at):null}]));
    const memoryRows=payload.participant_instance_ids.map((characterInstanceId:string)=>{
      const window=windows.get(characterInstanceId)??{joinedAt:String(scene.started_at),leftAt:String(scene.ended_at)};
      const witnessed=completed.filter((action)=>{const at=new Date(String(action.created_at??action.started_at)).getTime();return at>=new Date(window.joinedAt).getTime()&&(!window.leftAt||at<=new Date(window.leftAt).getTime());});
      const witnessedLabels=witnessed.filter((action)=>!['leave','move'].includes(String(action.family))).map(actionLabel).filter(Boolean);
      const witnessedSummary=characterInstanceId===String(scene.character_instance_id)?summary:episodeSummary(witnessedLabels,locationName,String(startingLocation?.name??locationName),witnessed);
      return{user_id:input.userId,continuity_id:scene.continuity_id,character_instance_id:characterInstanceId,memory_type:'episodic',canonical_text:witnessedSummary,dedupe_key:`scene-episode:${episode.id}`,subject_key:`episode:${episode.id}`,importance:significance,confidence:.96,status:'active',source_type:'scene',source_id:scene.id,episode_id:episode.id,world_id:scene.world_id,location_id:scene.location_id,participant_instance_ids:payload.participant_instance_ids,context_tags:payload.context_tags,learned_via:'observed_scene',shareability:payload.participant_instance_ids.length>1?'social':'normal',valid_from:scene.ended_at,metadata:{sceneSessionId:scene.id,actionIds:witnessed.map((action)=>action.id),witnessedFrom:window.joinedAt,witnessedTo:window.leftAt??scene.ended_at}};
    });
    const {data:memories}=await input.db.from('together_memories').insert(memoryRows).select('id');
    memoryIds.push(...(memories??[]).map((memory:Row)=>String(memory.id)));
    if(memoryIds.length)await track(input.db,input.userId,'episode_promoted_to_memory',{sceneSessionId:scene.id,episodeId:episode.id,witnessCount:memoryIds.length});
  }
  let momentId:string|null=null;
  if(significance>=.75){
    const {data:priorMoment}=await input.db.from('together_moments').select('id').eq('scene_session_id',scene.id).maybeSingle();
    momentId=priorMoment?.id??(await input.db.from('together_moments').insert({user_id:input.userId,continuity_id:scene.continuity_id,character_instance_id:scene.character_instance_id,title,occurred_at:scene.ended_at,location_id:scene.location_id,summary,participant_instance_ids:payload.participant_instance_ids,linked_memory_ids:memoryIds,relationship_impact:{affinity:1,familiarity:1},media:[],moment_type:'scene_episode',scene_session_id:scene.id,episode_id:episode.id}).select('id').maybeSingle()).data?.id??null;
    if(momentId){await input.db.from('together_scene_episodes').update({moment_id:momentId}).eq('id',episode.id);await track(input.db,input.userId,'episode_promoted_to_moment',{sceneSessionId:scene.id,episodeId:episode.id,momentId});}
  }
  await Promise.all(payload.participant_instance_ids.map((characterInstanceId:string)=>recordSharedPlaceVisit({db:input.db,userId:input.userId,characterInstanceId,locationId:String(scene.location_id),sourceType:'scene',sourceId:String(episode.id),occurredAt:String(scene.ended_at),meaningSummary:summary,momentId})));
  await track(input.db,input.userId,'episode_created',{sceneSessionId:scene.id,episodeId:episode.id,significance});
  const observations=observationsFromScene({scene,actions:completed});
  if(observations.length){
    await Promise.all(payload.participant_instance_ids.map((characterInstanceId:string)=>supportBehaviorPatterns({db:input.db,userId:input.userId,continuityId:String(scene.continuity_id),characterInstanceId,observations,now})));
    await track(input.db,input.userId,'behavior_pattern_supported',{characterInstanceId:scene.character_instance_id,sceneSessionId:scene.id,count:observations.length,witnessCount:payload.participant_instance_ids.length});
  }
  return episode;
}

function actionLabel(action:Row){return String(action.payload?.candidate?.label??action.result?.label??action.interaction_key??'').replace(/^[a-z_]+\./,'').replace(/_/g,' ').trim();}
function episodeTitle(labels:string[],location:string){return labels[0]?`${titleCase(labels[0])} at ${location}`:`Time together at ${location}`;}
function episodeSummary(labels:string[],location:string,startingLocation:string,actions:Row[]){if(!labels.length)return startingLocation===location?`You spent a little time together at ${location}.`:`You met at ${startingLocation} and ended at ${location}.`;const unique=[...new Set(labels.map(titleCase))].slice(0,4);const lower=(value:string)=>value.charAt(0).toLowerCase()+value.slice(1);const movement=startingLocation!==location?` You ended the experience at ${location}.`:'';if(unique.length===1){const only=unique[0]??'spent time';return`You met at ${startingLocation} and ${lower(only)}.${movement}`;}const final=unique.pop()??'spent time together';return`You met at ${startingLocation}, ${unique.map(lower).join(', ')}, and ${lower(final)}.${movement}`;}
function episodeTags(scene:Row,location:Row|null,actions:Row[]){return[scene.activity_key,location?.category,...actions.map((action)=>String(action.family)),...actions.map((action)=>String(action.interaction_key).split('.')[0])].filter((item):item is string=>typeof item==='string'&&Boolean(item));}
function titleCase(value:string){return value.replace(/\b\w/g,(letter)=>letter.toUpperCase());}
