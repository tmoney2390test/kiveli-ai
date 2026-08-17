import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Brain, CalendarDays, Camera, Check, ChevronRight, Copy, Heart, MapPin, MessageCircle, MoreHorizontal, Send, Sparkles, Undo2, Wand2 } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { CharacterAvatar, ErrorState, LoadingSkeleton, MediaTile, MoodBadge, RelationshipBadge } from '../src/components';
import { characterAssets, cityLifeAsset, locationHeroAsset, worldHeroAsset } from '../src/assets';
import { colors, radius, spacing } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { ApiError, confirmConversationAction, createSharedPlan, dismissConversationAction, manageConversation, manageInteraction, manageMedia, mutateMemory, reportMessage, resolveRelationshipMilestone, sendDialogue, simulate } from '../src/lib/api';
import { supabase } from '../src/lib/supabase';
import type { CharacterInstance, ConversationAction, ConversationEvent, GeneratedMedia, InteractionCandidate, Message, RelationshipMilestone, SceneSession, SharedPlan, Snapshot } from '../src/types';
import { activeCompanion } from '../src/lib/companionLife';
import { activeConversationFor, mergeOlderMessages } from '../src/lib/conversation';
import { confirmAction, promptText } from '../src/lib/dialogs';
import { type PlanOption } from '../src/lib/plans';
import { PlanSelection } from '../src/components/PlanSelection';
import { buildClientConversationContext, type ClientConversationContext } from '../src/lib/conversationContext';
import { createClientRequestId } from '../src/lib/requestId';
import { worldForLocation } from '../src/lib/place';

type Feedback = { kind: 'memory'|'moment'|'plan'; title: string; body: string; id?: string };
const PAGE_SIZE = 50;

