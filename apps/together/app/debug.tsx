import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { ArrowLeft, RefreshCw } from 'lucide-react-native';
import { GradientButton, PageTitle, Screen, SectionHeader } from '../src/components';
import { colors, radius } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { invoke, manageInteraction, manageMedia } from '../src/lib/api';
import { selectActiveCompanion, selectCompanionLife } from '../src/lib/selectors';
import { buildClientPlaceContext } from '../src/lib/place';
import { selectCharacterPlacePerspective } from '../src/lib/placePerspective';
import type { InteractionCandidate } from '../src/types';

export default function Debug(){
  const{snapshot,refresh}=useTogether();
  const[interactionCandidates,setInteractionCandidates]=useState<InteractionCandidate[]>([]);
  const[memoryInspector,setMemoryInspector]=useState<{memoryContext?:{callbackAllowance?:number;debug?:Array<{id:string;activation:number;mode:string;reasonCodes:string[]}>};emotionalResidue?:{tone?:string;intensity?:number}|null;userPatterns?:Array<{summary?:string;confidence?:number}>;recentEpisodes?:Array<{title?:string;significance?:number}>}|null>(null);
  const companion=snapshot?selectActiveCompanion(snapshot):undefined;
  const life=snapshot&&companion?selectCompanionLife(snapshot,companion.id):undefined;
  const relation=life?.relationship;
  const place=snapshot&&companion?.current_location_id?buildClientPlaceContext(snapshot,companion.current_location_id):null;
  const currentLocation=snapshot?.locations.find((item)=>item.id===companion?.current_location_id);
  const placePerspective=snapshot&&companion&&currentLocation?selectCharacterPlacePerspective(snapshot,companion,currentLocation):null;
  const media=life?.media.slice(0,12)??[];
  const nextPlan=life?.plans.find((item)=>['scheduled','active'].includes(item.status));
  const activePlan=snapshot?.sharedPlans?.find((item)=>item.character_instance_id===companion?.id&&['scheduled','active'].includes(item.status));
  const nextDate=life?.dates.find((item)=>['upcoming','active','unlocked'].includes(item.status));
  const activeStory=life?.stories.find((item)=>item.status==='active');
  const schedule=(snapshot?.scheduleEvents??[]).filter((item)=>item.character_instance_id===companion?.id).sort((a,b)=>new Date(a.starts_at).getTime()-new Date(b.starts_at).getTime());
  const scene=snapshot?.sceneSessions?.find((item)=>item.character_instance_id===companion?.id);
  const conversation=snapshot?.conversations.find((item)=>item.character_instance_id===companion?.id&&!item.archived_at);
  const advance=async(hours:number)=>{if(!companion)return;const now=new Date(Date.now()+hours*3600000).toISOString();try{await invoke('together-simulate',{characterInstanceId:companion.id,now,evaluateProactive:true});await refresh();}catch(error){Alert.alert('Simulation failed',error instanceof Error?error.message:'Unknown error');}};
  const simulateContent=async(days:number)=>{if(!companion)return;try{await invoke('together-debug',{action:'simulate_content',characterInstanceId:companion.id,days});await refresh();}catch(error){Alert.alert('Content simulation failed',error instanceof Error?error.message:'Unknown error');}};
  const retry=async(id:string)=>{await manageMedia({action:'retry',mediaId:id});await refresh();};
  const inspectInteractions=async()=>{if(!companion||!conversation)return;try{const result=await manageInteraction<{interactions:InteractionCandidate[]}>({action:'resolve',characterInstanceId:companion.id,conversationId:conversation.id});setInteractionCandidates(result.interactions??[]);}catch(error){Alert.alert('Interaction inspector',error instanceof Error?error.message:'Enter a shared scene to inspect its current actions.');}};
  const inspectMemory=async()=>{if(!companion)return;try{const result=await invoke<{memoryContext:{callbackAllowance:number;debug:Array<{id:string;activation:number;mode:string;reasonCodes:string[]}>};emotionalResidue?:{tone?:string;intensity?:number}|null;userPatterns?:Array<{summary?:string;confidence?:number}>;recentEpisodes?:Array<{title?:string;significance?:number}>}>('together-debug',{action:'inspect_context',characterInstanceId:companion.id,message:'Want to go somewhere quieter?'});setMemoryInspector(result);}catch(error){Alert.alert('Memory inspector',error instanceof Error?error.message:'Could not inspect current memory activation.');}};
  return <Screen>
    <View style={styles.header}><Pressable onPress={()=>router.back()}><ArrowLeft color={colors.text}/></Pressable><PageTitle>Internal Tools</PageTitle></View>
    <Text style={styles.warning}>DEVELOPMENT / INTERNAL BUILDS ONLY</Text>
    <SectionHeader title="Identity boundary"/>
    <Data label="Active Persona" value={snapshot?.activePersona?.display_name}/>
    <Data label="Active continuity" value={snapshot?.activeContinuity?.title}/>
    <Data label="Continuity kind" value={snapshot?.activeContinuity?.kind}/>
    <Data label="Continuity ID" value={snapshot?.activeContinuity?.id}/>
    <SectionHeader title={`${companion?.together_character_templates.name??'Active companion'} state`}/>
    <Data label="Active companion" value={companion?.together_character_templates.name}/>
    <Data label="Character Template" value={companion?.character_template_id}/>
    <Data label="Character Version" value={companion?.character_version_id}/>
    <Data label="Creator" value={companion?.together_character_templates.creator_id?'User-created':'Official'}/>
    <Data label="Memory / plan / Moment counts" value={life?`${life.memories.length} / ${life.plans.length} / ${life.moments.length}`:undefined}/>
    <Data label="Actual world" value={place?.world.name}/>
    <Data label="Current location" value={place?.location.name}/>
    <Data label="Place path" value={place?.path}/>
    <Data label="Place perspective" value={placePerspective?.summary??undefined}/>
    <Data label="Shared visits / sentiment" value={placePerspective?`${placePerspective.visitCount} / ${placePerspective.sentiment.toFixed(2)} (${placePerspective.source})`:undefined}/>
    <Data label="Timezone" value={place?.clock.timezone}/>
    <Data label="Activity" value={companion?.current_activity}/>
    <Data label="Mood / energy" value={companion?`${companion.current_mood} / ${companion.current_energy}`:undefined}/>
    <Data label="Interruptibility" value={companion?.current_interruptibility}/>
    <Data label="Schedule event" value={companion?.current_schedule_event_id??undefined}/>
    <Data label="Presence source" value={companion?.current_presence_source}/>
    <Data label="Life engine" value={companion?.life_engine_version}/>
    <SectionHeader title="Plan experience"/>
    <Data label="Plan" value={activePlan?.id}/>
    <Data label="Plan status / timing" value={activePlan?`${activePlan.status} · ${activePlan.starts_at} → ${activePlan.ends_at}`:undefined}/>
    <Data label="Plan attendance" value={activePlan?`${activePlan.attendance?.user&&!activePlan.attendance.user.left_at?'user present':'user absent'} · ${activePlan.attendance?.character&&!activePlan.attendance.character.left_at?'companion present':'companion absent'}`:undefined}/>
    <Data label="Participation" value={activePlan?.participation_level??undefined}/>
    <SectionHeader title="Interaction inspector"/>
    <Data label="Active scene" value={scene?`${scene.source} · ${scene.activity_key??'together'}`:'No active shared scene'}/>
    <Data label="Scene / plan binding" value={scene?.shared_plan_id??undefined}/>
    <Data label="Scene location / activity state" value={scene?`${scene.location_id} · ${JSON.stringify(scene.state?.activity??{})}`:undefined}/>
    <Data label="Recent actions" value={scene?.state?.recentActionKeys&&Array.isArray(scene.state.recentActionKeys)?scene.state.recentActionKeys.join(', '):undefined}/>
    <View style={styles.buttons}><GradientButton label="Inspect current actions" onPress={()=>void inspectInteractions()}/></View>
    {interactionCandidates.map((candidate)=><View key={candidate.id} style={styles.media}><View style={{flex:1}}><Text style={styles.mediaTitle}>{candidate.interactionKey} · {candidate.score.toFixed(2)}</Text><Text style={styles.mediaMeta}>{candidate.label} · {candidate.family}</Text><Text style={styles.mediaMeta}>{candidate.reasonCodes.join(', ')}</Text></View></View>)}
    <SectionHeader title="Memory activation inspector"/>
    <Text style={styles.mediaMeta}>Runs a safe contextual query: “Want to go somewhere quieter?”</Text>
    <View style={styles.buttons}><GradientButton label="Inspect memory activation" onPress={()=>void inspectMemory()}/></View>
    {memoryInspector?<><Data label="Callback allowance" value={String(memoryInspector.memoryContext?.callbackAllowance??0)}/><Data label="Emotional residue" value={memoryInspector.emotionalResidue?`${memoryInspector.emotionalResidue.tone??'unknown'} · ${Math.round(Number(memoryInspector.emotionalResidue.intensity??0)*100)}%`:'None'}/>{memoryInspector.memoryContext?.debug?.map((item)=><View key={item.id} style={styles.media}><View style={{flex:1}}><Text style={styles.mediaTitle}>{item.id} · {item.mode}</Text><Text style={styles.mediaMeta}>activation {item.activation.toFixed(2)} · {item.reasonCodes.join(', ')||'no strong cue'}</Text></View></View>)}{memoryInspector.userPatterns?.map((item,index)=><Data key={`pattern-${index}`} label="Pattern" value={`${item.summary??'Unknown'} (${Math.round(Number(item.confidence??0)*100)}%)`}/>) }{memoryInspector.recentEpisodes?.map((item,index)=><Data key={`episode-${index}`} label="Recent episode" value={`${item.title??'Untitled'} · ${Number(item.significance??0).toFixed(2)}`}/>)}</>:null}
    <SectionHeader title="Schedule inspector"/>
    {schedule.length?schedule.map((event)=><View key={event.id} style={styles.media}><View style={{flex:1}}><Text style={styles.mediaTitle}>{new Date(event.starts_at).toLocaleString()} · {event.title}</Text><Text style={styles.mediaMeta}>{snapshot?.locations.find((item)=>item.id===event.location_id)?.name??'Travel'} · {event.source} · {event.priority} · {event.visibility} · {event.interruptibility}</Text><Text style={styles.mediaMeta}>score={String(event.metadata?.score??'n/a')} · {Array.isArray(event.metadata?.reasons)?event.metadata.reasons.join(', '):String(event.metadata?.reason??'deterministic selection')}</Text></View></View>):<Data label="Schedule" value="Generate from Home or Resolve one hour"/>}
    <SectionHeader title="Relationship"/>
    <Data label="Last interaction quality" value={relation?.last_interaction_quality}/>
    <Data label="Last relationship delta" value={relation?.last_relationship_delta?JSON.stringify(relation.last_relationship_delta):undefined}/>
    {relation?Object.entries(relation).filter(([,value])=>typeof value==='number').map(([key,value])=><Data key={key} label={key} value={String(value)}/>):null}
    <SectionHeader title="Canonical context"/>
    <Data label="Active story" value={activeStory?.together_story_arc_templates?.title}/>
    <Data label="Next plan" value={nextPlan?.title}/>
    <Data label="Next Date" value={nextDate?.together_date_templates.name}/>
    <Data label="Snapshot payload" value={snapshot?`${new TextEncoder().encode(JSON.stringify(snapshot)).byteLength.toLocaleString()} bytes`:undefined}/>
    <SectionHeader title="Content simulation"/>
    <View style={styles.buttons}><GradientButton label="Resolve one hour" onPress={()=>void advance(1)}/><GradientButton label="Simulate 1 day" onPress={()=>void simulateContent(1)}/><GradientButton label="Simulate 7 days" onPress={()=>void simulateContent(7)}/><GradientButton label="Simulate 30 days" onPress={()=>void simulateContent(30)}/></View>
    <SectionHeader title="Media inspector"/>
    {media.length?media.map((item)=><View key={item.id} style={styles.media}><View style={{flex:1}}><Text style={styles.mediaTitle}>{item.status.toUpperCase()} · {String(item.metadata?.source??'unknown')}</Text><Text style={styles.mediaMeta}>{mediaPlace(item.metadata)}</Text><Text style={styles.mediaMeta}>{String(item.metadata?.photoOpportunitySlug??'no opportunity')} · {String(item.metadata?.shotType??'unknown')} · {String(item.metadata?.resolvedContentLevel??item.content_level)}</Text></View>{item.status==='failed'?<Pressable onPress={()=>void retry(item.id)} style={styles.retry}><RefreshCw size={15} color={colors.rose}/></Pressable>:null}</View>):<Data label="Media" value="No media rows"/>}
    <SectionHeader title="Open Threads"/>
    {life?.threads.map((thread)=><Data key={thread.id} label={thread.follow_up_eligible?'Eligible':'Waiting'} value={thread.topic}/>) }
  </Screen>;
}
function mediaPlace(metadata?:Record<string,unknown>){const place=metadata?.placeContext;return typeof place==='object'&&place&&'path'in place?String((place as{path?:unknown}).path??'No place snapshot'):String(metadata?.sceneSummary??'No place snapshot');}
function Data({label,value}:{label:string;value?:string}){return <View style={styles.data}><Text style={styles.label}>{label.replaceAll('_',' ')}</Text><Text style={styles.value}>{value??'—'}</Text></View>}
const styles=StyleSheet.create({header:{flexDirection:'row',alignItems:'center',gap:14},warning:{color:colors.warm,fontSize:10,fontWeight:'800',letterSpacing:1.2},data:{flexDirection:'row',justifyContent:'space-between',gap:10,backgroundColor:colors.surface,borderRadius:radius.sm,padding:12},label:{color:colors.muted,textTransform:'capitalize'},value:{color:colors.text,maxWidth:'65%',textAlign:'right'},buttons:{gap:10},media:{flexDirection:'row',gap:10,backgroundColor:colors.surface,borderRadius:radius.md,padding:12,borderWidth:1,borderColor:colors.border},mediaTitle:{color:colors.text,fontSize:11,fontWeight:'900'},mediaMeta:{color:colors.muted,fontSize:10,lineHeight:15,marginTop:3},retry:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:colors.elevated}});