export default function Chat() {
  const params = useLocalSearchParams<{ character?: string; plan?: string; draft?: string; location?: string; world?:string; planId?:string; repeatPlanId?:string }>();
  const { width } = useWindowDimensions();
  const showLeft = width >= 1080;
  const showRight = width >= 920;
  const { snapshot, refresh, setSnapshot, updateCompanion, applyServerDelta } = useTogether();
  const character = params.character ? snapshot?.characters.find((item) => item.together_character_templates.slug === params.character||item.together_character_templates.public_handle===params.character||item.character_template_id===params.character) : snapshot ? activeCompanion(snapshot) : undefined;
  const slug = character?.together_character_templates.slug ?? '';
  const conversation = snapshot&&character ? activeConversationFor(snapshot.conversations,character.id) : undefined;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [stream, setStream] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<Feedback|null>(null);
  const [showPlans, setShowPlans] = useState(params.plan === '1');
  const [planning, setPlanning] = useState(false);
  const [pendingActionId,setPendingActionId]=useState<string|null>(null);
  const [focusPlanId,setFocusPlanId]=useState<string|null>(params.planId??null);
  const [focusDismissed,setFocusDismissed]=useState(false);
  const [showPhotoRequests, setShowPhotoRequests] = useState(false);
  const [showInteractions, setShowInteractions] = useState(false);
  const [interactionCandidates, setInteractionCandidates] = useState<InteractionCandidate[]>([]);
  const [movementCandidates, setMovementCandidates] = useState<InteractionCandidate[]>([]);
  const [interactionScene, setInteractionScene] = useState<SceneSession|null>(null);
  const [interactionLoading, setInteractionLoading] = useState(false);
  const [lastInteraction, setLastInteraction] = useState<string|null>(null);
  const [showConversationMenu, setShowConversationMenu] = useState(false);
  const [resolvingMilestone, setResolvingMilestone] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const scroll = useRef<ScrollView>(null);
  const contentHeight = useRef(0);
  const previousHeight = useRef(0);
  const prepending = useRef(false);
  useEffect(()=>{if(params.plan==='1')setShowPlans(true);if(params.draft)setInput(params.draft);if(params.planId)setFocusPlanId(params.planId);},[params.plan,params.draft,params.planId]);
  useEffect(()=>{const focus=conversation?.metadata?.focus as Record<string,unknown>|undefined;if(!focusDismissed&&!focusPlanId&&focus?.type==='plan'&&typeof focus.planId==='string')setFocusPlanId(focus.planId);},[conversation?.id,conversation?.metadata,focusPlanId,focusDismissed]);
  const activeSceneMetadata=(conversation?.metadata?.activeScene??conversation?.metadata?.scene??null) as Record<string,unknown>|null;
  const hasActiveCommitment=Boolean(snapshot&&character&&((snapshot.sharedPlans??[]).some((plan)=>plan.character_instance_id===character.id&&plan.status==='active')||(snapshot.dates??[]).some((date)=>date.character_instance_id===character.id&&date.status==='active')));
  const isCoPresent=Boolean(activeSceneMetadata?.interactionMode==='co_present'||hasActiveCommitment);
  useEffect(()=>{
    if(!character?.id||!conversation?.id||!isCoPresent){setInteractionCandidates([]);setMovementCandidates([]);setInteractionScene(null);return;}
    let cancelled=false;setInteractionLoading(true);
    void manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[]}>({action:'resolve',characterInstanceId:character.id,conversationId:conversation.id}).then((result)=>{if(cancelled)return;setInteractionScene(result.scene?.id?result.scene:null);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);}).catch((caught)=>{if(!cancelled&&caught instanceof ApiError&&caught.code!=='SCENE_REQUIRED')setError(caught.message);}).finally(()=>{if(!cancelled)setInteractionLoading(false);});
    return()=>{cancelled=true;};
  },[character?.id,conversation?.id,isCoPresent,activeSceneMetadata?.sceneSessionId,activeSceneMetadata?.locationId]);

  const load = async () => {
    if (!conversation) return;
    if (__DEV__ && process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE === 'true') { setMessages([]); setLoading(false); return; }
    setLoading(true);
    const { data, error: loadError } = await supabase.from('together_messages').select('*').eq('conversation_id', conversation.id).order('created_at', { ascending: false }).limit(PAGE_SIZE);
    if (loadError) setError('Conversation history could not be loaded.'); else { const page=((data??[]) as Message[]).reverse();setMessages(page);setHasMore(page.length===PAGE_SIZE);void manageConversation({action:'read',conversationId:conversation.id}).then(refresh).catch(()=>undefined); }
    setLoading(false);
  };
  const loadOlder = async () => { const oldest=messages[0];if(!conversation||!oldest||loadingOlder||!hasMore)return;setLoadingOlder(true);previousHeight.current=contentHeight.current;prepending.current=true;const{data,error:olderError}=await supabase.from('together_messages').select('*').eq('conversation_id',conversation.id).lt('created_at',oldest.created_at).order('created_at',{ascending:false}).limit(PAGE_SIZE);if(olderError){setError('Earlier messages could not be loaded.');prepending.current=false;}else{const page=(data??[]) as Message[];setHasMore(page.length===PAGE_SIZE);setMessages((current)=>mergeOlderMessages(page,current));}setLoadingOlder(false);};
  useEffect(() => { void load(); }, [conversation?.id]);
  const simulationStale=Boolean(character&&(Date.now()-new Date(character.last_simulated_at).getTime()>2*60000||!(snapshot?.scheduleEvents??[]).some((item)=>item.character_instance_id===character.id&&new Date(item.ends_at)>new Date())));
  useEffect(()=>{if(!character?.id||!simulationStale)return;let cancelled=false;void simulate(character.id).then(()=>cancelled?undefined:refresh()).catch(()=>undefined);return()=>{cancelled=true;};},[character?.id,refresh,simulationStale]);
  useEffect(()=>{if(!character)return;const channel=supabase.channel(`kivelle-media-${character.id}`).on('postgres_changes',{event:'*',schema:'public',table:'together_generated_media',filter:`character_instance_id=eq.${character.id}`},()=>void refresh()).subscribe();return()=>{void supabase.removeChannel(channel);};},[character?.id,refresh]);
  useEffect(()=>{if(!character)return;const channel=supabase.channel(`kivelle-presence-${character.id}`).on('postgres_changes',{event:'*',schema:'public',table:'together_character_schedule_events',filter:`character_instance_id=eq.${character.id}`},()=>void refresh()).on('postgres_changes',{event:'UPDATE',schema:'public',table:'together_character_instances',filter:`id=eq.${character.id}`},()=>void refresh()).subscribe();return()=>{void supabase.removeChannel(channel);};},[character?.id,refresh]);
  useEffect(() => { if(prepending.current)return;const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 40); return () => clearTimeout(timer); }, [messages, stream, sending, feedback]);

  if (!snapshot || loading) return <LoadingSkeleton label="Opening your conversationâ€¦" />;
  if (!character || !conversation) return <ErrorState message="This conversation is not available yet." />;
  const chatContext=buildClientConversationContext(snapshot,character);
  const location = chatContext.scene.location;
  const milestone = snapshot.relationshipMilestones?.find((item) => item.character_instance_id === character.id);
  const prompts = chatContext.prompts;
  const pendingActions=(snapshot.conversationActions??[]).filter((item)=>item.character_instance_id===character.id&&item.conversation_id===conversation.id);

  const send = async (retryText?: string) => {
    const text = (retryText ?? input).trim(); if (!text || sending) return;
    const before = useTogether.getState().snapshot;
    setInput(''); setError(''); setSending(true); setStream(''); setFeedback(null);
    const optimistic: Message = { id: `local-${Date.now()}`, conversation_id: conversation.id, role: 'user', content: text, delivery_status: 'pending', created_at: new Date().toISOString() };
    setMessages((current) => [...current, optimistic]);
    try {
      // A clear free-text action is matched only against the server's current
      // scene candidates, then executed before the dialogue context is built.
      // This gives the normal companion response the real scene change to
      // react to, while questions and vague ideas remain ordinary chat.
      if(isCoPresent){
        try{
          const sceneResult=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[];intentMatch?:InteractionCandidate}>({action:'resolve',characterInstanceId:character.id,conversationId:conversation.id,intentText:text});
          setInteractionScene(sceneResult.scene?.id?sceneResult.scene:null);
          setInteractionCandidates(sceneResult.interactions??[]);
          setMovementCandidates(sceneResult.destinations??[]);
          if(sceneResult.intentMatch)await executeInteraction(sceneResult.intentMatch);
        }catch{/* The sent message is still valid if the scene changed. */}
      }
      const result = await sendDialogue({ conversationId: conversation.id, characterInstanceId: character.id, message: text, clientRequestId: createClientRequestId(),focusPlanId:focusPlanId??undefined }, (token) => setStream((current) => current + token));
      setStream(''); setMessages((current) => [...current.filter((item) => item.id !== optimistic.id), { ...optimistic, delivery_status: 'complete' }, result.message]);
      if(result.delta)applyServerDelta(result.delta);
      showNewStoryFeedback(before, useTogether.getState().snapshot, character.id, character.together_character_templates.name, setFeedback);
    } catch (caught) {
      setStream(''); setError(caught instanceof Error ? caught.message : 'The reply was interrupted.');
      if(caught instanceof ApiError&&caught.code==='CONVERSATION_ARCHIVED')await refresh();
      setMessages((current) => current.map((item) => item.id === optimistic.id ? { ...item, delivery_status: 'failed' } : item));
    } finally { setSending(false); }
  };

  const plan = async (option:PlanOption,scheduledFor:string) => {
    setPlanning(true); setError('');
    try {
      if(pendingActionId){await confirmConversationAction(pendingActionId,{activityKey:option.activityKey,locationId:option.locationId,startsAt:scheduledFor});await refresh();setPendingActionId(null);setShowPlans(false);}
      else{await createSharedPlan({activityKey:option.activityKey,locationId:option.locationId,characterInstanceId:character.id,startsAt:scheduledFor,requestId:createClientRequestId(),source:params.location?'location':'manual_planner',sourceConversationId:conversation.id});await refresh();setShowPlans(false);}
      if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The plan could not be saved.'); }
    finally { setPlanning(false); }
  };
  const undoMemory = async () => { if (!feedback?.id) return; await mutateMemory({ action:'forget', memoryId:feedback.id }); await refresh(); setFeedback(null); };
  const resolveInteractions = async () => {
    if(!isCoPresent){setError(`Join ${character.together_character_templates.name} at their current location to do something together.`);return;}
    setInteractionLoading(true);setError('');
    try{const result=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[]}>({action:'resolve',characterInstanceId:character.id,conversationId:conversation.id});setInteractionScene(result.scene?.id?result.scene:null);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);setShowInteractions(true);}catch(caught){setError(caught instanceof Error?caught.message:'The shared scene is no longer available.');}finally{setInteractionLoading(false);}
  };
  const applySceneDelta = (scene:SceneSession|null|undefined) => {
    if(!scene?.id)return;
    updateCompanion({...character,current_location_id:scene.location_id,current_activity:String(scene.state?.activityLabel??scene.activity_key??character.current_activity),current_interruptibility:'open',current_presence_source:'scene'});
  };
  const executeInteraction = async (candidate:InteractionCandidate) => {
    if(interactionLoading)return;setInteractionLoading(true);setError('');
    try{const result=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[];action?:{result?:{label?:string}}}>({action:'execute',characterInstanceId:character.id,conversationId:conversation.id,sceneId:interactionScene?.id,interactionKey:candidate.interactionKey,requestId:createClientRequestId()});setInteractionScene(result.scene?.id?result.scene:null);applySceneDelta(result.scene);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);setLastInteraction(candidate.label);setShowInteractions(false);if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);}catch(caught){setError(caught instanceof Error?caught.message:'That option is no longer available.');}finally{setInteractionLoading(false);}
  };
  const moveScene = async (candidate:InteractionCandidate) => {
    const destinationId=typeof candidate.effects.destinationLocationId==='string'?candidate.effects.destinationLocationId:null;if(!destinationId)return;
    if(interactionLoading)return;setInteractionLoading(true);setError('');
    try{const result=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[]}>({action:'move',characterInstanceId:character.id,conversationId:conversation.id,sceneId:interactionScene?.id,destinationLocationId:destinationId,requestId:createClientRequestId()});setInteractionScene(result.scene?.id?result.scene:null);applySceneDelta(result.scene);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);setLastInteraction(candidate.label);setShowInteractions(false);if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);}catch(caught){setError(caught instanceof Error?caught.message:'That place is no longer available right now.');}finally{setInteractionLoading(false);}
  };
  const resolveMilestone = async (action:RelationshipMilestone['choices'][number]['id']) => { if(!milestone||resolvingMilestone)return;setResolvingMilestone(true);setError('');try{const result=await resolveRelationshipMilestone(milestone.id,action);setSnapshot(result.snapshot);if(milestone.kind==='first_date_invitation'&&action==='accept')setFeedback({kind:'moment',title:`${milestone.title} unlocked`,body:'Your shared experience is ready in Dates.'});}catch(caught){setError(caught instanceof Error?caught.message:'That choice could not be saved.');}finally{setResolvingMilestone(false);} };
  const startNewConversation=()=>confirmAction({title:'Start a new conversation?',message:`This chat will move to history. ${character.together_character_templates.name} will still remember you and your relationship will continue.`,confirmLabel:'Start new conversation',onConfirm:async()=>{try{await manageConversation({action:'new',characterInstanceId:character.id});setMessages([]);setShowConversationMenu(false);await refresh();}catch(caught){setError(caught instanceof Error?caught.message:'A new conversation could not be started.');}}});
  const renameConversation=()=>promptText({title:'Rename conversation',message:'Choose a title that will help you find this chat later.',initialValue:conversation.title??'',onSubmit:async(title)=>{try{await manageConversation({action:'rename',conversationId:conversation.id,title});setShowConversationMenu(false);await refresh();}catch(caught){setError(caught instanceof Error?caught.message:'The conversation could not be renamed.');}}});
  const deleteConversation=()=>confirmAction({title:'Delete this conversation?',message:`These messages will be permanently removed.\n\n${character.together_character_templates.name} will still remember saved memories and your relationship will remain unchanged. Moments and photos in your shared history will remain.`,confirmLabel:'Delete conversation',destructive:true,onConfirm:async()=>{try{await manageConversation({action:'delete',conversationId:conversation.id});setMessages([]);setShowConversationMenu(false);await refresh();}catch(caught){setError(caught instanceof Error?caught.message:'The conversation could not be deleted.');}}});

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.shell}>
      {showLeft ? <LeftRail snapshot={snapshot} active={slug} /> : null}
      <View style={styles.conversation}>
        <ChatHeader character={character} location={location} relationshipStage={character.relationship_stage} onMenu={()=>setShowConversationMenu((value)=>!value)} />
        {!showRight&&chatContext.nextCommitment?<Pressable onPress={()=>chatContext.nextCommitment?.kind==='plan'&&router.push(`/plan/${chatContext.nextCommitment.id}` as never)} style={styles.mobileCommitment}><CalendarDays size={14} color={colors.rose}/><Text style={styles.mobileCommitmentText} numberOfLin…12047 tokens truncated…}}><Text style={styles.railKicker}>{title}</Text>{children}</View>; }
function ContextLine({icon,title,body}:{icon:React.ReactNode;title:string;body:string}) { return <View style={styles.contextLine}>{icon}<View style={{flex:1}}><Text style={styles.contextLineTitle}>{title}</Text><Text style={styles.contextCopy}>{body}</Text></View></View>; }

function relationshipLabel(stage:string){return({stranger:'You just met',acquaintance:'Getting acquainted',friend:'A real friendship',flirting:'There is a spark',dating:'You are dating',exclusive:'Choosing each other',long_term:'Building a life'} as Record<string,string>)[stage]??'Getting closer';}
function showNewStoryFeedback(before:Snapshot|null,after:Snapshot|null,characterId:string,name:string,set:(value:Feedback|null)=>void){if(!after)return;const previousMemories=new Set(before?.memories.map((item)=>item.id)??[]);const memory=after.memories.find((item)=>item.character_instance_id===characterId&&!previousMemories.has(item.id));if(memory){set({kind:'memory',title:`${name} remembered that`,body:presentMemoryText(memory.canonical_text,memory.memory_type),id:memory.id});return;}const previousMoments=new Set(before?.moments.map((item)=>item.id)??[]);const moment=after.moments.find((item)=>(item.character_instance_id===characterId||item.participant_instance_ids.includes(characterId))&&!previousMoments.has(item.id));if(moment)set({kind:'moment',title:'A new Moment',body:moment.summary,id:moment.id});}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.background},shell:{flex:1,width:'100%',maxWidth:1480,alignSelf:'center',flexDirection:'row',backgroundColor:colors.background},conversation:{flex:1,minWidth:0,overflow:'hidden',borderLeftWidth:1,borderRightWidth:1,borderColor:colors.border},leftRail:{width:270,flexGrow:0,flexShrink:0,padding:18,gap:10,backgroundColor:'#0B0E17'},rightRail:{width:310,flexGrow:0,flexShrink:0,backgroundColor:'#0B0E17'},rightContent:{padding:18,gap:18,paddingBottom:40},brand:{fontFamily:'Georgia',fontSize:28,color:colors.text,marginBottom:16},railKicker:{color:colors.dimmed,fontSize:10,fontWeight:'900',letterSpacing:1.3,marginTop:8},personRow:{flexDirection:'row',alignItems:'center',gap:10,padding:10,borderRadius:radius.md},personActive:{backgroundColor:'rgba(241,103,154,.10)',borderWidth:1,borderColor:'rgba(241,103,154,.18)'},personName:{color:colors.text,fontSize:14,fontWeight:'800'},personMeta:{color:colors.muted,fontSize:10,lineHeight:14,marginTop:2},unreadDot:{width:6,height:6,borderRadius:3,backgroundColor:colors.rose},railEvent:{flexDirection:'row',gap:9,padding:10,backgroundColor:colors.surface,borderRadius:radius.md},railEventTitle:{color:colors.text,fontSize:12,fontWeight:'800'},header:{paddingTop:50,paddingHorizontal:14,paddingBottom:12,flexDirection:'row',gap:10,alignItems:'center',borderBottomWidth:1,borderBottomColor:colors.border,backgroundColor:'rgba(8,11,19,.98)'},webHeader:{paddingTop:14},icon:{width:40,height:40,alignItems:'center',justifyContent:'center',borderRadius:20,backgroundColor:colors.surface},nameLine:{flexDirection:'row',alignItems:'center',gap:8},name:{color:colors.text,fontWeight:'800',fontSize:16},status:{color:colors.muted,fontSize:11,marginTop:3},menu:{position:'absolute',zIndex:20,top:72,right:12,width:270,padding:12,gap:2,borderRadius:radius.lg,backgroundColor:colors.elevated,borderWidth:1,borderColor:colors.borderBright,shadowColor:'#000',shadowOpacity:.45,shadowRadius:18,shadowOffset:{width:0,height:10}},menuTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:8,paddingBottom:5},menuTitle:{color:colors.text,fontFamily:'Georgia',fontSize:19},menuSection:{color:colors.dimmed,fontSize:8,fontWeight:'900',letterSpacing:1.2,paddingHorizontal:8,paddingTop:9,paddingBottom:3},menuItem:{minHeight:38,justifyContent:'center',paddingHorizontal:9,borderRadius:radius.sm},menuItemText:{color:colors.text,fontSize:12,fontWeight:'700'},messageScroll:{flex:1,minWidth:0},messages:{width:'100%',minWidth:0,padding:spacing.md,paddingBottom:24,gap:8},scene:{height:190,borderRadius:radius.lg,overflow:'hidden',borderWidth:1,borderColor:colors.borderBright,marginBottom:8},sceneShade:{flex:1,padding:16,justifyContent:'flex-end',backgroundColor:'rgba(7,8,16,.48)'},sceneTop:{position:'absolute',top:14,left:14,right:14,flexDirection:'row',justifyContent:'space-between'},sceneKicker:{color:'#FFD2E1',fontSize:10,fontWeight:'900',letterSpacing:1.3},sceneTime:{color:colors.text,fontSize:10,fontWeight:'800'},sceneTitle:{fontFamily:'Georgia',fontSize:28,color:colors.text,textShadowColor:'#000',textShadowRadius:8},sceneCopy:{color:'#F1E9EE',fontSize:12,lineHeight:17,marginTop:4,maxWidth:560},scenePeople:{flexDirection:'row',alignItems:'center',gap:8,marginTop:10},scenePeopleText:{color:colors.text,fontSize:11,fontWeight:'800'},day:{alignSelf:'center',color:colors.dimmed,fontSize:10,letterSpacing:1.1,fontWeight:'800',marginVertical:8},messageRow:{width:'86%',maxWidth:680,minWidth:0,flexDirection:'row',alignItems:'flex-end',gap:7},assistantRow:{alignSelf:'flex-start'},userRow:{alignSelf:'flex-end',justifyContent:'flex-end'},bubble:{minWidth:0,maxWidth:'100%',flexShrink:1,paddingHorizontal:14,paddingVertical:10,borderRadius:radius.md},assistantBubble:{backgroundColor:colors.surface,borderBottomLeftRadius:4,borderWidth:1,borderColor:'rgba(255,255,255,.06)'},userBubble:{backgroundColor:'#B93467',borderBottomRightRadius:4,shadowColor:colors.rose,shadowOpacity:.18,shadowRadius:10,shadowOffset:{width:0,height:4}},failed:{borderWidth:1,borderColor:colors.danger,opacity:.75},messageText:{minWidth:0,maxWidth:'100%',flexShrink:1,color:colors.text,fontSize:15,lineHeight:22,...(Platform.OS==='web'?({overflowWrap:'anywhere',wordBreak:'break-word'} as never):{})},messageMedia:{width:300,maxWidth:'100%',height:238,marginTop:10},messageMeta:{flexDirection:'row',justifyContent:'flex-end',alignItems:'center',gap:8,marginTop:5},timestamp:{color:'rgba(255,255,255,.48)',fontSize:9},cursor:{color:colors.rose},typing:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:8,marginLeft:35,paddingHorizontal:12,paddingVertical:10,borderRadius:16,backgroundColor:colors.surface},typingDots:{flexDirection:'row',gap:3},dot:{width:5,height:5,borderRadius:3,backgroundColor:colors.rose,opacity:.5},typingText:{color:colors.muted,fontSize:12,fontStyle:'italic'},suggestions:{gap:8,marginTop:8},suggestionLabel:{color:colors.dimmed,fontSize:9,fontWeight:'900',letterSpacing:1.1},suggestion:{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:11,paddingVertical:9,borderRadius:radius.pill,borderWidth:1,borderColor:'rgba(241,103,154,.24)',backgroundColor:'rgba(241,103,154,.06)'},suggestionText:{color:'#FFB4CC',fontSize:11,fontWeight:'700'},empty:{alignSelf:'center',width:'100%',maxWidth:520,backgroundColor:colors.surface,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,padding:spacing.lg,gap:9,marginVertical:12},emptyTitle:{color:colors.text,fontFamily:'Georgia',fontSize:21},emptyCopy:{color:colors.muted,fontSize:13,lineHeight:19},emptyPrompt:{flexDirection:'row',justifyContent:'space-between',paddingVertical:8,borderTopWidth:1,borderTopColor:colors.border},retry:{alignSelf:'center',padding:10},retryText:{color:colors.danger,fontSize:12,textAlign:'center'},composerWrap:{borderTopWidth:1,borderTopColor:colors.border,backgroundColor:'rgba(8,11,19,.99)',paddingBottom:Platform.OS==='ios'?22:8},quickActions:{flexDirection:'row',gap:7,paddingHorizontal:12,paddingTop:9},quickAction:{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:9,paddingVertical:7,borderRadius:radius.pill,backgroundColor:colors.surface},quickText:{color:colors.muted,fontSize:10,fontWeight:'700'},composer:{flexDirection:'row',alignItems:'flex-end',gap:9,padding:10},input:{flex:1,maxHeight:120,minHeight:50,borderRadius:24,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,color:colors.text,paddingHorizontal:17,paddingVertical:13},send:{width:50,height:50,borderRadius:25,backgroundColor:colors.rose,alignItems:'center',justifyContent:'center',shadowColor:colors.rose,shadowOpacity:.3,shadowRadius:12,shadowOffset:{width:0,height:5}},sendDisabled:{opacity:.4},aiNote:{color:colors.dimmed,fontSize:9,textAlign:'center',paddingHorizontal:12},contextPortrait:{width:'100%',height:190,borderRadius:radius.lg},contextName:{fontFamily:'Georgia',fontSize:27,color:colors.text,marginTop:-8},contextBio:{color:colors.muted,fontSize:11,marginTop:-14},contextLine:{flexDirection:'row',gap:8,padding:11,borderRadius:radius.md,backgroundColor:colors.surface},contextLineTitle:{color:colors.text,fontSize:12,fontWeight:'800'},contextCopy:{flex:1,color:colors.muted,fontSize:11,lineHeight:16},contextMuted:{color:colors.dimmed,fontSize:11,lineHeight:16},threadCard:{flexDirection:'row',alignItems:'center',gap:9,padding:11,borderRadius:radius.md,backgroundColor:'rgba(241,103,154,.08)',borderWidth:1,borderColor:'rgba(241,103,154,.18)'},threadTitle:{color:colors.rose,fontSize:10,fontWeight:'900'},memoryLine:{flexDirection:'row',gap:8,alignItems:'flex-start'},planButton:{minHeight:46,borderRadius:radius.md,backgroundColor:colors.rose,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},planButtonText:{color:'#fff',fontWeight:'800',fontSize:13},secondaryButton:{minHeight:46,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},secondaryButtonText:{color:colors.text,fontWeight:'800',fontSize:13},planTray:{flexDirection:'row',alignItems:'center',gap:8,padding:10,borderBottomWidth:1,borderBottomColor:colors.border,backgroundColor:colors.elevated},photoTray:{padding:12,gap:10,borderBottomWidth:1,borderBottomColor:colors.border,backgroundColor:colors.elevated},photoChoices:{flexDirection:'row',flexWrap:'wrap',gap:7},photoChoice:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,paddingVertical:8,borderRadius:radius.pill,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},photoChoiceText:{color:colors.text,fontSize:10,fontWeight:'700'},planTitle:{color:colors.text,fontWeight:'800',fontSize:12},planChoice:{paddingHorizontal:10,paddingVertical:8,borderRadius:radius.pill,backgroundColor:colors.rose},planChoiceText:{color:'#fff',fontSize:10,fontWeight:'800'},closeText:{color:colors.muted,fontSize:10,fontWeight:'700'},feedback:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:radius.lg,backgroundColor:'rgba(154,104,255,.10)',borderWidth:1,borderColor:'rgba(154,104,255,.25)',marginTop:8},feedbackIcon:{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface},feedbackTitle:{color:colors.text,fontWeight:'900',fontSize:12},feedbackBody:{color:colors.muted,fontSize:11,lineHeight:16,marginTop:2},feedbackAction:{paddingHorizontal:10,paddingVertical:7,borderRadius:radius.pill,backgroundColor:colors.rose},feedbackActionText:{color:'#fff',fontWeight:'800',fontSize:10},milestoneCard:{alignSelf:'center',width:'100%',maxWidth:560,marginTop:10,padding:18,borderRadius:radius.xl,backgroundColor:'rgba(84,37,74,.88)',borderWidth:1,borderColor:'rgba(241,103,154,.34)',shadowColor:colors.rose,shadowOpacity:.16,shadowRadius:18,shadowOffset:{width:0,height:8}},milestoneTense:{backgroundColor:'rgba(75,48,36,.88)',borderColor:'rgba(242,162,127,.38)'},milestoneIcon:{width:38,height:38,borderRadius:19,backgroundColor:'rgba(255,255,255,.07)',alignItems:'center',justifyContent:'center',marginBottom:10},milestoneKicker:{color:'#FFB4CC',fontSize:9,fontWeight:'900',letterSpacing:1.3},milestoneTitle:{fontFamily:'Georgia',fontSize:23,color:colors.text,marginTop:6},milestoneBody:{color:'#E8DDE5',fontSize:13,lineHeight:19,marginTop:7},milestonePrompt:{color:colors.text,fontSize:12,fontWeight:'800',marginTop:14},milestoneChoices:{gap:8,marginTop:10},milestoneChoice:{minHeight:44,borderRadius:radius.md,borderWidth:1,borderColor:'rgba(255,255,255,.14)',alignItems:'center',justifyContent:'center',paddingHorizontal:12},milestoneChoicePrimary:{backgroundColor:colors.rose,borderColor:colors.rose},milestoneChoiceText:{color:colors.text,fontSize:12,fontWeight:'800'},milestoneChoicePrimaryText:{color:'#fff'},olderLoading:{color:colors.muted,fontSize:11,textAlign:'center',paddingVertical:7},historyStart:{color:colors.dimmed,fontSize:10,textAlign:'center',paddingVertical:7}
  ,planScroll:{flex:1,minWidth:0}
  ,planScrollContent:{paddingBottom:24}
  ,quickActionFitted:{flex:1,minWidth:0,justifyContent:'center',paddingHorizontal:6}
  ,quickTextFitted:{flexShrink:1}
  ,inputFitted:{minWidth:0}
  ,plannerTray:{gap:10,padding:12,borderBottomWidth:1,borderBottomColor:colors.border,backgroundColor:colors.elevated}
  ,planHeader:{flexDirection:'row',alignItems:'flex-start',gap:10}
  ,planOptions:{flexDirection:'row',flexWrap:'wrap',gap:8}
  ,planOption:{width:'48%',minWidth:220,flexGrow:1,flexDirection:'row',alignItems:'center',gap:8,padding:11,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border}
  ,planOptionTitle:{color:colors.text,fontSize:12,fontWeight:'900'}
  ,planOptionCopy:{color:colors.muted,fontSize:10,lineHeight:14,marginTop:3}
  ,planReason:{color:colors.rose,fontSize:9,fontWeight:'800',marginTop:5}
  ,planSlots:{flexDirection:'row',flexWrap:'wrap',gap:8}
  ,planSlot:{minWidth:180,flex:1,flexDirection:'row',alignItems:'center',gap:8,padding:11,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:'rgba(242,162,127,.28)'}
  ,planSlotTitle:{color:colors.text,fontSize:11,fontWeight:'900'}
  ,planSlotDetail:{color:colors.muted,fontSize:9,marginTop:3}
  ,planDisabled:{opacity:.55}
  ,actionCard:{alignSelf:'center',width:'100%',maxWidth:560,flexDirection:'row',gap:12,padding:14,borderRadius:radius.lg,backgroundColor:'rgba(33,23,44,.96)',borderWidth:1,borderColor:'rgba(241,103,154,.30)',marginVertical:6}
  ,actionIcon:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(241,103,154,.10)'}
  ,actionKicker:{color:colors.rose,fontSize:9,fontWeight:'900',letterSpacing:1.2}
  ,actionTitle:{color:colors.text,fontSize:14,fontWeight:'900',marginTop:4,marginBottom:3}
  ,actionButtons:{flexDirection:'row',gap:8,marginTop:11}
  ,actionPrimary:{minHeight:36,paddingHorizontal:13,borderRadius:radius.pill,alignItems:'center',justifyContent:'center',backgroundColor:colors.rose}
  ,actionPrimaryText:{color:'#fff',fontSize:10,fontWeight:'900'}
  ,actionSecondary:{minHeight:36,paddingHorizontal:13,borderRadius:radius.pill,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border}
  ,actionSecondaryText:{color:colors.muted,fontSize:10,fontWeight:'800'}
  ,mobileCommitment:{minHeight:38,marginHorizontal:12,marginTop:8,paddingHorizontal:11,borderRadius:radius.pill,flexDirection:'row',alignItems:'center',gap:7,backgroundColor:'rgba(241,103,154,.08)',borderWidth:1,borderColor:'rgba(241,103,154,.20)'}
  ,mobileCommitmentText:{flex:1,color:colors.text,fontSize:11,fontWeight:'800'}
  ,planTarget:{padding:10,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,marginTop:7}
  ,timelinePlan:{alignSelf:'center',width:'100%',maxWidth:560,flexDirection:'row',alignItems:'center',gap:11,padding:14,borderRadius:radius.lg,backgroundColor:'rgba(241,103,154,.07)',borderWidth:1,borderColor:'rgba(241,103,154,.22)',marginVertical:6}
  ,customTime:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8}
  ,dateInput:{flex:2,minWidth:150,minHeight:40,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,color:colors.text,paddingHorizontal:12}
  ,timeInput:{flex:1,minWidth:90,minHeight:40,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,color:colors.text,paddingHorizontal:12}
  ,focusChip:{flexDirection:'row',alignItems:'center',marginHorizontal:12,marginTop:7,borderRadius:radius.pill,backgroundColor:'rgba(241,103,154,.08)',borderWidth:1,borderColor:'rgba(241,103,154,.22)',overflow:'hidden'}
  ,focusChipMain:{minWidth:0,flex:1,flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:11,paddingVertical:8}
  ,focusLabel:{color:colors.rose,fontSize:9,fontWeight:'900',textTransform:'uppercase'}
  ,focusTitle:{minWidth:0,flex:1,color:colors.text,fontSize:10,fontWeight:'800'}
  ,focusClose:{width:38,minHeight:34,alignItems:'center',justifyContent:'center',borderLeftWidth:1,borderLeftColor:colors.border}
  ,focusCloseText:{color:colors.muted,fontSize:19,lineHeight:20}
  ,intentRow:{flexDirection:'row',flexWrap:'wrap',gap:7}
  ,intentChip:{paddingHorizontal:11,paddingVertical:9,borderRadius:radius.pill,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border}
  ,intentChipActive:{borderColor:colors.rose,backgroundColor:'rgba(241,103,154,.10)'}
  ,intentText:{color:colors.text,fontSize:10,fontWeight:'800'}
  ,pickCard:{gap:7,padding:15,borderRadius:radius.lg,backgroundColor:'rgba(241,103,154,.08)',borderWidth:1,borderColor:'rgba(241,103,154,.25)'}
  ,pickQuote:{color:'#F8D9E5',fontFamily:'Georgia',fontSize:15,lineHeight:21}
  ,pickName:{color:colors.text,fontFamily:'Georgia',fontSize:23,marginTop:2}
  ,bestTime:{color:colors.text,fontSize:15,fontWeight:'900',marginTop:5}
  ,bestReason:{color:colors.warm,fontSize:10,fontWeight:'800',marginBottom:4}
  ,alternateTimes:{flexDirection:'row',flexWrap:'wrap',gap:7}
  ,timeChip:{flex:1,minWidth:130,padding:10,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface}
  ,timeChipTitle:{color:colors.text,fontSize:10,fontWeight:'900'}
  ,timeChipDetail:{color:colors.muted,fontSize:9,marginTop:3}
  ,timelineActions:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:7,marginTop:9}
  ,timelineAction:{paddingHorizontal:10,paddingVertical:7,borderRadius:radius.pill,borderWidth:1,borderColor:colors.border}
  ,timelineActionText:{color:colors.text,fontSize:9,fontWeight:'800'}
  ,timelineMore:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface}
  ,interactionSuggestion:{borderColor:'rgba(242,162,127,.38)',backgroundColor:'rgba(242,162,127,.08)'}
  ,contextualTray:{gap:8,paddingHorizontal:12,paddingVertical:10,borderTopWidth:1,borderTopColor:colors.border,backgroundColor:colors.elevated}
  ,contextualTrayHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}
  ,contextualMore:{color:colors.rose,fontSize:10,fontWeight:'900'}
  ,contextualTrayActions:{gap:8,paddingRight:16}
  ,contextualAction:{minHeight:38,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:11,borderRadius:radius.pill,backgroundColor:'rgba(241,103,154,.08)',borderWidth:1,borderColor:'rgba(241,103,154,.24)'}
  ,contextualActionText:{color:colors.text,fontSize:11,fontWeight:'800'}
  ,interactionTray:{gap:10,padding:12,borderTopWidth:1,borderTopColor:colors.border,backgroundColor:colors.elevated,maxHeight:360}
  ,interactionSectionTitle:{color:colors.dimmed,fontSize:9,fontWeight:'900',letterSpacing:1.2,marginTop:2}
  ,interactionOptions:{flexDirection:'row',flexWrap:'wrap',gap:8}
  ,interactionOption:{flexBasis:'48%',flexGrow:1,minWidth:190,flexDirection:'row',alignItems:'center',gap:9,padding:11,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border}
  ,interactionOptionTitle:{color:colors.text,fontSize:12,fontWeight:'900'}
  ,interactionOptionMeta:{color:colors.muted,fontSize:10,marginTop:3}
  ,sceneActionFeedback:{alignSelf:'center',flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:12,paddingVertical:8,borderRadius:radius.pill,backgroundColor:'rgba(241,103,154,.08)',borderWidth:1,borderColor:'rgba(241,103,154,.20)',marginTop:8}
  ,sceneActionFeedbackText:{color:'#FFC0D4',fontSize:11,fontWeight:'800'}
});

