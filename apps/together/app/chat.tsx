import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Brain, CalendarDays, Camera, Check, ChevronRight, Copy, Heart, ImagePlus, MapPin, MessageCircle, Mic, MoreHorizontal, Pause, Phone, Play, Send, Sparkles, Square, Star, Trash2, Undo2, Volume2, Wand2, X } from 'lucide-react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { MESSAGE_CHARACTER_LIMIT, messageCharacterLimitError } from '@together/domain/src/message-limits';
import { isPhotoOnlyConversationMessage } from '@together/domain/src/media';
import { ActivePlanBar, CharacterAvatar, ChatPhotoRequestCard, DateTimeFields, EndPlanConfirmation, ErrorState, FrostedBackdrop, FrostedSurface, KivelleLogo, LoadingSkeleton, MediaTile, MessageCharacterCounter, PlanDetailsModal, VoiceNotePurchaseModal, resolveCharacterPortraitSource } from '../src/components';
import { characterAssets, cityLifeAsset, locationHeroAsset, worldHeroAsset } from '../src/assets';
import { colors, radius, spacing } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { ApiError, confirmConversationAction, confirmUserImage, createSharedPlan, dismissConversationAction, ensureConversation, manageConversation, manageInteraction, manageMedia, manageSharedScene, mutateMemory, prepareUserImage, quoteVoiceNote, refreshVoiceNote, removePendingAttachment, reportMessage, requestVoiceNote, resolveRelationshipMilestone, sendDialogue, sendSceneReaction, setCharacterFavorite, simulate, suggestDialogue } from '../src/lib/api';
import { supabase } from '../src/lib/supabase';
import type { AutoDialoguePreference, AutoDialogueSuggestion, CharacterInstance, CharacterInteractionProposal, ConversationAction, ConversationAttachment, ConversationEvent, GeneratedMedia, InteractionCandidate, MediaOffer,Message, PlanExperience, RelationshipMilestone, SceneAction, SceneParticipant, SceneSession, SharedPlan, Snapshot } from '../src/types';
import { activeCompanion } from '../src/lib/companionLife';
import { activeConversationFor, isActiveConversation, mergeOlderMessages, mostRecentlyUsedConversation, scopedConversationMessages } from '../src/lib/conversation';
import { confirmAction } from '../src/lib/dialogs';
import { defaultPlanTimeFields, parseCustomPlanTime, type PlanOption, type PlanTimingSelection } from '../src/lib/plans';
import { PlanSelection } from '../src/components/PlanSelection';
import { ChatSettingsModal } from '../src/components/ChatSettingsModal';
import { buildClientConversationContext, type ClientConversationContext } from '../src/lib/conversationContext';
import { chatMessageTypography } from '../src/lib/chatSettings';
import { createClientRequestId } from '../src/lib/requestId';
import { worldForLocation } from '../src/lib/place';
import { presentMemoryText } from '../src/lib/memoryPresentation';
import { mediaWithoutActivePhotoOffer, photoOfferForMessage, photoOffersWithoutVisibleMessages, shouldShowPhotoGenerationPending } from '../src/lib/photoRequestPresentation';
import { latestMediaOfferPreviewUri } from '../src/lib/mediaOfferPresentation';
import { interactionFeedback, interactionFeedbackCopy, proposalHeading, type InteractionFeedbackPresentation } from '../src/lib/interactionPresentation';
import { dialogueFailureMayHavePersisted } from '../src/lib/dialogueRecovery';
import { endPlanExperience, joinCommitment, switchPlanExperience } from '../src/lib/commitments';
import { activePlanForChat, collapsePlanTimelineEvents, planActionAvailability, shouldShowPlanConversationAction, shouldShowPlanTimelineEvent } from '../src/lib/planActions';
import { hideVoiceNoteConfirmation, isVoiceNoteConfirmationHidden } from '../src/lib/voiceNoteConfirmation';
import { chatSessionRouteKey } from '../src/lib/messageInbox';
import { mergeDictationTranscript } from '../src/lib/dictation';
import { useChatDictation, type ChatDictationPhase } from '../src/hooks/useChatDictation';

type Feedback = { kind: 'memory'|'moment'|'plan'; title: string; body: string; id?: string };
type PendingImage={uri:string;mimeType:'image/jpeg'|'image/png'|'image/webp';byteSize:number;width?:number;height?:number;fileName?:string|null};
type PlanMutationResult={kind:'shared_plan'|'date';commitment:{id:string};experience?:PlanExperience};
type ConversationActionMutation={applied:boolean;candidateId:string;result?:PlanMutationResult};
type SharedSceneCharacter={id:string;current_location_id?:string|null;together_character_templates:{name:string;slug:string;public_handle?:string|null};together_character_versions?:{portrait_asset_url?:string|null;visual_identity?:Record<string,unknown>}|null};
type SharedSceneRoster={scene:SceneSession|null;participants:Array<SceneParticipant&{together_character_instances?:SharedSceneCharacter|null}>;availableCharacters:Array<SharedSceneCharacter&{presence?:Record<string,unknown>}>};
type ChatParams={character?:string;plan?:string;draft?:string;location?:string;world?:string;activity?:string;planId?:string;repeatPlanId?:string};
type VoiceNoteRequestResult={status?:string;providerStatus?:string;message?:string;media?:GeneratedMedia};
type VoiceNotePrompt={messageId:string;name:string;creditCost:number;creditBalance:number};
const PAGE_SIZE = 50;

export default function Chat() {
  const params=useLocalSearchParams<ChatParams>();
  const snapshot=useTogether((state)=>state.snapshot);
  const route=resolveChatRoute(snapshot,params);
  const pendingKey=[params.character,params.planId,params.world,params.location].filter(Boolean).join(':')||'recent';
  return <ChatSession key={chatSessionRouteKey(route.conversation?.id,params,pendingKey)}/>;
}

function ChatSession() {
  const params = useLocalSearchParams<ChatParams>();
  const { width } = useWindowDimensions();
  const showLeft = width >= 1080;
  const showRight = width >= 920;
  const { snapshot, refresh, setSnapshot, setCoreState, updateCompanion, upsertConversation, upsertMedia, upsertSceneSession, upsertConversationAction, removeConversationAction, applyServerDelta, pendingDialogues, beginPendingDialogue, finishPendingDialogue } = useTogether();
  const {character,conversation}=resolveChatRoute(snapshot,params);
  const slug = character?.together_character_templates.slug ?? '';
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeVoiceNoteId,setActiveVoiceNoteId]=useState<string|null>(null);
  const [voiceNotePrompt,setVoiceNotePrompt]=useState<VoiceNotePrompt|null>(null);
  const [voiceNotePromptBusy,setVoiceNotePromptBusy]=useState(false);
  const voiceNotePromptResolver=useRef<((decision:{hideFuture:boolean}|null)=>void)|null>(null);
  const [loadedConversationId, setLoadedConversationId] = useState<string|null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [stream, setStream] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<Feedback|null>(null);
  const [showPlans, setShowPlans] = useState(params.plan === '1');
  const [planning, setPlanning] = useState(false);
  const planRequestIdRef=useRef(createClientRequestId());
  const realtimeScopeRef=useRef(createClientRequestId());
  const [pendingActionId,setPendingActionId]=useState<string|null>(null);
  const [initialPlanTimingChoice,setInitialPlanTimingChoice]=useState<'custom'|null>(null);
  const [focusPlanId,setFocusPlanId]=useState<string|null>(params.planId??null);
  const [focusDismissed,setFocusDismissed]=useState(false);
  const [showPhotoRequests, setShowPhotoRequests] = useState(false);
  const [showInteractions, setShowInteractions] = useState(false);
  const [interactionCandidates, setInteractionCandidates] = useState<InteractionCandidate[]>([]);
  const [movementCandidates, setMovementCandidates] = useState<InteractionCandidate[]>([]);
  const [interactionScene, setInteractionScene] = useState<SceneSession|null>(null);
  const [sharedSceneRoster,setSharedSceneRoster]=useState<SharedSceneRoster|null>(null);
  const [interactionLoading, setInteractionLoading] = useState(false);
  const [lastInteraction, setLastInteraction] = useState<InteractionFeedbackPresentation|null>(null);
  const [characterProposal,setCharacterProposal]=useState<CharacterInteractionProposal|null>(null);
  const [showConversationMenu, setShowConversationMenu] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [pendingImage,setPendingImage]=useState<PendingImage|null>(null);
  const [awaitingPhotoOffer,setAwaitingPhotoOffer]=useState(false);
  const [reconcilingMediaId,setReconcilingMediaId]=useState<string|null>(null);
  const [mediaOffers,setMediaOffers]=useState<MediaOffer[]>([]);
  const [mediaOfferBusy,setMediaOfferBusy]=useState<string|null>(null);
  const [autoDialogue,setAutoDialogue]=useState<AutoDialogueSuggestion|null>(null);
  const [autoDialogueBusy,setAutoDialogueBusy]=useState(false);
  const [showAutoDialogueOptions,setShowAutoDialogueOptions]=useState(false);
  const [resolvingMilestone, setResolvingMilestone] = useState(false);
  const [favoriteBusy,setFavoriteBusy]=useState(false);
  const [planModal,setPlanModal]=useState<{planId:string;confirmCancel?:boolean}|null>(null);
  const [planActionBusyId,setPlanActionBusyId]=useState<string|null>(null);
  const [planEndTarget,setPlanEndTarget]=useState<SharedPlan|null>(null);
  const [switchPlanId,setSwitchPlanId]=useState<string|null>(null);
  const [conversationBootstrapError,setConversationBootstrapError]=useState('');
  const [conversationBootstrapAttempt,setConversationBootstrapAttempt]=useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pendingDialogue=conversation?pendingDialogues[conversation.id]:undefined;
  const replyPending=sending||Boolean(pendingDialogue);
  const conversationReady=Boolean(conversation&&loadedConversationId===conversation.id&&!loading);
  const scroll = useRef<ScrollView>(null);
  const composerInput = useRef<TextInput>(null);
  const contentHeight = useRef(0);
  const previousHeight = useRef(0);
  const prepending = useRef(false);
  const bottomAlignedConversation = useRef<string|null>(null);
  const messageCache = useRef(new Map<string,{messages:Message[];hasMore:boolean}>());
  const autoDialogueRequest=useRef<AbortController|null>(null);
  const currentInput=useRef('');
  const latestTimelineMessageId=useRef<string|null>(null);
  const lastFocusedConversationId=useRef<string|null>(null);
  const observedPendingRequest=useRef<string|null>(null);
  const fetchPendingMediaOffers=useCallback(async(characterInstanceId:string,conversationId:string)=>{
    const result=await manageMedia<{offers:MediaOffer[]}>({action:'list_pending_offers',characterInstanceId});
    return(result.offers??[]).filter((offer)=>(!offer.conversation_id||offer.conversation_id===conversationId));
  },[]);
  useEffect(()=>{
    if(!snapshot||!character||conversation)return;
    let cancelled=false;
    setConversationBootstrapError('');
    void ensureConversation(character.id).then((created)=>{if(!cancelled)upsertConversation(created);}).catch((caught)=>{if(!cancelled)setConversationBootstrapError(caught instanceof Error?caught.message:'The conversation could not be opened.');});
    return()=>{cancelled=true;};
  },[character?.id,conversation?.id,conversationBootstrapAttempt,upsertConversation]);
  useEffect(()=>{if(params.plan==='1')setShowPlans(true);if(params.draft)setInput(params.draft);if(params.planId)setFocusPlanId(params.planId);},[params.plan,params.draft,params.planId]);
  useEffect(()=>{const focus=conversation?.metadata?.focus as Record<string,unknown>|undefined;if(!focusDismissed&&!focusPlanId&&focus?.type==='plan'&&typeof focus.planId==='string')setFocusPlanId(focus.planId);},[conversation?.id,conversation?.metadata,focusPlanId,focusDismissed]);
  const activeSceneMetadata=(conversation?.metadata?.activeScene??conversation?.metadata?.scene??null) as Record<string,unknown>|null;
  const hasActiveCommitment=Boolean(snapshot&&character&&((snapshot.sharedPlans??[]).some((plan)=>plan.character_instance_id===character.id&&isLivePlan(plan)&&Boolean(plan.attendance?.user&&!plan.attendance.user.left_at))||(snapshot.dates??[]).some((date)=>date.character_instance_id===character.id&&date.status==='active')));
  const metadataCoPresent=activeSceneMetadata?.interactionMode==='co_present'&&activeSceneMetadata?.entryReason!=='shared_plan';
  const isCoPresent=Boolean(metadataCoPresent||hasActiveCommitment);
  useEffect(()=>{
    if(!character?.id||!conversation?.id||!isCoPresent){setInteractionCandidates([]);setMovementCandidates([]);setInteractionScene(null);setCharacterProposal(null);return;}
    let cancelled=false;setInteractionLoading(true);
    void manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[];characterProposal?:CharacterInteractionProposal}>({action:'resolve',characterInstanceId:character.id,conversationId:conversation.id}).then((result)=>{if(cancelled)return;setInteractionScene(result.scene?.id?result.scene:null);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);setCharacterProposal(result.characterProposal??null);}).catch((caught)=>{if(!cancelled&&caught instanceof ApiError&&caught.code!=='SCENE_REQUIRED')setError(caught.message);}).finally(()=>{if(!cancelled)setInteractionLoading(false);});
    return()=>{cancelled=true;};
  },[character?.id,conversation?.id,isCoPresent,activeSceneMetadata?.sceneSessionId,activeSceneMetadata?.locationId]);
  useFocusEffect(useCallback(()=>{
    if(!conversation?.id||!isCoPresent){setSharedSceneRoster(null);return;}
    let cancelled=false;
    const loadRoster=()=>manageSharedScene<SharedSceneRoster>({action:'available',conversationId:conversation.id}).then((result)=>{if(!cancelled)setSharedSceneRoster(result);}).catch(()=>{if(!cancelled)setSharedSceneRoster(null);});
    void loadRoster();
    const channel=supabase.channel(`kivelle-shared-scene-${conversation.id}-${realtimeScopeRef.current}`).on('postgres_changes',{event:'*',schema:'public',table:'together_scene_participants'},()=>void loadRoster()).on('postgres_changes',{event:'UPDATE',schema:'public',table:'together_scene_sessions'},()=>void loadRoster()).subscribe();
    return()=>{cancelled=true;void supabase.removeChannel(channel);};
  },[conversation?.id,isCoPresent,activeSceneMetadata?.sceneSessionId]));

  const loadOlder = async () => { const oldest=messages[0];if(!conversation||!oldest||loadingOlder||!hasMore)return;setLoadingOlder(true);previousHeight.current=contentHeight.current;prepending.current=true;const{data,error:olderError}=await supabase.from('together_messages').select('*,together_conversation_attachments(*)').eq('conversation_id',conversation.id).lt('created_at',oldest.created_at).order('created_at',{ascending:false}).limit(PAGE_SIZE);if(olderError){setError('Earlier messages could not be loaded.');prepending.current=false;}else{const page=await hydrateAttachmentUrls((data??[]) as Message[]);setHasMore(page.length===PAGE_SIZE);setMessages((current)=>mergeOlderMessages(page,current));}setLoadingOlder(false);};
  const recoverInterruptedDialogue=async(conversationId:string,optimistic:Message,clientRequestId:string):Promise<boolean>=>{for(const delay of [250,750,1_500,3_000,5_000]){await new Promise((resolve)=>setTimeout(resolve,delay));const{data:canonicalUser,error:userRecoveryError}=await supabase.from('together_messages').select('id,created_at').eq('conversation_id',conversationId).eq('role','user').eq('client_request_id',clientRequestId).maybeSingle();if(userRecoveryError||!canonicalUser)continue;const{data,error:recoveryError}=await supabase.from('together_messages').select('*,together_conversation_attachments(*)').eq('conversation_id',conversationId).gte('created_at',canonicalUser.created_at).order('created_at',{ascending:true}).limit(12);if(recoveryError)continue;const canonical=await hydrateAttachmentUrls((data??[]) as Message[]);if(!canonical.some((message)=>message.role==='assistant'))continue;setMessages((current)=>{const incomingIds=new Set(canonical.map((message)=>message.id));return[...current.filter((message)=>message.id!==optimistic.id&&!incomingIds.has(message.id)),...canonical].sort((left,right)=>new Date(left.created_at).getTime()-new Date(right.created_at).getTime());});await refresh();return true;}return false;};
  useEffect(() => {
    if(!conversation){setLoading(false);setLoadedConversationId(null);return;}
    const conversationId=conversation.id,cached=messageCache.current.get(conversationId);
    let cancelled=false;
    bottomAlignedConversation.current=null;
    setError('');setStream('');setSending(false);setFeedback(null);setAwaitingPhotoOffer(false);setPendingImage(null);setMediaOffers([]);setLastInteraction(null);setCharacterProposal(null);setPendingActionId(null);setFocusDismissed(false);setFocusPlanId(params.planId??null);setShowPlans(params.plan==='1');setShowPhotoRequests(false);setShowInteractions(false);setShowConversationMenu(false);setShowChatSettings(false);setPlanModal(null);setPlanActionBusyId(null);setPlanEndTarget(null);setSwitchPlanId(null);setInput(params.draft??'');
    if(cached){setMessages(cached.messages);setHasMore(cached.hasMore);setLoadedConversationId(conversationId);setLoading(false);}
    else{setMessages([]);setHasMore(true);setLoadedConversationId(null);setLoading(true);}
    if(__DEV__&&process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE==='true'){setMessages([]);setHasMore(false);setLoadedConversationId(conversationId);setLoading(false);return;}
    void (async()=>{
      const{data,error:loadError}=await supabase.from('together_messages').select('*,together_conversation_attachments(*)').eq('conversation_id',conversationId).order('created_at',{ascending:false}).limit(PAGE_SIZE);
      if(cancelled)return;
      if(loadError){if(!cached)setError('Conversation history could not be loaded.');setLoadedConversationId(conversationId);setLoading(false);return;}
      const page=await hydrateAttachmentUrls(((data??[]) as Message[]).reverse());
      if(cancelled)return;
      const hasOlder=page.length===PAGE_SIZE;
      messageCache.current.set(conversationId,{messages:page,hasMore:hasOlder});
      setMessages(page);setHasMore(hasOlder);setLoadedConversationId(conversationId);setLoading(false);
      void manageConversation({action:'read',conversationId}).then(()=>refresh()).catch(()=>undefined);
    })();
    return()=>{cancelled=true;};
  },[conversation?.id,refresh]);
  useEffect(()=>{if(loadedConversationId)messageCache.current.set(loadedConversationId,{messages,hasMore});},[hasMore,loadedConversationId,messages]);
  useFocusEffect(useCallback(()=>{
    const conversationId=conversation?.id;
    if(!conversationId||(__DEV__&&process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE==='true'))return;
    if(lastFocusedConversationId.current!==conversationId){lastFocusedConversationId.current=conversationId;return;}
    let active=true;
    void (async()=>{
      const{data,error:loadError}=await supabase.from('together_messages').select('*,together_conversation_attachments(*)').eq('conversation_id',conversationId).order('created_at',{ascending:false}).limit(PAGE_SIZE);
      if(!active||loadError)return;
      const page=await hydrateAttachmentUrls(((data??[]) as Message[]).reverse());
      if(!active)return;
      const hasOlder=page.length===PAGE_SIZE;
      messageCache.current.set(conversationId,{messages:page,hasMore:hasOlder});
      bottomAlignedConversation.current=null;setMessages(page);setHasMore(hasOlder);setLoadedConversationId(conversationId);setLoading(false);
      await refresh();
    })();
    return()=>{active=false;};
  },[conversation?.id,refresh]));
  useEffect(()=>{
    const currentRequest=pendingDialogue?.clientRequestId??null;
    const previousRequest=observedPendingRequest.current;
    observedPendingRequest.current=currentRequest;
    if(!conversation?.id||currentRequest||!previousRequest||(__DEV__&&process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE==='true'))return;
    const conversationId=conversation.id;
    let cancelled=false;
    void (async()=>{
      const{data,error:loadError}=await supabase.from('together_messages').select('*,together_conversation_attachments(*)').eq('conversation_id',conversationId).order('created_at',{ascending:false}).limit(PAGE_SIZE);
      if(cancelled||loadError)return;
      const page=await hydrateAttachmentUrls(((data??[]) as Message[]).reverse());
      if(cancelled)return;
      const hasOlder=page.length===PAGE_SIZE;
      messageCache.current.set(conversationId,{messages:page,hasMore:hasOlder});
      bottomAlignedConversation.current=null;setMessages(page);setHasMore(hasOlder);setLoadedConversationId(conversationId);setLoading(false);
      await Promise.all([refresh(),manageConversation({action:'read',conversationId}).catch(()=>undefined)]);
    })();
    return()=>{cancelled=true;};
  },[conversation?.id,pendingDialogue?.clientRequestId,refresh]);
  useEffect(()=>{autoDialogueRequest.current?.abort();autoDialogueRequest.current=null;setAutoDialogue(null);setAutoDialogueBusy(false);setShowAutoDialogueOptions(false);},[conversation?.id]);
  useEffect(()=>()=>autoDialogueRequest.current?.abort(),[]);
  const simulationStale=Boolean(character&&(Date.now()-new Date(character.last_simulated_at).getTime()>2*60000||!(snapshot?.scheduleEvents??[]).some((item)=>item.character_instance_id===character.id&&new Date(item.ends_at)>new Date())));
  useEffect(()=>{if(!character?.id||!simulationStale)return;let cancelled=false;void simulate(character.id).then(()=>cancelled?undefined:refresh()).catch(()=>undefined);return()=>{cancelled=true;};},[character?.id,refresh,simulationStale]);
  useFocusEffect(useCallback(()=>{if(!character)return;const channel=supabase.channel(`kivelle-media-${character.id}-${realtimeScopeRef.current}`).on('postgres_changes',{event:'*',schema:'public',table:'together_generated_media',filter:`character_instance_id=eq.${character.id}`},(payload)=>{const id=String((payload.new as Record<string,unknown>|null)?.id??'');if(id)void manageMedia<{media:GeneratedMedia}>({action:'status',mediaId:id}).then((result)=>upsertMedia(result.media)).catch(()=>undefined);else void refresh();}).subscribe();return()=>{void supabase.removeChannel(channel);};},[character?.id,refresh,upsertMedia]));
  useFocusEffect(useCallback(()=>{if(!conversation?.id)return;const channel=supabase.channel(`kivelle-conversation-actions-${conversation.id}-${realtimeScopeRef.current}`).on('postgres_changes',{event:'*',schema:'public',table:'together_conversation_actions',filter:`conversation_id=eq.${conversation.id}`},(payload)=>{const next=payload.new as ConversationAction|undefined,previous=payload.old as Partial<ConversationAction>|undefined,id=String(next?.id??previous?.id??'');if(next?.id&&next.status==='pending')upsertConversationAction(next);else if(id)removeConversationAction(id);}).subscribe();return()=>{void supabase.removeChannel(channel);};},[conversation?.id,removeConversationAction,upsertConversationAction]));
  useFocusEffect(useCallback(()=>{
    if(!character?.id||!conversation?.id){setMediaOffers([]);return;}
    let cancelled=false;const loadOffers=()=>fetchPendingMediaOffers(character.id,conversation.id).then((offers)=>{if(!cancelled)setMediaOffers(offers);}).catch((caught)=>{if(!cancelled)setError(caught instanceof Error?caught.message:'Photo confirmations could not be loaded.');});
    void loadOffers();const channel=supabase.channel(`kivelle-media-offers-${character.id}-${realtimeScopeRef.current}`).on('postgres_changes',{event:'*',schema:'public',table:'together_media_offers',filter:`character_instance_id=eq.${character.id}`},()=>void loadOffers()).subscribe();return()=>{cancelled=true;void supabase.removeChannel(channel);};
  },[character?.id,conversation?.id,fetchPendingMediaOffers]));
  useEffect(()=>{
    if(!reconcilingMediaId)return;
    let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
    const reconcile=async()=>{
      try{
        const result=await manageMedia<{media:GeneratedMedia}>({action:'status',mediaId:reconcilingMediaId});
        if(cancelled)return;
        upsertMedia(result.media);
        if(result.media.status==='ready'||result.media.status==='failed'){setReconcilingMediaId((current)=>current===reconcilingMediaId?null:current);return;}
      }catch{/* Realtime may still deliver the terminal update. */}
      if(!cancelled)timer=setTimeout(()=>void reconcile(),3000);
    };
    timer=setTimeout(()=>void reconcile(),1500);
    return()=>{cancelled=true;if(timer)clearTimeout(timer);};
  },[reconcilingMediaId,upsertMedia]);
  useFocusEffect(useCallback(()=>{if(!character)return;const channel=supabase.channel(`kivelle-presence-${character.id}-${realtimeScopeRef.current}`).on('postgres_changes',{event:'*',schema:'public',table:'together_character_schedule_events',filter:`character_instance_id=eq.${character.id}`},()=>void refresh()).on('postgres_changes',{event:'UPDATE',schema:'public',table:'together_character_instances',filter:`id=eq.${character.id}`},()=>void refresh()).subscribe();return()=>{void supabase.removeChannel(channel);};},[character?.id,refresh]));
  useEffect(() => {
    if(prepending.current||!conversationReady||bottomAlignedConversation.current!==conversation?.id)return;
    const timer=setTimeout(()=>scroll.current?.scrollToEnd({animated:true}),40);
    return()=>clearTimeout(timer);
  },[conversation?.id,conversationReady,feedback,mediaOffers.length,messages,stream,replyPending]);

  if (!snapshot) return <LoadingSkeleton label="Opening your conversation…" />;
  if (!character) return <ErrorState message="This conversation is not available yet." />;
  if (!conversation) return conversationBootstrapError
    ? <ErrorState message={conversationBootstrapError} onRetry={()=>setConversationBootstrapAttempt((value)=>value+1)} />
    : <LoadingSkeleton label={`Opening your conversation with ${character.together_character_templates.name}…`} />;
  const visibleMessages=scopedConversationMessages(messages,conversation.id,loadedConversationId,loading);
  const chatContext=buildClientConversationContext(snapshot,character,new Date(),conversation.id);
  const activeSharedPlan=activePlanForChat(snapshot.sharedPlans??[],character.id);
  const location = chatContext.scene.location;
  const generatedMedia=snapshot.generatedMedia??[];
  const mediaOfferPreviewUri=latestMediaOfferPreviewUri(snapshot.generatedMedia??[],character.id,conversation.id);
  const mediaOfferPreviewSource=mediaOfferPreviewUri?{uri:mediaOfferPreviewUri}:resolveCharacterPortraitSource(character.together_character_templates,character.together_character_versions,slug);
  const visibleMessageIds=new Set(visibleMessages.map((message)=>message.id));
  const orphanMediaOffers=conversationReady?photoOffersWithoutVisibleMessages(mediaOffers,visibleMessageIds):[];
  const isFavorite=(snapshot.favoriteCharacterTemplateIds??[]).includes(character.character_template_id);
  const milestone = snapshot.relationshipMilestones?.find((item) => item.character_instance_id === character.id);
  const prompts = chatContext.prompts;
  const latestPersistedMessage=[...visibleMessages].reverse().find((message)=>!message.id.startsWith('local-'));
  const latestAssistantMessage=latestPersistedMessage?.role==='assistant'&&latestPersistedMessage.delivery_status==='complete'&&latestPersistedMessage.content.trim()&&latestPersistedMessage.content!=='[Photo]'?latestPersistedMessage:null;
  currentInput.current=input;
  latestTimelineMessageId.current=latestPersistedMessage?.id??null;
  const pendingActions=conversationReady?(snapshot.conversationActions??[]).filter((item)=>item.status==='pending'&&item.character_instance_id===character.id&&item.conversation_id===conversation.id&&shouldShowPlanConversationAction(item,chatContext.scene.locationId)):[];
  const startTimelinePlan=async(plan:SharedPlan)=>{
    const availability=planActionAvailability(plan);
    if(!availability.primaryEnabled){setPlanModal({planId:plan.id});return;}
    setPlanActionBusyId(plan.id);setError('');
    try{await joinCommitment(plan.id,plan.character_instance_id);await refresh();if(Platform.OS!=='web')void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);router.push(`/plan-live?planId=${plan.id}` as never);}
    catch(caught){setError(caught instanceof Error?caught.message:'The plan could not be started.');setPlanModal({planId:plan.id});}
    finally{setPlanActionBusyId(null);}
  };
  const openPlanPicker=()=>{setPendingActionId(null);setInitialPlanTimingChoice(null);setSwitchPlanId(activeSharedPlan?.source==='date'?null:activeSharedPlan?.id??null);setShowPlans(true);};
  const requestEndPlan=(plan:SharedPlan)=>{if(!planActionAvailability(plan).canEnd)return;setPlanEndTarget(plan);setError('');};
  const confirmEndPlan=async()=>{const plan=planEndTarget;if(!plan||planActionBusyId)return;setPlanActionBusyId(plan.id);setError('');try{await endPlanExperience(plan.id,character.id,interactionScene?.id);setPlanEndTarget(null);setFocusPlanId(null);setFocusDismissed(true);setInteractionScene(null);setInteractionCandidates([]);setMovementCandidates([]);await refresh();if(Platform.OS!=='web')void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);}catch(caught){setError(caught instanceof Error?caught.message:'The plan could not be ended.');}finally{setPlanActionBusyId(null);}};
  const stageManualInput=(value:string)=>{autoDialogueRequest.current?.abort();autoDialogueRequest.current=null;setAutoDialogueBusy(false);setAutoDialogue(null);setInput(value);currentInput.current=value;setTimeout(()=>composerInput.current?.focus(),20);};
  const changeComposerInput=(value:string)=>{if(autoDialogueRequest.current){autoDialogueRequest.current.abort();autoDialogueRequest.current=null;setAutoDialogueBusy(false);}if(!value.trim())setAutoDialogue(null);setInput(value);currentInput.current=value;};
  const clearAutoDialogue=()=>{autoDialogueRequest.current?.abort();autoDialogueRequest.current=null;setAutoDialogueBusy(false);setAutoDialogue(null);setInput('');currentInput.current='';setTimeout(()=>composerInput.current?.focus(),20);};
  const openAutoDialogueOptions=()=>setShowAutoDialogueOptions(true);
  const requestAutoDialogue=async(preference:AutoDialoguePreference='natural')=>{
    if(!latestAssistantMessage||milestone||replyPending||autoDialogueBusy||pendingImage)return;
    setShowAutoDialogueOptions(false);
    const anchorId=latestAssistantMessage.id,replacedText=autoDialogue?.text??'';
    if(currentInput.current.trim()&&currentInput.current!==replacedText)return;
    autoDialogueRequest.current?.abort();const controller=new AbortController();autoDialogueRequest.current=controller;setAutoDialogueBusy(true);setError('');
    try{
      const suggestion=await suggestDialogue({conversationId:conversation.id,characterInstanceId:character.id,anchorMessageId:anchorId,clientRequestId:createClientRequestId(),preference},controller.signal);
      if(controller.signal.aborted||latestTimelineMessageId.current!==anchorId)return;
      if(currentInput.current.trim()&&currentInput.current!==replacedText)return;
      setAutoDialogue(suggestion);setInput(suggestion.text);currentInput.current=suggestion.text;setTimeout(()=>composerInput.current?.focus(),20);
      if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }catch(caught){
      if(controller.signal.aborted||(caught instanceof Error&&caught.name==='AbortError'))return;
      if(latestTimelineMessageId.current!==anchorId)return;
      if(caught instanceof ApiError&&['STALE_SUGGESTION','CANONICAL_CHOICE_REQUIRED'].includes(caught.code)){setError(caught.message);return;}
      const fallback=prompts[0];
      if(fallback){const suggestion:AutoDialogueSuggestion={suggestionId:`client-${Date.now()}`,text:fallback,source:'client_fallback',intent:'curious',preference,anchorMessageId:anchorId,expiresAt:new Date(Date.now()+2*60_000).toISOString()};setAutoDialogue(suggestion);setInput(fallback);currentInput.current=fallback;setTimeout(()=>composerInput.current?.focus(),20);}
      else setError(caught instanceof Error?caught.message:'A reply suggestion could not be generated.');
    }finally{if(autoDialogueRequest.current===controller){autoDialogueRequest.current=null;setAutoDialogueBusy(false);}}
  };
  const acceptOffer=async(offer:MediaOffer)=>{setMediaOfferBusy(offer.id);try{const result=await manageMedia<{state:'accepted'|'needs_credits'|'expired';offer:MediaOffer;media?:GeneratedMedia;creditBalance:number;required?:number}>({action:'accept_offer',offerId:offer.id,requestId:createClientRequestId()});if(result.state==='needs_credits'){Alert.alert('More credits needed',`You need ${result.required??offer.credit_cost} credits for this photo. Current balance: ${result.creditBalance}.`,[{text:'Not now',style:'cancel'},{text:'Buy Credits',onPress:()=>router.push('/subscription')}]);return;}if(result.state==='expired'){setMediaOffers((current)=>current.filter((item)=>item.id!==offer.id));setError('That photo moment has passed.');return;}setMediaOffers((current)=>current.map((item)=>item.id===offer.id?result.offer:item));if(result.media){upsertMedia(result.media);setReconcilingMediaId(result.media.id);}}catch(caught){setError(caught instanceof Error?caught.message:'The photo could not be prepared.');}finally{setMediaOfferBusy(null);}};
  const declineOffer=async(offer:MediaOffer)=>{setMediaOfferBusy(offer.id);try{await manageMedia({action:'decline_offer',offerId:offer.id});setMediaOffers((current)=>current.filter((item)=>item.id!==offer.id));}catch(caught){setError(caught instanceof Error?caught.message:'The offer could not be dismissed.');}finally{setMediaOfferBusy(null);}};
  const finishVoiceNotePrompt=(decision:{hideFuture:boolean}|null)=>{const resolve=voiceNotePromptResolver.current;voiceNotePromptResolver.current=null;if(!decision)setVoiceNotePrompt(null);resolve?.(decision);};
  const requestVoiceWithConfirmation=async(messageId:string,name:string):Promise<VoiceNoteRequestResult|null>=>{
    if(await isVoiceNoteConfirmationHidden())return requestVoiceNote(messageId,createClientRequestId());
    const quote=await quoteVoiceNote(messageId);
    if(!quote.generationRequired)return requestVoiceNote(messageId,createClientRequestId());
    if(voiceNotePromptResolver.current)return null;
    const decision=await new Promise<{hideFuture:boolean}|null>((resolve)=>{voiceNotePromptResolver.current=resolve;setVoiceNotePrompt({messageId,name,creditCost:quote.creditCost,creditBalance:quote.creditBalance});});
    if(!decision)return null;
    setVoiceNotePromptBusy(true);
    try{if(decision.hideFuture)await hideVoiceNoteConfirmation().catch(()=>undefined);return await requestVoiceNote(messageId,createClientRequestId());}
    finally{setVoiceNotePromptBusy(false);setVoiceNotePrompt(null);}
  };
  useEffect(()=>()=>{voiceNotePromptResolver.current?.(null);voiceNotePromptResolver.current=null;},[]);

  const send = async (retryText?: string) => {
    const draft = retryText ?? input;
    if (draft.length > MESSAGE_CHARACTER_LIMIT) { setError(messageCharacterLimitError()); return; }
    const text = draft.trim(); if ((!text&&!pendingImage) || replyPending) return;
    const sentAutoDialogue=!retryText?autoDialogue:null;
    autoDialogueRequest.current?.abort();autoDialogueRequest.current=null;setAutoDialogue(null);setAutoDialogueBusy(false);currentInput.current='';
    const before = useTogether.getState().snapshot;
    const expectsPhotoOffer=shouldShowPhotoGenerationPending(text);
    if(expectsPhotoOffer)setAwaitingPhotoOffer(true);
    const selectedImage=pendingImage;setInput(''); setError(''); setSending(true); setStream(''); setFeedback(null);
    let preparedAttachmentId:string|undefined;let sentAttachment:ConversationAttachment|undefined;let sceneActionId:string|undefined;
    const optimistic: Message = { id: `local-${Date.now()}`, conversation_id: conversation.id, role: 'user', content: text||'[Photo]', delivery_status: 'pending', created_at: new Date().toISOString(),attachments:selectedImage?[pendingImageAttachment(selectedImage,conversation.id)]:[] };
    const clientRequestId=createClientRequestId();
    beginPendingDialogue({conversationId:conversation.id,characterInstanceId:character.id,clientRequestId,startedAt:new Date().toISOString(),showTyping:!expectsPhotoOffer});
    setMessages((current) => [...current, optimistic]);
    try {
      if(selectedImage){const prepared=await prepareUserImage({conversationId:conversation.id,characterInstanceId:character.id,mimeType:selectedImage.mimeType,byteSize:selectedImage.byteSize,width:selectedImage.width,height:selectedImage.height,requestId:createClientRequestId()});preparedAttachmentId=prepared.attachment.id;const blob=await fetch(selectedImage.uri).then((response)=>response.blob());const{error:uploadError}=await supabase.storage.from(prepared.upload.bucket).upload(prepared.upload.path,blob,{contentType:selectedImage.mimeType,upsert:false});if(uploadError)throw new Error('That photo could not be uploaded.');const confirmed=await confirmUserImage(prepared.attachment.id);sentAttachment={...confirmed.attachment,signed_url:selectedImage.uri};}
      // A clear free-text action is matched only against the server's current
      // scene candidates, then executed before the dialogue context is built.
      // This gives the normal companion response the real scene change to
      // react to, while questions and vague ideas remain ordinary chat.
      if(isCoPresent){
        try{
          const sceneResult=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[];intentMatch?:InteractionCandidate;characterProposal?:CharacterInteractionProposal}>({action:'resolve',characterInstanceId:character.id,conversationId:conversation.id,intentText:text});
          setInteractionScene(sceneResult.scene?.id?sceneResult.scene:null);
          setInteractionCandidates(sceneResult.interactions??[]);
          setMovementCandidates(sceneResult.destinations??[]);
          setCharacterProposal(sceneResult.characterProposal??null);
          if(sceneResult.intentMatch){const sceneAction=await executeInteraction(sceneResult.intentMatch,'defer_to_current_message');sceneActionId=sceneAction?.id;}
        }catch{/* The sent message is still valid if the scene changed. */}
      }
      const result = await sendDialogue({ conversationId: conversation.id, characterInstanceId: character.id, message: text,attachmentIds:preparedAttachmentId?[preparedAttachmentId]:[], clientRequestId,focusPlanId:focusPlanId??undefined,...(sceneActionId?{sceneActionId}:{}),...(sentAutoDialogue?{autoDialogueSuggestionId:sentAutoDialogue.suggestionId,autoDialogueSuggestionSource:sentAutoDialogue.source,autoDialogueSuggestionEdited:text!==sentAutoDialogue.text.trim(),autoDialogueSuggestionIntent:sentAutoDialogue.intent,autoDialogueSuggestionPreference:sentAutoDialogue.preference}:{}) }, (token) => setStream((current) => current + token));
      if(expectsPhotoOffer)setAwaitingPhotoOffer(false);
      setPendingImage(null);setStream(''); setMessages((current) => [...current.filter((item) => item.id !== optimistic.id), { ...optimistic, delivery_status: 'complete',attachments:sentAttachment?[sentAttachment]:optimistic.attachments }, result.message,...(result.additionalMessages??[])]);
      if(result.generatedMedia){upsertMedia(result.generatedMedia);setReconcilingMediaId(result.generatedMedia.id);}
      if(result.mediaOffer)setMediaOffers((current)=>[result.mediaOffer!,...current.filter((item)=>item.id!==result.mediaOffer!.id)]);
      if(result.photoRequestError)setError(result.photoRequestError.message);
      if(expectsPhotoOffer&&!result.photoRequestError){
        try{const offers=await fetchPendingMediaOffers(character.id,conversation.id);setMediaOffers(offers);if(!offers.length&&!result.mediaOffer)setError('The photo confirmation did not appear. Please try the request again.');}
        catch(caught){if(!result.mediaOffer)setError(caught instanceof Error?caught.message:'The photo confirmation could not be loaded.');}
      }
      if(result.delta)applyServerDelta(result.delta);
      showNewStoryFeedback(before, useTogether.getState().snapshot, character.id, character.together_character_templates.name, setFeedback);
    } catch (caught) {
      const recovered=dialogueFailureMayHavePersisted(caught)?await recoverInterruptedDialogue(conversation.id,optimistic,clientRequestId):false;
      if(recovered){setPendingImage(null);setStream('');setError('');return;}
      if(preparedAttachmentId)void removePendingAttachment(preparedAttachmentId).catch(()=>undefined);
      setStream(''); setError(caught instanceof Error ? caught.message : 'The reply was interrupted.');
      if(caught instanceof ApiError&&caught.code==='CONVERSATION_ARCHIVED')await refresh();
      setMessages((current) => current.map((item) => item.id === optimistic.id ? { ...item, delivery_status: 'failed' } : item));
    } finally { finishPendingDialogue(conversation.id,clientRequestId);setSending(false);if(expectsPhotoOffer)setAwaitingPhotoOffer(false); }
  };

  const openCreatedPlan=async(result:PlanMutationResult|undefined,timing:PlanTimingSelection)=>{
    if(timing.choice!=='now'||!result?.commitment.id)return;
    if(result.kind==='date'){router.push(`/date/${result.commitment.id}` as never);return;}
    if(result.experience){router.push(`/plan-live?planId=${result.commitment.id}` as never);return;}
    try{await joinCommitment(result.commitment.id,character.id);await refresh();router.push(`/plan-live?planId=${result.commitment.id}` as never);}
    catch(caught){setError(`The plan was saved, but Together Now could not open: ${caught instanceof Error?caught.message:'try joining it from the plan details.'}`);router.push(`/plan/${result.commitment.id}` as never);}
  };
  const plan = async (option:PlanOption,timing:PlanTimingSelection) => {
    setPlanning(true); setError('');
    try {
      const timingInput=timing.choice==='custom'?{timingChoice:'custom' as const,startsAt:timing.startsAt}:{timingChoice:timing.choice};
      if(switchPlanId){if(timing.choice!=='now')throw new Error('Choose Switch Now to replace the active plan.');await switchPlanExperience<PlanMutationResult>({currentPlanId:switchPlanId,characterInstanceId:character.id,activityKey:option.activityKey,locationId:option.locationId,sourceConversationId:conversation.id,sceneId:interactionScene?.id,requestId:planRequestIdRef.current});planRequestIdRef.current=createClientRequestId();setSwitchPlanId(null);setFocusPlanId(null);setFocusDismissed(true);setInteractionScene(null);setInteractionCandidates([]);setMovementCandidates([]);await refresh();setShowPlans(false);}
      else if(pendingActionId){const result=await confirmConversationAction<ConversationActionMutation>(pendingActionId,{activityKey:option.activityKey,locationId:option.locationId,...timingInput});removeConversationAction(pendingActionId);await refresh();setPendingActionId(null);setInitialPlanTimingChoice(null);setShowPlans(false);await openCreatedPlan(result.result,timing);}
      else{const result=await createSharedPlan<PlanMutationResult>({activityKey:option.activityKey,locationId:option.locationId,characterInstanceId:character.id,...timingInput,requestId:planRequestIdRef.current,source:params.location?'location':'manual_planner',sourceConversationId:conversation.id});planRequestIdRef.current=createClientRequestId();await refresh();setInitialPlanTimingChoice(null);setShowPlans(false);await openCreatedPlan(result,timing);}
      if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The plan could not be saved.'); }
    finally { setPlanning(false); }
  };
  const undoMemory = async () => { if (!feedback?.id) return; await mutateMemory({ action:'forget', memoryId:feedback.id }); await refresh(); setFeedback(null); };
  const applySceneDelta = (scene:SceneSession|null|undefined) => {
    if(!scene?.id)return;
    upsertSceneSession(scene);
    updateCompanion({...character,current_location_id:scene.location_id,current_activity:sceneActivityLabel(scene),current_interruptibility:'open',current_presence_source:'scene'});
  };
  const executeInteraction = async (candidate:InteractionCandidate,reactionMode:'generate'|'defer_to_current_message'='generate') => {
    if(interactionLoading)return;setInteractionLoading(true);setError('');
    try{const result=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[];action?:SceneAction;characterProposal?:CharacterInteractionProposal}>({action:'execute',characterInstanceId:character.id,conversationId:conversation.id,sceneId:interactionScene?.id,interactionKey:candidate.interactionKey,requestId:createClientRequestId()});setInteractionScene(result.scene?.id?result.scene:null);applySceneDelta(result.scene);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);setCharacterProposal(result.characterProposal??null);setLastInteraction(interactionFeedback(result.action,candidate.label));setShowInteractions(false);if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);if(reactionMode==='generate'&&result.action?.id){await generateSceneReaction(result.action.id);}return result.action;}catch(caught){setError(caught instanceof Error?caught.message:'That option is no longer available.');return undefined;}finally{setInteractionLoading(false);}
  };
  const generateSceneReaction=async(actionId:string)=>{if(replyPending)return;const clientRequestId=createClientRequestId();beginPendingDialogue({conversationId:conversation.id,characterInstanceId:character.id,clientRequestId,startedAt:new Date().toISOString(),showTyping:true});setSending(true);setStream('');try{const reaction=await sendSceneReaction({conversationId:conversation.id,characterInstanceId:character.id,sceneActionId:actionId,clientRequestId},(token)=>setStream((current)=>current+token));setStream('');setMessages((current)=>[...current,reaction.message]);}catch(caught){setStream('');setError(caught instanceof Error?caught.message:'The scene changed, but the reaction was interrupted.');}finally{finishPendingDialogue(conversation.id,clientRequestId);setSending(false);}};
  const acceptCharacterProposal=async()=>{if(!characterProposal||interactionLoading)return;setInteractionLoading(true);setError('');try{const result=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[];action?:SceneAction;characterProposal?:CharacterInteractionProposal}>({action:'accept_proposal',characterInstanceId:character.id,conversationId:conversation.id,sceneId:interactionScene?.id,proposalActionId:characterProposal.actionId,requestId:createClientRequestId()});setInteractionScene(result.scene?.id?result.scene:null);applySceneDelta(result.scene);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);setCharacterProposal(result.characterProposal??null);setLastInteraction({label:characterProposal.label,status:'accepted'});if(result.action?.id)await generateSceneReaction(result.action.id);}catch(caught){setError(caught instanceof Error?caught.message:'That suggestion is no longer available.');setCharacterProposal(null);}finally{setInteractionLoading(false);}};
  const dismissCharacterProposal=async()=>{if(!characterProposal||interactionLoading)return;setInteractionLoading(true);setError('');try{const result=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[]}>({action:'dismiss_proposal',characterInstanceId:character.id,conversationId:conversation.id,sceneId:interactionScene?.id,proposalActionId:characterProposal.actionId});setInteractionScene(result.scene?.id?result.scene:null);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);setCharacterProposal(null);}catch(caught){setError(caught instanceof Error?caught.message:'That suggestion could not be dismissed.');}finally{setInteractionLoading(false);}};
  const moveScene = async (candidate:InteractionCandidate) => {
    const destinationId=typeof candidate.effects.destinationLocationId==='string'?candidate.effects.destinationLocationId:null;if(!destinationId)return;
    if(interactionLoading)return;setInteractionLoading(true);setError('');
    try{const result=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[]}>({action:'move',characterInstanceId:character.id,conversationId:conversation.id,sceneId:interactionScene?.id,destinationLocationId:destinationId,requestId:createClientRequestId()});setInteractionScene(result.scene?.id?result.scene:null);applySceneDelta(result.scene);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);setCharacterProposal(null);setLastInteraction({label:candidate.label,status:'accepted'});setShowInteractions(false);if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);}catch(caught){setError(caught instanceof Error?caught.message:'That place is no longer available right now.');}finally{setInteractionLoading(false);}
  };
  const addSceneParticipant=async(person:SharedSceneCharacter)=>{
    const sceneId=sharedSceneRoster?.scene?.id;if(!sceneId)return;
    setInteractionLoading(true);setError('');
    try{await manageSharedScene({action:'join',sceneId,characterInstanceId:person.id});const roster=await manageSharedScene<SharedSceneRoster>({action:'available',conversationId:conversation.id});setSharedSceneRoster(roster);}
    catch(caught){setError(caught instanceof Error?caught.message:`${person.together_character_templates.name} is no longer here.`);}
    finally{setInteractionLoading(false);}
  };
  const resolveMilestone = async (action:RelationshipMilestone['choices'][number]['id']) => { if(!milestone||resolvingMilestone)return;setResolvingMilestone(true);setError('');try{const result=await resolveRelationshipMilestone(milestone.id,action);setSnapshot(result.snapshot);if(milestone.kind==='first_date_invitation'&&action==='accept')setFeedback({kind:'moment',title:`${milestone.title} unlocked`,body:'Your shared experience is ready in Dates.'});}catch(caught){setError(caught instanceof Error?caught.message:'That choice could not be saved.');}finally{setResolvingMilestone(false);} };
  const startNewConversation=()=>confirmAction({title:'Start a fresh chat?',message:`This creates a clean transcript with ${character.together_character_templates.name}. Your memories, plans, relationship, and relationship day will continue; use "Start over" in Conversation settings to erase them.`,confirmLabel:'Start fresh chat',onConfirm:async()=>{try{await manageConversation({action:'new',characterInstanceId:character.id});setMessages([]);setShowConversationMenu(false);await refresh();}catch(caught){setError(caught instanceof Error?caught.message:'A new conversation could not be started.');}}});
  const deleteConversation=()=>confirmAction({title:'Delete this conversation?',message:`It will disappear from Messages and conversation history, but you can restore it from Settings → Archived Chats for 30 days.\n\n${character.together_character_templates.name} will still remember saved memories, and your relationship, Moments, and shared photos will remain.`,confirmLabel:'Delete conversation',destructive:true,onConfirm:async()=>{try{const archived=await manageConversation<Snapshot['conversations'][number]>({action:'delete',conversationId:conversation.id});setMessages([]);setShowConversationMenu(false);await refresh();const latest=useTogether.getState().snapshot;if(latest)useTogether.getState().setCoreState({conversations:latest.conversations.map((item)=>item.id===archived.id?archived:item)});router.replace('/(tabs)/chat-tab');}catch(caught){setError(caught instanceof Error?caught.message:'The conversation could not be archived.');}}});
  const toggleFavorite=async()=>{if(favoriteBusy)return;const previous=snapshot.favoriteCharacterTemplateIds??[],next=isFavorite?previous.filter((id)=>id!==character.character_template_id):[...new Set([...previous,character.character_template_id])];setFavoriteBusy(true);setCoreState({favoriteCharacterTemplateIds:next});try{const result=await setCharacterFavorite(character.character_template_id,!isFavorite,'chat_menu');setCoreState({favoriteCharacterTemplateIds:result.favoriteCharacterTemplateIds});}catch(caught){setCoreState({favoriteCharacterTemplateIds:previous});setError(caught instanceof Error?caught.message:'That favorite could not be saved.');}finally{setFavoriteBusy(false);}};
  const messageTypography=chatMessageTypography(conversation);
  const choosePhoto=async(source:'camera'|'library')=>{try{if(source==='camera'){const permission=await ImagePicker.requestCameraPermissionsAsync();if(!permission.granted){setError('Camera access is needed to take a photo.');return;}}else{const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();if(!permission.granted){setError('Photo access is needed to choose a photo.');return;}}const result=source==='camera'?await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:.9}):await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:.9,allowsMultipleSelection:false});if(result.canceled||!result.assets[0])return;const asset=result.assets[0],mimeType=normalizeImageMime(asset.mimeType,asset.fileName);if(!mimeType){setError('Choose a JPEG, PNG, or WebP image.');return;}const byteSize=asset.fileSize??(await fetch(asset.uri).then((response)=>response.blob())).size;if(byteSize>10*1024*1024){setError('Choose an image smaller than 10 MB.');return;}setPendingImage({uri:asset.uri,mimeType,byteSize,width:asset.width,height:asset.height,fileName:asset.fileName});setError('');}catch(caught){setError(caught instanceof Error?caught.message:'That photo could not be opened.');}};
  const openPhotoPicker=()=>Alert.alert('Share a photo','Choose how you want to add it.',[{text:'Take Photo',onPress:()=>void choosePhoto('camera')},{text:'Choose Photo',onPress:()=>void choosePhoto('library')},{text:'Cancel',style:'cancel'}]);

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.shell}>
      {showLeft ? <LeftRail snapshot={snapshot} active={slug} /> : null}
      <View style={styles.conversation}>
        <ChatAmbientGlow compact={width < 720} />
        <ChatHeader character={character} location={location} backToInbox={!showLeft} onCall={()=>router.push(`/call?character=${character.id}&conversation=${conversation.id}` as never)} onMenu={()=>setShowConversationMenu((value)=>!value)} />
        {!showRight&&chatContext.nextCommitment?<Pressable onPress={()=>chatContext.nextCommitment?.kind==='plan'&&router.push(`/plan/${chatContext.nextCommitment.id}` as never)} style={styles.mobileCommitment}><CalendarDays size={14} color={colors.rose}/><Text style={styles.mobileCommitmentText} numberOfLines={1}>{new Date(chatContext.nextCommitment.startsAt).toLocaleDateString([],{weekday:'short'})} · {chatContext.nextCommitment.title}</Text><ChevronRight size={14} color={colors.muted}/></Pressable>:null}
        {showConversationMenu ? <ConversationMenu name={character.together_character_templates.name} planLabel={activeSharedPlan?'Change plan':'Plan something'} favorite={isFavorite} favoriteBusy={favoriteBusy} onClose={()=>setShowConversationMenu(false)} actions={{favorite:toggleFavorite,profile:()=>router.push(`/character/${slug}` as never),plan:()=>{openPlanPicker();setShowConversationMenu(false);},edit:()=>{setShowConversationMenu(false);setShowChatSettings(true);},start:startNewConversation,remove:deleteConversation}} /> : null}
        <ChatSettingsModal visible={showChatSettings} conversation={conversation} character={character} onClose={()=>setShowChatSettings(false)} onHistory={()=>router.push(`/conversations/${character.id}` as never)} onMemories={()=>router.push(`/memories?character=${slug}` as never)} onAdvanced={()=>router.push(`/conversation-controls?character=${encodeURIComponent(character.id)}` as never)} />
        <VoiceNotePurchaseModal visible={Boolean(voiceNotePrompt)} name={voiceNotePrompt?.name??character.together_character_templates.name} creditCost={voiceNotePrompt?.creditCost??0} creditBalance={voiceNotePrompt?.creditBalance??0} busy={voiceNotePromptBusy} onClose={()=>finishVoiceNotePrompt(null)} onConfirm={(hideFuture)=>finishVoiceNotePrompt({hideFuture})} onBuyCredits={()=>{finishVoiceNotePrompt(null);router.push('/subscription');}}/>
        <PhotoRequestModal visible={showPhotoRequests} name={character.together_character_templates.name} onRequest={(request)=>{setShowPhotoRequests(false);void send(request);}} onShare={()=>{setShowPhotoRequests(false);openPhotoPicker();}} onClose={()=>setShowPhotoRequests(false)}/>
        <AutoDialogueOptionsModal visible={showAutoDialogueOptions} name={character.together_character_templates.name} hasSuggestion={Boolean(autoDialogue)} onChoose={(preference)=>void requestAutoDialogue(preference)} onClose={()=>setShowAutoDialogueOptions(false)}/>
        <PlanDetailsModal visible={Boolean(planModal)} planId={planModal?.planId??null} confirmCancel={planModal?.confirmCancel} onClose={()=>setPlanModal(null)}/>
        <EndPlanConfirmation visible={Boolean(planEndTarget)} plan={planEndTarget} busy={Boolean(planEndTarget&&planActionBusyId===planEndTarget.id)} onClose={()=>{if(!planActionBusyId)setPlanEndTarget(null);}} onConfirm={()=>void confirmEndPlan()}/>
        {showPlans ? <ScrollView style={styles.planScroll} contentContainerStyle={styles.planScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <PlanSelection snapshot={snapshot} character={character} scopedLocationId={resolveScopedLocation(snapshot,params.location,params.world,pendingActions.find((item)=>item.id===pendingActionId),params.repeatPlanId)} currentLocationId={chatContext.scene.locationId} initialActivityKey={params.activity} repeatPlanId={params.repeatPlanId} proposal={pendingActions.find((item)=>item.id===pendingActionId)} initialTimingChoice={switchPlanId?'now':initialPlanTimingChoice??undefined} mode={switchPlanId?'switch':'create'} currentPlan={switchPlanId?(snapshot.sharedPlans??[]).find((item)=>item.id===switchPlanId)??null:null} interests={[...(snapshot.profile?.interests??[]),...snapshot.memories.filter((item)=>item.character_instance_id===character.id&&item.memory_type==='preference').map((item)=>item.canonical_text)]} busy={planning} error={error} onPlan={(option,timing) => void plan(option,timing)} onClose={() => {setShowPlans(false);setPendingActionId(null);setSwitchPlanId(null);setInitialPlanTimingChoice(null);}} />
        </ScrollView> : <ScrollView ref={scroll} style={styles.messageScroll} contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled" scrollEventThrottle={80} onScroll={(event)=>{if(bottomAlignedConversation.current===conversation.id&&event.nativeEvent.contentOffset.y<80)void loadOlder();}} onContentSizeChange={(_,height)=>{contentHeight.current=height;if(prepending.current){scroll.current?.scrollTo({y:Math.max(0,height-previousHeight.current),animated:false});prepending.current=false;return;}if(conversationReady&&bottomAlignedConversation.current!==conversation.id){scroll.current?.scrollToEnd({animated:false});bottomAlignedConversation.current=conversation.id;}}}>
          {loadingOlder?<Text style={styles.olderLoading}>Loading earlier messages…</Text>:conversationReady&&!hasMore&&visibleMessages.length?<Text style={styles.historyStart}>Beginning of this conversation</Text>:null}
          <SceneCard character={character} context={chatContext} snapshot={snapshot} roster={sharedSceneRoster} />
          {isCoPresent&&sharedSceneRoster?.availableCharacters.length?<SharedSceneInvite people={sharedSceneRoster.availableCharacters} busy={interactionLoading} onJoin={(person)=>void addSceneParticipant(person)}/>:null}
          {!conversationReady?<ConversationHistoryLoading name={character.together_character_templates.name}/>:visibleMessages.length===0?<EmptyConversation character={character} prompts={prompts} onPrompt={stageManualInput} />:null}
          {mergeChatTimeline(visibleMessages,pendingActions,(snapshot.conversationEvents??[]).filter((event)=>event.conversation_id===conversation.id&&shouldShowPlanTimelineEvent(event)),conversation.last_read_at).map((item,index,timeline)=>item.kind==='separator'?<Text key={item.key} style={[styles.day,item.label==='NEW'&&{color:colors.rose}]}>{item.label}</Text>:item.kind==='message'?<MessageBubble key={item.value.id} message={item.value} character={character} media={generatedMedia.filter((media)=>media.message_id===item.value.id)} photoOffer={photoOfferForMessage(mediaOffers,item.value.id)} photoPreviewSource={mediaOfferPreviewSource} photoOfferBusy={mediaOfferBusy===photoOfferForMessage(mediaOffers,item.value.id)?.id} grouped={index>0&&timeline[index-1]?.kind==='message'&&(timeline[index-1] as {kind:'message';value:Message}).value.role===item.value.role} textStyle={messageTypography} voiceVisible={snapshot.profile?.multimodal_preferences?.companionVoiceNotes!==false} voiceEnabled={snapshot.experienceCapabilities?.voiceNotes!==false} activeVoiceNoteId={activeVoiceNoteId} onVoiceActivate={setActiveVoiceNoteId} onVoiceRequest={requestVoiceWithConfirmation} onPhotoOfferAccept={(offer)=>void acceptOffer(offer)} onPhotoOfferDecline={(offer)=>void declineOffer(offer)} onMediaRetry={async(mediaId)=>{const result=await manageMedia<{media:GeneratedMedia}>({action:'retry',mediaId});upsertMedia(result.media);setReconcilingMediaId(result.media.id);}}/>:item.kind==='voice_call'?<VoiceCallEventRow key={item.value.id} value={item.value}/>:item.kind==='action'?<ConversationActionCard key={item.value.id} action={item.value} busy={planning} onConfirm={async(planId)=>{const proposed=typeof item.value.payload.proposedStartsAt==='string'?item.value.payload.proposedStartsAt:null,validProposed=Boolean(proposed&&new Date(proposed).getTime()>=Date.now()+10*60000),direct=['plan_cancel','cancel_plan'].includes(item.value.candidate_type)||validProposed||Boolean(planId);if(!direct){setPendingActionId(item.value.id);setSwitchPlanId(null);setShowPlans(true);return;}setPlanning(true);try{await confirmConversationAction(item.value.id,{planId,startsAt:validProposed?proposed??undefined:undefined});await refresh();}catch(caught){setError(caught instanceof Error?caught.message:'That action could not be completed.');}finally{setPlanning(false);}}} onChange={()=>{setPendingActionId(item.value.id);setSwitchPlanId(null);setShowPlans(true);}} onDismiss={()=>{const action=item.value;removeConversationAction(action.id);void dismissConversationAction(action.id).catch((caught)=>{upsertConversationAction(action);setError(caught instanceof Error?caught.message:'That suggestion could not be dismissed.');});}}/>:<PlanTimelineCard key={item.value.id} event={item.value} plan={(snapshot.sharedPlans??[]).find((plan)=>plan.id===item.value.entity_id)} locationName={snapshot.locations.find((location)=>location.id===(snapshot.sharedPlans??[]).find((plan)=>plan.id===item.value.entity_id)?.location_id)?.name} busy={planActionBusyId===item.value.entity_id} onOpen={(plan)=>setPlanModal({planId:plan.id})} onStart={(plan)=>void startTimelinePlan(plan)} onEnd={requestEndPlan} onCancel={(plan)=>setPlanModal({planId:plan.id,confirmCancel:true})}/>) }
          {orphanMediaOffers.map((offer)=><ChatPhotoRequestCard key={offer.id} offer={offer} media={generatedMedia.find((item)=>item.id===offer.generated_media_id)} previewSource={mediaOfferPreviewSource} busy={mediaOfferBusy===offer.id} onAccept={()=>void acceptOffer(offer)} onDecline={()=>void declineOffer(offer)} onBuyCredits={()=>router.push('/subscription')} onRetry={offer.generated_media_id?()=>{void manageMedia<{media:GeneratedMedia}>({action:'retry',mediaId:String(offer.generated_media_id)}).then((result)=>{upsertMedia(result.media);setReconcilingMediaId(result.media.id);});}:undefined}/>) }
          {awaitingPhotoOffer?<ChatPhotoRequestCard previewSource={mediaOfferPreviewSource} preparing busy={false} onAccept={()=>undefined} onDecline={()=>undefined} onBuyCredits={()=>router.push('/subscription')}/>:null}
          {stream ? <StreamingBubble character={character} content={stream} textStyle={messageTypography} /> : null}
          {replyPending && !stream && !awaitingPhotoOffer && pendingDialogue?.showTyping!==false ? <TypingState name={character.together_character_templates.name} /> : null}
          {milestone ? <RelationshipMomentCard milestone={milestone} busy={resolvingMilestone} onChoose={(action)=>void resolveMilestone(action)} /> : null}
          {characterProposal?<CharacterProposalCard name={character.together_character_templates.name} proposal={characterProposal} busy={interactionLoading} onAccept={()=>void acceptCharacterProposal()} onDismiss={()=>void dismissCharacterProposal()}/>:null}
          {lastInteraction?<SceneActionFeedback feedback={lastInteraction} name={character.together_character_templates.name} onDismiss={()=>setLastInteraction(null)} />:null}
          {feedback ? <StoryFeedback feedback={feedback} onView={() => router.push(feedback.kind === 'memory' ? '/memories' : feedback.kind==='plan'? '/(tabs)/dates':'/moments')} onUndo={feedback.kind === 'memory' ? () => void undoMemory() : undefined} onDismiss={() => setFeedback(null)} /> : null}
          {error ? <Pressable onPress={() => { const failed = [...visibleMessages].reverse().find((item) => item.delivery_status === 'failed'); if (failed) void send(failed.content); }} style={styles.retry}><Text style={styles.retryText}>{error}{visibleMessages.some((item) => item.delivery_status === 'failed') ? ' Tap to retry.' : ''}</Text></Pressable> : null}
        </ScrollView>}
        {showInteractions?<InteractionTray name={character.together_character_templates.name} location={location} loading={interactionLoading} interactions={interactionCandidates} destinations={movementCandidates} onInteraction={(candidate)=>void executeInteraction(candidate)} onMove={(candidate)=>void moveScene(candidate)} onClose={()=>setShowInteractions(false)} />:isCoPresent&&interactionCandidates.length?<ContextualInteractionTray loading={interactionLoading} interactions={interactionCandidates.slice(0,3)} onOpen={()=>setShowInteractions(true)} onInteraction={(candidate)=>void executeInteraction(candidate)} />:null}
        {activeSharedPlan?<ActivePlanBar plan={activeSharedPlan} locationName={snapshot.locations.find((item)=>item.id===activeSharedPlan.location_id)?.name} busy={planActionBusyId===activeSharedPlan.id||planning} onContinue={()=>router.push(`/plan-live?planId=${activeSharedPlan.id}` as never)} onChange={()=>{setSwitchPlanId(activeSharedPlan.id);setPendingActionId(null);setInitialPlanTimingChoice(null);setShowPlans(true);}} onEnd={()=>requestEndPlan(activeSharedPlan)} onDetails={()=>setPlanModal({planId:activeSharedPlan.id})}/>:null}
        {focusPlanId&&focusPlanId!==activeSharedPlan?.id?<PlanFocusChip plan={(snapshot.sharedPlans??[]).find((item)=>item.id===focusPlanId)} onOpen={(id)=>router.push(`/plan/${id}` as never)} onClose={()=>{setFocusPlanId(null);setFocusDismissed(true);}}/>:null}
        <Composer inputRef={composerInput} conversationId={conversation.id} character={character} input={input} onChangeInput={changeComposerInput} onDictation={(text)=>stageManualInput(mergeDictationTranscript(currentInput.current,text))} onDictationError={setError} onDictationStart={()=>setActiveVoiceNoteId(null)} pendingImage={pendingImage} onAddPhoto={openPhotoPicker} onRemovePhoto={()=>setPendingImage(null)} sending={replyPending||!conversationReady} onSend={() => void send()} onPhoto={()=>setShowPhotoRequests((value)=>!value)} autoDialogue={autoDialogue} autoDialogueBusy={autoDialogueBusy} canSuggest={Boolean(conversationReady&&latestAssistantMessage&&!milestone&&!replyPending&&!pendingImage)} onSuggest={()=>void requestAutoDialogue()} onSuggestOptions={openAutoDialogueOptions} onClearSuggestion={clearAutoDialogue} />
      </View>
      {showRight ? <ContextRail snapshot={snapshot} character={character} context={chatContext} activePlan={activeSharedPlan} onPrompt={stageManualInput} onPlan={openPlanPicker} /> : null}
    </View>
  </KeyboardAvoidingView>;
}

function resolveChatRoute(snapshot:Snapshot|null,params:ChatParams){
  const focusedPlan=params.planId&&snapshot?snapshot.sharedPlans?.find((item)=>item.id===params.planId):undefined;
  const requestedCharacter=params.character&&snapshot?snapshot.characters.find((item)=>item.id===params.character||item.together_character_templates.slug===params.character||item.together_character_templates.public_handle===params.character||item.character_template_id===params.character):undefined;
  const resumeMostRecent=!params.character&&!params.plan&&!params.draft&&!params.location&&!params.activity&&!params.planId&&!params.repeatPlanId;
  const recentConversation=snapshot&&resumeMostRecent?mostRecentlyUsedConversation(snapshot.conversations):undefined;
  const recentCharacter=snapshot&&recentConversation?snapshot.characters.find((item)=>item.id===recentConversation.character_instance_id):undefined;
  const character=snapshot?(focusedPlan?snapshot.characters.find((item)=>item.id===focusedPlan.character_instance_id)??requestedCharacter:requestedCharacter??recentCharacter??activeCompanion(snapshot)):undefined;
  const conversation=snapshot&&character?activeConversationFor(snapshot.conversations,character.id):undefined;
  return{focusedPlan,character,conversation};
}

function ChatAmbientGlow({compact}:{compact:boolean}) {
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.chatGlowLayer}>
    <View style={[styles.chatGlow,styles.chatGlowRose,compact&&styles.chatGlowRoseCompact]} />
    <View style={[styles.chatGlow,styles.chatGlowViolet,compact&&styles.chatGlowVioletCompact]} />
    <View style={[styles.chatGlow,styles.chatGlowCenter,compact&&styles.chatGlowCenterCompact]} />
  </View>;
}

function ChatHeader({character,location,backToInbox,onCall,onMenu}:{character:CharacterInstance;location:string;backToInbox:boolean;onCall:()=>void;onMenu:()=>void}) { const slug=character.together_character_templates.slug;const leaveChat=()=>{if(backToInbox){router.replace('/(tabs)/chat-tab');return;}if(router.canGoBack())router.back();else router.replace('/home');};return <View style={[styles.header, Platform.OS === 'web' && styles.webHeader]}><Pressable accessibilityLabel={backToInbox?'Back to Messages':'Back'} onPress={leaveChat} style={styles.icon}><ArrowLeft color={colors.text}/></Pressable><Pressable accessibilityLabel={`View ${character.together_character_templates.name}'s profile`} onPress={()=>router.push(`/character/${slug}` as never)}><CharacterAvatar slug={slug} name={character.together_character_templates.name} size={42} ring/></Pressable><Pressable onPress={()=>router.push(`/character/${slug}` as never)} style={styles.headerIdentity}><Text numberOfLines={1} style={styles.name}>{character.together_character_templates.name}</Text><Text numberOfLines={1} style={styles.status}>At {location}</Text></Pressable><Pressable accessibilityLabel={`Call ${character.together_character_templates.name}`} onPress={onCall} style={styles.icon}><Phone size={18} color={colors.text}/></Pressable><Pressable accessibilityLabel="Conversation menu" onPress={onMenu} style={styles.icon}><MoreHorizontal color={colors.text}/></Pressable></View>; }

function ConversationMenu({name,planLabel,favorite,favoriteBusy,onClose,actions}:{name:string;planLabel:string;favorite:boolean;favoriteBusy:boolean;onClose:()=>void;actions:Record<'favorite'|'profile'|'plan'|'edit'|'start'|'remove',()=>void>}) { const item=(label:string,action:()=>void,danger=false)=><Pressable key={label} onPress={action} style={styles.menuItem}><Text style={[styles.menuItemText,danger&&{color:colors.danger}]}>{label}</Text></Pressable>;return <FrostedSurface intensity={82} style={styles.menu}><View style={styles.menuTop}><Text style={styles.menuTitle}>{name}</Text><Pressable onPress={onClose}><Text style={styles.closeText}>Close</Text></Pressable></View><Text style={styles.menuSection}>COMPANION</Text><Pressable accessibilityRole="button" accessibilityState={{selected:favorite,disabled:favoriteBusy}} disabled={favoriteBusy} onPress={actions.favorite} style={styles.menuFavorite}><Star size={15} color={favorite?'#FFD27A':colors.muted} fill={favorite?'#FFD27A':'transparent'}/><Text style={styles.menuItemText}>{favorite?'Remove from favorites':'Add to favorites'}</Text></Pressable>{item('View profile',actions.profile)}{item(planLabel,actions.plan)}<Text style={styles.menuSection}>CONVERSATION</Text>{item('Edit chat settings',actions.edit)}{item('Start a fresh chat',actions.start)}<Text style={styles.menuSection}>MANAGE</Text>{item('Delete this conversation',actions.remove,true)}</FrostedSurface>; }

function LeftRail({snapshot,active}:{snapshot:Snapshot;active:string}) { const switchConversation=(character:string)=>router.setParams({character,plan:undefined,draft:undefined,location:undefined,world:undefined,activity:undefined,planId:undefined,repeatPlanId:undefined});const conversations=snapshot.conversations.filter(isActiveConversation).map((conversation)=>({conversation,character:snapshot.characters.find((item)=>item.id===conversation.character_instance_id)})).filter((row):row is{conversation:Snapshot['conversations'][number];character:Snapshot['characters'][number]}=>Boolean(row.character));return <View style={styles.leftRail}><KivelleLogo height={42} style={styles.railLogo}/><Text style={styles.railKicker}>CONVERSATIONS</Text>{conversations.map(({conversation,character})=><Pressable key={conversation.id} onPress={()=>switchConversation(character.together_character_templates.public_handle??character.together_character_templates.slug)} style={[styles.personRow,character.together_character_templates.slug===active&&styles.personActive]}><CharacterAvatar slug={character.together_character_templates.slug}/><View style={{flex:1}}><Text style={styles.personName}>{character.together_character_templates.name}</Text><Text style={styles.personMeta} numberOfLines={1}>{character.current_activity}</Text></View>{conversation.unread?<View style={styles.unreadDot}/>:null}</Pressable>)}<Text style={styles.railKicker}>CITY LIFE</Text>{snapshot.lifeEvents.slice(0,3).map((event)=><View key={event.id} style={styles.railEvent}><Sparkles size={14} color={colors.warm}/><View style={{flex:1}}><Text style={styles.railEventTitle}>{event.title}</Text><Text style={styles.personMeta} numberOfLines={2}>{event.narrative_summary}</Text></View></View>)}</View>; }

function ConversationHistoryLoading({name}:{name:string}){return <View style={styles.conversationLoading}><View style={styles.conversationLoadingAvatar}/><View style={{flex:1,gap:7}}><View style={styles.conversationLoadingLine}/><View style={[styles.conversationLoadingLine,styles.conversationLoadingLineShort]}/></View><Text style={styles.conversationLoadingText}>Opening {name}…</Text></View>;}

function ContextRail({snapshot,character,context,activePlan,onPrompt,onPlan}:{snapshot:Snapshot;character:CharacterInstance;context:ClientConversationContext;activePlan:SharedPlan|null;onPrompt:(value:string)=>void;onPlan:()=>void}) { const memories=snapshot.memories.filter((item)=>item.character_instance_id===character.id).slice(0,3);return <ScrollView style={styles.rightRail} contentContainerStyle={styles.rightContent}><Image source={characterAssets[character.together_character_templates.slug]} style={styles.contextPortrait} contentFit="cover" contentPosition="top"/><Text style={styles.contextName}>{character.together_character_templates.name}</Text><Text style={styles.contextBio}>{character.together_character_templates.occupation} · {relationshipLabel(character.relationship_stage)}</Text>{context.nextCommitment?<ContextSection title="NEXT TOGETHER"><Pressable onPress={()=>context.nextCommitment?.kind==='plan'&&router.push(`/plan/${context.nextCommitment.id}` as never)}><ContextLine icon={<CalendarDays size={15} color={colors.rose}/>} title={context.nextCommitment.title} body={`${new Date(context.nextCommitment.startsAt).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'})}${context.nextCommitment.location?` · ${context.nextCommitment.location}`:''}`}/></Pressable></ContextSection>:null}<ContextSection title={context.interactionMode==='co_present'?'TOGETHER NOW':`${character.together_character_templates.name.toUpperCase()} RIGHT NOW`}><ContextLine icon={<MapPin size={15} color={colors.warm}/>} title={context.scene.location} body={context.scene.activity}/></ContextSection>{context.story?<ContextSection title="CURRENT STORY"><ContextLine icon={<Sparkles size={15} color={colors.violet}/>} title={context.story.title} body={context.story.chapter}/></ContextSection>:null}{context.thread?<Pressable onPress={()=>onPrompt(context.thread!.prompt)} style={styles.threadCard}><CalendarDays size={16} color={colors.rose}/><View style={{flex:1}}><Text style={styles.threadTitle}>FOLLOW UP</Text><Text style={styles.contextCopy}>{context.thread.label}</Text></View><ChevronRight size={16} color={colors.muted}/></Pressable>:null}<ContextSection title={`WHAT ${character.together_character_templates.name.toUpperCase()} REMEMBERS`}>{memories.length?memories.map((memory)=><Pressable key={memory.id} onPress={()=>router.push(`/memories?character=${character.together_character_templates.slug}` as never)} style={styles.memoryLine}><Brain size={14} color={memory.pinned?colors.rose:colors.violet}/><Text style={styles.contextCopy} numberOfLines={2}>{presentMemoryText(memory.canonical_text,character.together_character_templates.name)}</Text></Pressable>):<Text style={styles.contextMuted}>Meaningful details will collect here.</Text>}</ContextSection><Pressable onPress={onPlan} style={styles.planButton}><CalendarDays size={17} color="#fff"/><Text style={styles.planButtonText}>{activePlan?'Change plan':'Plan something'}</Text></Pressable><Pressable onPress={()=>router.push(`/memories?character=${character.together_character_templates.slug}` as never)} style={styles.secondaryButton}><Brain size={17} color={colors.rose}/><Text style={styles.secondaryButtonText}>Memory Center</Text></Pressable></ScrollView>; }

function SceneCard({character,context,snapshot,roster}:{character:CharacterInstance;context:ClientConversationContext;snapshot:Snapshot;roster:SharedSceneRoster|null}) { const location=snapshot.locations.find((item)=>item.id&&(context.scene.locationId??character.current_location_id)===item.id);const world=location?worldForLocation(snapshot,location.id):undefined;const fallback=location?locationHeroAsset(world?.slug,location.slug):world?worldHeroAsset(world.slug):cityLifeAsset;const participantCharacters=(roster?.participants??[]).map((participant)=>participant.together_character_instances).filter((person):person is SharedSceneCharacter=>Boolean(person)).filter((person,index,all)=>all.findIndex((item)=>item.id===person.id)===index);const people=participantCharacters.length?participantCharacters:[{id:character.id,together_character_templates:{name:character.together_character_templates.name,slug:character.together_character_templates.slug}}];const peopleLabel=people.length>1?people.map((person)=>person.together_character_templates.name).join(' · '):`${character.together_character_templates.name} · ${character.current_mood}`;return <View style={[styles.scene,context.interactionMode==='co_present'&&{borderColor:colors.rose}]}><Image source={context.scene.mediaUrl?{uri:context.scene.mediaUrl}:fallback} style={StyleSheet.absoluteFill} contentFit="cover"/><View style={styles.sceneShade}><View style={styles.sceneTop}><Text style={styles.sceneKicker}>{context.interactionMode==='co_present'?'TOGETHER NOW':`${character.together_character_templates.name.toUpperCase()} RIGHT NOW`}</Text><Text style={styles.sceneTime}>{context.scene.localTime}</Text></View><Text style={styles.sceneTitle}>{context.scene.location}</Text><Text style={styles.sceneCopy}>{context.scene.summary}</Text><View style={styles.scenePeople}><View style={styles.sceneAvatarStack}>{people.slice(0,3).map((person,index)=><View key={person.id} style={[styles.sceneStackedAvatar,index>0&&styles.sceneStackedAvatarOverlap]}><CharacterAvatar slug={person.together_character_templates.slug} name={person.together_character_templates.name} size={28}/></View>)}</View><Text style={styles.scenePeopleText}>{peopleLabel}</Text></View></View></View>; }

function SharedSceneInvite({people,busy,onJoin}:{people:SharedSceneCharacter[];busy:boolean;onJoin:(person:SharedSceneCharacter)=>void}){return <View style={styles.sharedSceneInvite}><View style={{flex:1,minWidth:0}}><Text style={styles.sharedSceneInviteKicker}>ALSO HERE</Text><Text numberOfLines={2} style={styles.sharedSceneInviteText}>{people.map((person)=>person.together_character_templates.name).join(' and ')} {people.length===1?'is':'are'} nearby.</Text></View>{people.slice(0,2).map((person)=><Pressable key={person.id} disabled={busy} accessibilityLabel={`Invite ${person.together_character_templates.name} into this scene`} onPress={()=>onJoin(person)} style={[styles.sharedSceneInviteButton,busy&&styles.sendDisabled]}><Text style={styles.sharedSceneInviteButtonText}>Join {person.together_character_templates.name}</Text></Pressable>)}</View>}
function sceneActivityLabel(scene:SceneSession){const explicit=typeof scene.state?.activityLabel==='string'?scene.state.activityLabel.trim():'';if(explicit)return explicit;const key=String(scene.state?.currentActivityKey??scene.activity_key??'together').replace(/[_-]+/g,' ').trim();return key&&key!=='together'?key.replace(/^./,(character)=>character.toUpperCase()):'Spending time together';}

function ConversationActionCard({action,busy,onConfirm,onChange,onDismiss}:{action:ConversationAction;busy:boolean;onConfirm:(planId?:string)=>void;onChange:()=>void;onDismiss:()=>void}){
  if(action.payload.trigger==='assistant_location_mention')return <LocationMentionPlanCard action={action} busy={busy} onDismiss={onDismiss}/>;
  const cancel=['plan_cancel','cancel_plan'].includes(action.candidate_type),reschedule=['plan_reschedule','reschedule_plan'].includes(action.candidate_type),options=Array.isArray(action.payload.options)?action.payload.options as Array<Record<string,unknown>>:[];
  const title=String(action.payload.proposedTitle??action.payload.title??(cancel?'Cancel this plan?':reschedule?'Change this plan?':'Make this a real plan?')),rawStarts=action.payload.proposedStartsAt??action.payload.startsAt,starts=rawStarts&&new Date(String(rawStarts)).getTime()>=Date.now()+10*60000?rawStarts:null,locationLabel=action.payload.proposedLocation?String(action.payload.proposedLocation):action.payload.location?String(action.payload.location):'';
  const detail=starts?`${new Date(String(starts)).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}${locationLabel?` · ${locationLabel}`:''}`:'Choose the time before anything is saved.';
  return <View style={styles.actionCard}><View style={styles.actionIcon}><CalendarDays size={18} color={colors.rose}/></View><View style={{flex:1}}><Text style={styles.actionKicker}>{cancel?'CANCEL PLAN':reschedule?'CHANGE PLAN':'MAKE A PLAN'}</Text><Text style={styles.actionTitle}>{options.length?'Which plan?':title}</Text>{options.length?options.map((option)=><Pressable key={String(option.planId)} disabled={busy} onPress={()=>onConfirm(String(option.planId))} style={styles.planTarget}><Text style={styles.planOptionTitle}>{String(option.title)}</Text><Text style={styles.contextMuted}>{new Date(String(option.startsAt)).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'})} · {String(option.location??'City Life')}</Text></Pressable>):<Text style={styles.contextMuted}>{detail}</Text>}{!options.length?<View style={styles.actionButtons}><Pressable disabled={busy} onPress={()=>onConfirm()} style={styles.actionPrimary}><Text style={styles.actionPrimaryText}>{busy?'Working…':cancel?'Cancel plan':starts?(reschedule?'Save change':'Save plan'):'Choose time'}</Text></Pressable>{!cancel?<Pressable disabled={busy} onPress={onChange} style={styles.actionSecondary}><Text style={styles.actionSecondaryText}>Change</Text></Pressable>:null}<Pressable disabled={busy} onPress={onDismiss} style={styles.actionSecondary}><Text style={styles.actionSecondaryText}>Not now</Text></Pressable></View>:null}</View></View>;
}

function LocationMentionPlanCard({action,busy,onDismiss}:{action:ConversationAction;busy:boolean;onDismiss:()=>void}){
  const defaults=defaultPlanTimeFields();
  const[customOpen,setCustomOpen]=useState(false),[dateValue,setDateValue]=useState(defaults.date),[timeValue,setTimeValue]=useState(defaults.time),[saving,setSaving]=useState(false),[localError,setLocalError]=useState('');
  const{refresh,removeConversationAction}=useTogether();
  const location=String(action.payload.location??'that place'),locationSlug=typeof action.payload.locationSlug==='string'?action.payload.locationSlug:undefined,worldSlug=typeof action.payload.worldSlug==='string'?action.payload.worldSlug:undefined,disabled=busy||saving;
  const save=async(timingChoice:'now'|'in_one_hour'|'custom',startsAt?:string)=>{setSaving(true);setLocalError('');try{const result=await confirmConversationAction<ConversationActionMutation>(action.id,{timingChoice,...(startsAt?{startsAt}:{})});removeConversationAction(action.id);await refresh();if(timingChoice==='now'&&result.result?.commitment.id)router.push(result.result.kind==='shared_plan'&&result.result.experience?`/plan-live?planId=${result.result.commitment.id}` as never:result.result.kind==='shared_plan'?`/plan/${result.result.commitment.id}` as never:`/date/${result.result.commitment.id}` as never);if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);}catch(caught){setLocalError(caught instanceof Error?caught.message:'That plan could not be saved.');}finally{setSaving(false);}};
  const saveCustom=()=>{const value=parseCustomPlanTime(dateValue,timeValue);if(!value||value.getTime()<Date.now()+10*60000){setLocalError('Choose a time at least 10 minutes from now.');return;}void save('custom',value.toISOString());};
  return <View style={styles.locationPlanCard}>
    <View style={styles.locationPlanHero}><Image source={locationHeroAsset(worldSlug,locationSlug)} style={StyleSheet.absoluteFill} contentFit="cover"/><View style={styles.locationPlanShade}/><View style={styles.locationPlanHeroContent}><View style={styles.locationPlanKickerRow}><Text style={styles.locationPlanKicker}>PLAN A DATE</Text><Pressable accessibilityLabel="Dismiss date suggestion" disabled={disabled} onPress={onDismiss} style={styles.locationPlanClose}><X size={16} color="#fff"/></Pressable></View><Text style={styles.locationPlanTitle}>Go to {location} together?</Text><Text style={styles.locationPlanCopy}>Choose when you want to make it happen.</Text></View></View>
    <View style={styles.locationPlanBody}><View style={styles.locationPlanQuickRow}><Pressable disabled={disabled} onPress={()=>void save('now')} style={styles.locationPlanPrimary}><Text style={styles.locationPlanPrimaryText}>{saving?'SAVING…':'NOW'}</Text></Pressable><Pressable disabled={disabled} onPress={()=>void save('in_one_hour')} style={styles.locationPlanSecondary}><Text style={styles.locationPlanSecondaryText}>IN 1 HOUR</Text></Pressable></View><Pressable disabled={disabled} accessibilityState={{expanded:customOpen}} onPress={()=>{setCustomOpen((value)=>!value);setLocalError('');}} style={styles.locationPlanCustom}><CalendarDays size={15} color={colors.rose}/><Text style={styles.locationPlanCustomText}>PICK ANOTHER TIME</Text><ChevronRight size={15} color={colors.muted} style={customOpen?{transform:[{rotate:'90deg'}]}:undefined}/></Pressable>{customOpen?<View style={styles.locationPlanFields}><DateTimeFields date={dateValue} time={timeValue} onDateChange={setDateValue} onTimeChange={setTimeValue}/><Pressable disabled={disabled} onPress={saveCustom} style={styles.locationPlanPrimary}><Text style={styles.locationPlanPrimaryText}>{saving?'SAVING…':'SAVE DATE'}</Text></Pressable></View>:null}{localError?<Text style={styles.locationPlanError}>{localError}</Text>:null}</View>
  </View>;
}

function MessageBubble({message,character,media,photoOffer,photoPreviewSource,photoOfferBusy,grouped,textStyle,voiceVisible,voiceEnabled,activeVoiceNoteId,onVoiceActivate,onVoiceRequest,onPhotoOfferAccept,onPhotoOfferDecline,onMediaRetry}:{message:Message;character:CharacterInstance;media:GeneratedMedia[];photoOffer:MediaOffer|null;photoPreviewSource?:ImageSource|number;photoOfferBusy:boolean;grouped:boolean;textStyle:{fontSize:number;lineHeight:number};voiceVisible:boolean;voiceEnabled:boolean;activeVoiceNoteId:string|null;onVoiceActivate:(id:string|null)=>void;onVoiceRequest:(messageId:string,name:string)=>Promise<VoiceNoteRequestResult|null>;onPhotoOfferAccept:(offer:MediaOffer)=>void;onPhotoOfferDecline:(offer:MediaOffer)=>void;onMediaRetry:(id:string)=>Promise<void>}) {
  const[hovered,setHovered]=useState(false),[voiceBusy,setVoiceBusy]=useState(false),[localVoice,setLocalVoice]=useState<GeneratedMedia|undefined>();const opacity=useRef(new Animated.Value(0)).current;const translate=useRef(new Animated.Value(8)).current;
  useEffect(()=>{Animated.parallel([Animated.timing(opacity,{toValue:1,duration:220,useNativeDriver:true}),Animated.timing(translate,{toValue:0,duration:220,useNativeDriver:true})]).start();},[]);
  const assistant=message.role==='assistant',photoOnly=isPhotoOnlyConversationMessage(message),attachments=message.attachments??message.together_conversation_attachments??[],images=media.filter((item)=>item.media_type==='image'),voice=localVoice??media.find((item)=>item.media_type==='voice_note'),speakerName=String(message.provider_metadata?.speakerName??character.together_character_templates.name),speakerSlug=String(message.provider_metadata?.speakerSlug??character.together_character_templates.slug);
  const photoMedia=photoOffer?.generated_media_id?images.find((item)=>item.id===photoOffer.generated_media_id)??images[0]:images[0];
  // The active offer owns its pending and failed presentation. Excluding its
  // linked media here prevents the legacy MediaTile loader from appearing
  // beside the blurred inline offer card.
  const standaloneImages=mediaWithoutActivePhotoOffer(images,photoOffer?photoMedia?.id:null);
  if(photoOnly&&!photoMedia&&!photoOffer)return null;
  if(photoOnly)return <Animated.View style={[{width:'100%',maxWidth:430,alignSelf:'flex-start',marginVertical:2},{opacity,transform:[{translateY:translate}]}]}><ChatPhotoRequestCard offer={photoOffer} media={photoMedia} previewSource={photoPreviewSource} busy={photoOfferBusy} onAccept={()=>{if(photoOffer)onPhotoOfferAccept(photoOffer);}} onDecline={()=>{if(photoOffer)onPhotoOfferDecline(photoOffer);}} onBuyCredits={()=>router.push('/subscription')} onRetry={photoMedia||photoOffer?.generated_media_id?()=>void onMediaRetry(photoMedia?.id??String(photoOffer?.generated_media_id)):undefined}/></Animated.View>;
  const onVoice=async()=>{if(voiceBusy)return;setVoiceBusy(true);try{const result=await onVoiceRequest(message.id,speakerName);if(!result)return;if(result.status==='not_configured'){Alert.alert('Voice note',result.message??"Voice isn't connected yet.");return;}if(result.media){setLocalVoice(result.media);if(result.media.status==='ready'&&Platform.OS!=='web')onVoiceActivate(result.media.id);}}catch(caught){Alert.alert('Voice note',caught instanceof Error?caught.message:'The voice note could not be generated.');}finally{setVoiceBusy(false);}};
  const refreshVoice=async()=>{if(!voice)return;const result=await refreshVoiceNote(voice.id);setLocalVoice(result.media);};
  const actions=()=>Alert.alert('Message actions',undefined,[{text:'Copy',onPress:()=>void Clipboard.setStringAsync(message.content)},...(assistant?[{text:'Report response',onPress:()=>void reportMessage(message.id,'other')}]:[]),{text:'Cancel',style:'cancel'}] as never);
  return <Animated.View style={[styles.messageRow,assistant?styles.assistantRow:styles.userRow,{opacity,transform:[{translateY:translate}]}]}>
    {assistant&&!grouped?<CharacterAvatar slug={speakerSlug} size={28}/>:assistant?<View style={{width:28}}/>:null}
    <View style={styles.messageStack}>
      <Pressable onHoverIn={()=>setHovered(true)} onHoverOut={()=>setHovered(false)} onLongPress={actions} style={[styles.bubble,assistant?styles.assistantBubble:styles.userBubble,message.delivery_status==='failed'&&styles.failed]}>
        {!photoOnly&&message.content!=='[Photo]'?<Text style={[styles.messageText,textStyle]}>{message.content}</Text>:null}
        {attachments.map((attachment)=><Pressable key={attachment.id} accessibilityLabel="Open shared photo" onPress={()=>attachment.signed_url&&void Linking.openURL(attachment.signed_url)}><Image source={attachment.signed_url?{uri:attachment.signed_url}:undefined} style={styles.userAttachment} contentFit="cover"/></Pressable>)}
        {standaloneImages.map((item)=><MediaTile key={item.id} media={item} style={styles.messageMedia} onRetry={()=>void onMediaRetry(item.id)}/>)}
        {assistant&&!photoOnly&&voiceVisible?(voice?<VoiceNoteInline media={voice} active={activeVoiceNoteId===voice.id} onActivate={()=>onVoiceActivate(activeVoiceNoteId===voice.id?null:voice.id)} onRetry={()=>void onVoice()} onRefresh={()=>void refreshVoice()}/>:voiceEnabled?<Pressable accessibilityLabel={`Listen to ${speakerName}'s message`} disabled={voiceBusy} onPress={()=>void onVoice()} style={[styles.listenButton,voiceBusy&&styles.sendDisabled]}><Volume2 size={14} color={colors.rose}/><Text style={styles.listenText}>{voiceBusy?'Generating voice…':'Listen'}</Text></Pressable>:<Pressable accessibilityLabel="Upgrade to unlock companion voice notes" onPress={()=>router.push('/subscription')} style={[styles.listenButton,styles.listenButtonLocked]}><Volume2 size={14} color={colors.muted}/><Text style={[styles.listenText,styles.listenTextLocked]}>Listen · Kivelle+</Text></Pressable>):null}
        <View style={styles.messageMeta}><Text style={[styles.timestamp,{opacity:hovered||Platform.OS!=='web'?1:.35}]}>{new Date(message.created_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</Text>{hovered&&Platform.OS==='web'?<Pressable onPress={()=>void Clipboard.setStringAsync(message.content)}><Copy size={12} color={colors.muted}/></Pressable>:null}</View>
      </Pressable>
      {assistant&&photoOffer?<ChatPhotoRequestCard offer={photoOffer} media={photoMedia} previewSource={photoPreviewSource} busy={photoOfferBusy} onAccept={()=>onPhotoOfferAccept(photoOffer)} onDecline={()=>onPhotoOfferDecline(photoOffer)} onBuyCredits={()=>router.push('/subscription')} onRetry={photoMedia||photoOffer.generated_media_id?()=>void onMediaRetry(photoMedia?.id??String(photoOffer.generated_media_id)):undefined}/>:null}
    </View>
  </Animated.View>;
}

function VoiceNoteInline({media,active,onActivate,onRetry,onRefresh}:{media:GeneratedMedia;active:boolean;onActivate:()=>void;onRetry:()=>void;onRefresh:()=>void}){
  const source=media.status==='ready'&&media.signed_url?media.signed_url:null;
  const player=useAudioPlayer(source,{updateInterval:250});
  const status=useAudioPlayerStatus(player);
  const refreshAttempted=useRef(false);
  useEffect(()=>{if(!active){player.pause();return;}if(Platform.OS!=='web'&&source){if(status.didJustFinish)void player.seekTo(0);player.play();}},[active,player,source,status.didJustFinish]);
  useEffect(()=>{if(!active||!source||status.isLoaded||refreshAttempted.current)return;const timer=setTimeout(()=>{if(!status.isLoaded){refreshAttempted.current=true;onRefresh();}},1800);return()=>clearTimeout(timer);},[active,source,status.isLoaded,onRefresh]);
  if(media.status==='failed')return <View style={styles.voiceNote}><Volume2 size={15} color={colors.muted}/><View style={styles.voiceProgressWrap}><Text style={styles.voiceNoteText}>{media.failure_reason_safe??'Voice note unavailable.'}</Text><Pressable accessibilityLabel="Retry companion voice note" onPress={onRetry}><Text style={styles.listenText}>Retry</Text></Pressable></View></View>;
  if(!source)return <View style={styles.voiceNote}><ActivityIndicator size="small" color={colors.rose}/><Text accessibilityLiveRegion="polite" style={styles.voiceNoteText}>Generating voice…</Text></View>;
  const duration=status.duration||Number(media.duration_ms??0)/1000;
  const current=Math.min(status.currentTime||0,duration||0);
  const progress=duration>0?Math.min(1,current/duration):0;
  const toggle=()=>{
    if(status.playing){player.pause();onActivate();return;}
    // Calling play directly from the press handler preserves the browser user
    // gesture. Starting it later from a React effect is rejected by web
    // autoplay policy and expo-audio does not surface that rejected promise.
    if(status.didJustFinish)void player.seekTo(0);
    onActivate();
    player.play();
  };
  return <View style={styles.voiceNote}><Pressable accessibilityLabel={status.playing?'Pause companion voice note':'Play companion voice note'} accessibilityRole="button" onPress={toggle} style={styles.voicePlayButton}>{status.playing?<Pause size={14} color="#fff" fill="#fff"/>:<Play size={14} color="#fff" fill="#fff"/>}</Pressable><View style={styles.voiceProgressWrap}><Pressable accessibilityLabel="Seek voice note" accessibilityRole="adjustable" onPress={(event)=>{if(!duration)return;const width=event.nativeEvent.locationX;void player.seekTo(Math.max(0,Math.min(duration,(width/180)*duration)));}} style={styles.voiceProgress}><View style={[styles.voiceProgressFill,{width:`${Math.round(progress*100)}%`}]}/></Pressable><Text accessibilityLiveRegion="polite" style={styles.voiceDuration}>{status.error?'Audio could not load · tap again':status.isBuffering?'Loading…':!status.isLoaded?'Ready · tap play':`${formatVoiceTime(current)} / ${formatVoiceTime(duration)}`}</Text></View></View>;
}

function VoiceCallEventRow({value}:{value:VoiceCallTimelineValue}){const[expanded,setExpanded]=useState(false),first=value.messages[0],last=value.messages.at(-1),fallbackMs=new Date(last?.created_at??value.at).getTime()-new Date(first?.created_at??value.at).getTime(),duration=Math.max(0,Math.round((value.durationMs||fallbackMs)/60_000)),hasTranscript=value.messages.length>0;return <View style={styles.voiceCallEvent}><Pressable accessibilityRole="button" accessibilityState={{expanded}} accessibilityLabel={`Voice call, ${duration||1} minutes.${hasTranscript?` ${expanded?'Hide':'Show'} transcript`:''}`} onPress={()=>hasTranscript&&setExpanded((current)=>!current)} style={styles.voiceCallEventHeader}><View style={styles.voiceCallEventIcon}><Phone size={15} color={colors.rose}/></View><View style={{flex:1}}><Text style={styles.voiceCallEventTitle}>Voice call · {duration||1} min</Text><Text style={styles.voiceCallEventMeta}>{hasTranscript?`${value.messages.length} transcript turns`:'No transcript turns'} · {new Date(value.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</Text></View>{hasTranscript?<ChevronRight size={16} color={colors.muted} style={expanded?{transform:[{rotate:'90deg'}]}:undefined}/>:null}</Pressable>{expanded?<View style={styles.voiceCallTranscript}>{value.messages.map((message)=><View key={message.id} style={styles.voiceCallTurn}><Text style={styles.voiceCallSpeaker}>{message.role==='assistant'?'COMPANION':'YOU'}</Text><Text style={styles.voiceCallText}>{message.content}</Text></View>)}</View>:null}</View>;}

function formatVoiceTime(seconds:number){const safe=Number.isFinite(seconds)?Math.max(0,Math.floor(seconds)):0;return`${Math.floor(safe/60)}:${String(safe%60).padStart(2,'0')}`;}

function StreamingBubble({character,content,textStyle}:{character:CharacterInstance;content:string;textStyle:{fontSize:number;lineHeight:number}}) { return <View style={[styles.messageRow,styles.assistantRow]}><CharacterAvatar slug={character.together_character_templates.slug} size={28}/><View style={[styles.bubble,styles.assistantBubble]}><Text style={[styles.messageText,textStyle]}>{content}<Text style={styles.cursor}>▍</Text></Text><Text style={styles.timestamp}>Now</Text></View></View>; }
function TypingState({name}:{name:string}){
  const dots=useRef([new Animated.Value(0),new Animated.Value(0),new Animated.Value(0)]).current;
  useEffect(()=>{
    const loops=dots.map((value,index)=>Animated.loop(Animated.sequence([
      Animated.delay(index*150),
      Animated.timing(value,{toValue:1,duration:220,useNativeDriver:true}),
      Animated.timing(value,{toValue:0,duration:280,useNativeDriver:true}),
      Animated.delay((2-index)*150),
    ])));
    loops.forEach((loop)=>loop.start());
    return()=>{loops.forEach((loop)=>loop.stop());dots.forEach((value)=>value.setValue(0));};
  },[dots]);
  return <View accessibilityLabel={`${name} is typing`} accessibilityLiveRegion="polite" style={styles.typing}>
    <View accessibilityElementsHidden style={styles.typingDots}>{dots.map((value,index)=><Animated.View key={index} style={[styles.dot,{opacity:value.interpolate({inputRange:[0,1],outputRange:[.34,1]}),transform:[{translateY:value.interpolate({inputRange:[0,1],outputRange:[0,-3]})},{scale:value.interpolate({inputRange:[0,1],outputRange:[.82,1.08]})}]}]}/>)}</View>
    <Text style={styles.typingText}>{name} is typing</Text>
  </View>;
}
function RelationshipMomentCard({milestone,busy,onChoose}:{milestone:RelationshipMilestone;busy:boolean;onChoose:(action:RelationshipMilestone['choices'][number]['id'])=>void}) { return <View style={[styles.milestoneCard,milestone.kind==='repair'&&styles.milestoneTense]}><View style={styles.milestoneIcon}><Heart size={18} color={milestone.kind==='repair'?colors.warm:colors.rose} fill={milestone.kind==='repair'?'transparent':'rgba(216,62,234,.25)'}/></View><Text style={styles.milestoneKicker}>{milestone.kind==='repair'?'A MOMENT TO REPAIR':'YOUR STORY IS CHANGING'}</Text><Text style={styles.milestoneTitle}>{milestone.title}</Text><Text style={styles.milestoneBody}>{milestone.body}</Text><Text style={styles.milestonePrompt}>{milestone.prompt}</Text><View style={styles.milestoneChoices}>{milestone.choices.map((choice)=><Pressable key={choice.id} disabled={busy} onPress={()=>onChoose(choice.id)} style={[styles.milestoneChoice,choice.tone==='primary'&&styles.milestoneChoicePrimary,busy&&styles.sendDisabled]}><Text style={[styles.milestoneChoiceText,choice.tone==='primary'&&styles.milestoneChoicePrimaryText]}>{choice.label}</Text></Pressable>)}</View></View>; }
function EmptyConversation({character,prompts,onPrompt}:{character:CharacterInstance;prompts:string[];onPrompt:(value:string)=>void}) { return <View style={styles.empty}><MessageCircle color={colors.rose}/><Text style={styles.emptyTitle}>The city is already in motion.</Text><Text style={styles.emptyCopy}>Start with what is actually happening around {character.together_character_templates.name}.</Text>{prompts.map((prompt)=><Pressable key={prompt} onPress={()=>onPrompt(prompt)} style={styles.emptyPrompt}><Text style={styles.suggestionText}>{prompt}</Text><ChevronRight size={15} color={colors.rose}/></Pressable>)}</View>; }

function PlanFocusChip({plan,onOpen,onClose}:{plan?:SharedPlan;onOpen:(id:string)=>void;onClose:()=>void}){if(!plan||!isRelevantFocusPlan(plan))return null;return <View style={styles.focusChip}><Pressable accessibilityLabel={`Talking about ${plan.title}`} onPress={()=>onOpen(plan.id)} style={styles.focusChipMain}><MessageCircle size={13} color={colors.rose}/><Text style={styles.focusLabel}>Talking about</Text><Text numberOfLines={1} style={styles.focusTitle}>{plan.title} · {new Date(plan.starts_at).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'})}</Text></Pressable><Pressable accessibilityLabel="Stop talking about this plan" onPress={onClose} style={styles.focusClose}><Text style={styles.focusCloseText}>×</Text></Pressable></View>}

function isLivePlan(plan:SharedPlan){
  if(!['active','scheduled'].includes(plan.status))return false;
  const starts=new Date(plan.starts_at).getTime(),ends=new Date(plan.ends_at).getTime(),now=Date.now();
  return Number.isFinite(starts)&&Number.isFinite(ends)&&starts<=now&&now<ends;
}

function isRelevantFocusPlan(plan:SharedPlan){
  if(['cancelled','completed','missed'].includes(plan.status))return false;
  const ends=new Date(plan.ends_at).getTime();
  return !Number.isFinite(ends)||ends>Date.now();
}

function LegacyComposer({character,compact,input,setInput,sending,onSend,onPlan,onPhoto,onInteraction,onMove,coPresent}:{character:CharacterInstance;compact:boolean;input:string;setInput:(value:string)=>void;sending:boolean;onSend:()=>void;onPlan:()=>void;onPhoto:()=>void;onInteraction:()=>void;onMove:()=>void;coPresent:boolean}) {
  void onInteraction; void onMove; void coPresent;
  const overLimit=input.length>MESSAGE_CHARACTER_LIMIT;
  return <View style={styles.composerWrap}><View style={styles.quickActions}><Pressable onPress={onPhoto} style={[styles.quickAction,styles.quickActionFitted]}><Camera size={14} color={colors.rose}/><Text numberOfLines={1} style={[styles.quickText,styles.quickTextFitted]}>{compact?'Photo':'Ask for a photo'}</Text></Pressable><Pressable onPress={onPlan} style={[styles.quickAction,styles.quickActionFitted]}><CalendarDays size={14} color={colors.warm}/><Text numberOfLines={1} style={[styles.quickText,styles.quickTextFitted]}>{compact?'Plan':'Plan something'}</Text></Pressable><Pressable onPress={()=>router.push('/memories')} style={[styles.quickAction,styles.quickActionFitted]}><Brain size={14} color={colors.violet}/><Text numberOfLines={1} style={[styles.quickText,styles.quickTextFitted]}>Memories</Text></Pressable></View><View style={styles.composer}><TextInput value={input} onChangeText={setInput} placeholder={`Message ${character.together_character_templates.name}…`} placeholderTextColor={colors.dimmed} multiline style={[styles.input,styles.inputFitted]} textAlignVertical="top"/><Pressable accessibilityLabel="Send message" onPress={onSend} disabled={!input.trim()||sending||overLimit} style={[styles.send,(!input.trim()||sending||overLimit)&&styles.sendDisabled]}><Send color="#fff" size={19}/></Pressable></View><MessageCharacterCounter value={input}/><Text style={styles.aiNote}>{character.together_character_templates.name} is a fictional AI character. Important memories stay in your control.</Text></View>; }

function PhotoRequestModal({visible,name,onRequest,onShare,onClose}:{visible:boolean;name:string;onRequest:(request:string)=>void;onShare:()=>void;onClose:()=>void}){
  const options=[
    {label:'What they’re doing',request:`Show me what you're doing right now.`},
    {label:'Where they are',request:`Show me where you are.`},
    {label:'Today’s outfit',request:`Show me your outfit today.`},
  ];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable accessibilityLabel="Close photo options" style={styles.mediaModalBackdrop} onPress={onClose}>
      <FrostedBackdrop intensity={34}/>
      <Pressable style={styles.mediaModalFrame} onPress={()=>undefined}>
        <FrostedSurface intensity={82} style={styles.mediaModal}>
          <Pressable accessibilityLabel="Close photo options" onPress={onClose} style={styles.mediaModalClose}><X size={18} color={colors.muted}/></Pressable>
          <View style={styles.mediaModalIconWrap}>
            <View style={styles.mediaModalIconGlow}/>
            <ImagePlus size={31} color="#C9A8FF" strokeWidth={1.7}/>
            <Sparkles size={15} color="#FF9DCC" style={styles.mediaModalSpark}/>
          </View>
          <Text style={styles.mediaModalTitle}>See this moment</Text>
          <Text style={styles.mediaModalCopy}>Ask {name} for a photo grounded in where they are and what they’re doing right now.</Text>
          <Text style={styles.mediaOptionLabel}>PRICE SHOWN BEFORE GENERATION</Text>
          <Pressable accessibilityLabel={`Ask ${name} for a selfie`} onPress={()=>onRequest('Send me a selfie from where you are.')} style={styles.mediaPrimaryAction}>
            <Sparkles size={17} color="#fff"/>
            <Text style={styles.mediaPrimaryText}>Send me a selfie</Text>
          </Pressable>
          <Text style={styles.mediaOptionLabel}>OR SHOW ME</Text>
          <View style={styles.mediaOptions}>{options.map((option)=><Pressable key={option.label} onPress={()=>onRequest(option.request)} style={styles.mediaOption}><Camera size={14} color="#C7A6FF"/><Text style={styles.mediaOptionText}>{option.label}</Text></Pressable>)}</View>
          <Pressable accessibilityLabel="Share your own photo" onPress={onShare} style={styles.mediaShareAction}><ImagePlus size={15} color={colors.rose}/><Text style={styles.mediaShareText}>Share your own photo</Text></Pressable>
          <Pressable onPress={onClose} style={styles.mediaCancel}><Text style={styles.mediaCancelText}>Not now</Text></Pressable>
        </FrostedSurface>
      </Pressable>
    </Pressable>
  </Modal>;
}

function AutoDialogueOptionsModal({visible,name,hasSuggestion,onChoose,onClose}:{visible:boolean;name:string;hasSuggestion:boolean;onChoose:(preference:AutoDialoguePreference)=>void;onClose:()=>void}){
  const options:Array<{value:AutoDialoguePreference;label:string;detail:string}>=[
    {value:'natural',label:hasSuggestion?'Another take':'Match my voice',detail:hasSuggestion?'Generate a different natural response for this moment.':'Use the most natural response for this moment.'},
    {value:'shorter',label:'Keep it brief',detail:'A compact reply in your usual tone.'},
    {value:'detailed',label:'Add more context',detail:'A fuller, scene-aware response without inventing facts.'},
    {value:'romantic',label:'More romantic',detail:`Lean into established chemistry with ${name}.`},
    {value:'assertive',label:'More direct',detail:'Confident and clear without making commitments.'},
  ];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable accessibilityLabel="Close reply options" style={styles.mediaModalBackdrop} onPress={onClose}>
      <FrostedBackdrop intensity={34}/>
      <Pressable style={styles.autoDialogueOptionsFrame} onPress={()=>undefined}>
        <FrostedSurface intensity={82} style={styles.autoDialogueOptionsModal}>
          <View style={styles.autoDialogueOptionsHeader}><View style={styles.autoDialogueOptionsIcon}><Sparkles size={19} color="#D4BEFF"/></View><View style={{flex:1}}><Text style={styles.autoDialogueOptionsTitle}>{hasSuggestion?'Adjust this reply':'Shape an auto reply'}</Text><Text style={styles.autoDialogueOptionsCopy}>{hasSuggestion?'Regenerate the draft in a different direction.':'Choose a direction for an editable draft.'} Nothing is sent automatically.</Text></View><Pressable accessibilityLabel="Close reply options" onPress={onClose} style={styles.autoDialogueOptionsClose}><X size={17} color={colors.muted}/></Pressable></View>
          <View style={styles.autoDialogueOptionsList}>{options.map((option)=><Pressable key={option.value} accessibilityRole="button" accessibilityLabel={`${option.label}. ${option.detail}`} onPress={()=>onChoose(option.value)} style={styles.autoDialogueOption}><View style={styles.autoDialogueOptionSpark}><Sparkles size={14} color={option.value==='romantic'?colors.rose:'#C9A8FF'}/></View><View style={{flex:1}}><Text style={styles.autoDialogueOptionLabel}>{option.label}</Text><Text style={styles.autoDialogueOptionDetail}>{option.detail}</Text></View><ChevronRight size={16} color={colors.dimmed}/></Pressable>)}</View>
        </FrostedSurface>
      </Pressable>
    </Pressable>
  </Modal>;
}

void LegacyComposer;
function Composer({inputRef,conversationId,character,input,onChangeInput,onDictation,onDictationError,onDictationStart,pendingImage,onAddPhoto,onRemovePhoto,sending,onSend,onPhoto,autoDialogue,autoDialogueBusy,canSuggest,onSuggest,onSuggestOptions,onClearSuggestion}:{inputRef:{current:TextInput|null};conversationId:string;character:CharacterInstance;input:string;onChangeInput:(value:string)=>void;onDictation:(text:string)=>void;onDictationError:(message:string)=>void;onDictationStart:()=>void;pendingImage:PendingImage|null;onAddPhoto:()=>void;onRemovePhoto:()=>void;sending:boolean;onSend:()=>void;onPhoto:()=>void;autoDialogue:AutoDialogueSuggestion|null;autoDialogueBusy:boolean;canSuggest:boolean;onSuggest:()=>void;onSuggestOptions:()=>void;onClearSuggestion:()=>void}) {
  const dictation=useChatDictation({conversationId,characterInstanceId:character.id,disabled:sending||autoDialogueBusy,onBeforeStart:onDictationStart,onTranscript:onDictation,onError:onDictationError});
  const dictationBusy=dictation.phase!=='idle',overLimit=input.length>MESSAGE_CHARACTER_LIMIT,suggestMode=!input.trim()&&!pendingImage,actionDisabled=sending||autoDialogueBusy||dictationBusy||overLimit||(suggestMode&&!canSuggest),autoDialogueEdited=Boolean(autoDialogue&&input!==autoDialogue.text);
  return <View style={styles.composerWrap}>
    {pendingImage?<View style={styles.attachmentPreview}><Image source={{uri:pendingImage.uri}} style={styles.attachmentPreviewImage} contentFit="cover"/><View style={{flex:1,minWidth:0}}><Text style={styles.attachmentPreviewTitle}>Photo ready to share</Text><Text style={styles.attachmentPreviewMeta}>{pendingImage.fileName??'Selected image'} · {Math.max(1,Math.round(pendingImage.byteSize/1024))} KB</Text><Pressable accessibilityLabel="Replace selected photo" onPress={onAddPhoto}><Text style={styles.attachmentReplace}>Replace</Text></Pressable></View><Pressable accessibilityLabel="Remove selected photo" onPress={onRemovePhoto} style={styles.attachmentRemove}><X size={16} color={colors.text}/></Pressable></View>:null}
    <View style={[styles.composer,styles.composerAligned]}><View style={[styles.composerInputShell,styles.composerInputShellAligned,autoDialogue&&!autoDialogueEdited&&styles.composerInputSuggested]}><AiMediaButton name={character.together_character_templates.name} onPress={onPhoto} disabled={sending||autoDialogueBusy||dictationBusy}/><TextInput ref={inputRef} value={input} onChangeText={onChangeInput} editable={!autoDialogueBusy&&!dictationBusy} placeholder={dictation.phase==='recording'?'Listening…':dictation.phase==='transcribing'?'Turning voice into text…':autoDialogueBusy?'Thinking of what you might say…':`Message ${character.together_character_templates.name}…`} placeholderTextColor={colors.dimmed} multiline style={[styles.input,styles.inputFitted,styles.embeddedInput,styles.embeddedInputAligned]} textAlignVertical="top"/>{autoDialogue&&!autoDialogueEdited?<View style={[styles.autoDialogueInline,styles.autoDialogueInlineAligned]}><Pressable accessibilityRole="button" accessibilityLabel={`Adjust suggested ${autoDialogueIntentLabel(autoDialogue.intent).toLowerCase()} reply`} onPress={onSuggestOptions} style={styles.autoDialogueInlineAction}><Sparkles size={14} color="#D4BEFF"/></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Clear suggested reply" onPress={onClearSuggestion} style={styles.autoDialogueInlineAction}><X size={14} color={colors.muted}/></Pressable></View>:null}<DictationButton phase={dictation.phase} elapsedMs={dictation.elapsedMs} disabled={sending||autoDialogueBusy} onPress={()=>void dictation.toggle()}/></View><Pressable accessibilityLabel={suggestMode?'Suggest a reply. Hold for reply options.':'Send message'} onPress={suggestMode?onSuggest:onSend} onLongPress={suggestMode&&canSuggest?onSuggestOptions:undefined} delayLongPress={350} disabled={actionDisabled} style={[styles.send,suggestMode&&styles.suggestButton,actionDisabled&&styles.sendDisabled]}>{autoDialogueBusy?<ActivityIndicator color="#fff" size="small"/>:suggestMode?<Sparkles color="#fff" size={19}/>:<Send color="#fff" size={19}/>}</Pressable></View>
    <MessageCharacterCounter value={input}/>
    <Text style={styles.aiNote}>{character.together_character_templates.name} is a fictional AI character. Important memories stay in your control.</Text>
  </View>;
}

function autoDialogueIntentLabel(intent:AutoDialogueSuggestion['intent']):string{return({answer:'Answer',repair:'Repair',support:'Supportive',celebrate:'Celebrate',flirt:'Romantic',follow_up:'Follow-up',coordinate_plan:'Plans',advance_scene:'Scene',close_scene:'Wrap-up',engage_group:'Group',curious:'Curious'} satisfies Record<AutoDialogueSuggestion['intent'],string>)[intent];}

function AiMediaButton({name,onPress,disabled}:{name:string;onPress:()=>void;disabled:boolean}){
  const glow=useRef(new Animated.Value(0)).current;
  useEffect(()=>{const loop=Animated.loop(Animated.sequence([Animated.timing(glow,{toValue:1,duration:1500,useNativeDriver:true}),Animated.timing(glow,{toValue:0,duration:1500,useNativeDriver:true})]));loop.start();return()=>loop.stop();},[glow]);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Ask ${name} for an AI-generated photo`} onPress={onPress} disabled={disabled} style={({pressed})=>[styles.aiMediaButton,styles.aiMediaButtonAligned,pressed&&styles.aiMediaPressed,disabled&&styles.sendDisabled]}>
    <Animated.View pointerEvents="none" style={[styles.aiMediaGlow,{opacity:glow.interpolate({inputRange:[0,1],outputRange:[.28,.72]}),transform:[{scale:glow.interpolate({inputRange:[0,1],outputRange:[.9,1.16]})}]}]}/>
    <ImagePlus size={21} color="#E5D7FF" strokeWidth={1.7}/>
  </Pressable>;
}

function DictationButton({phase,elapsedMs,disabled,onPress}:{phase:ChatDictationPhase;elapsedMs:number;disabled:boolean;onPress:()=>void}){
  const pulse=useRef(new Animated.Value(0)).current;
  useEffect(()=>{if(phase!=='recording'){pulse.stopAnimation();pulse.setValue(0);return;}const loop=Animated.loop(Animated.sequence([Animated.timing(pulse,{toValue:1,duration:650,useNativeDriver:true}),Animated.timing(pulse,{toValue:0,duration:650,useNativeDriver:true})]));loop.start();return()=>loop.stop();},[phase,pulse]);
  const seconds=Math.max(0,Math.floor(elapsedMs/1000)),label=phase==='recording'?`Stop voice-to-text recording. ${Math.floor(seconds/60)} minutes ${seconds%60} seconds.`:phase==='transcribing'?'Turning voice into text.':'Start voice-to-text.',buttonDisabled=phase==='transcribing'||(phase==='idle'&&disabled);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled:buttonDisabled,busy:phase==='transcribing'}} disabled={buttonDisabled} onPress={onPress} style={[styles.dictationButton,phase==='recording'&&styles.dictationRecording,buttonDisabled&&styles.sendDisabled]}>
    {phase==='recording'?<Animated.View pointerEvents="none" style={[styles.dictationPulse,{opacity:pulse.interpolate({inputRange:[0,1],outputRange:[.18,.52]}),transform:[{scale:pulse.interpolate({inputRange:[0,1],outputRange:[.82,1.12]})}]}]}/>:null}
    {phase==='transcribing'?<ActivityIndicator color="#D9C7FF" size="small"/>:phase==='recording'?<Square size={13} color="#fff" fill="#fff"/>:<Mic size={20} color="#D9C7FF" strokeWidth={1.9}/>}
  </Pressable>;
}

function ContextualInteractionTray({interactions,loading,onOpen,onInteraction}:{interactions:InteractionCandidate[];loading:boolean;onOpen:()=>void;onInteraction:(candidate:InteractionCandidate)=>void}) { return <View style={styles.contextualTray}><View style={styles.contextualTrayHeader}><Text style={styles.actionKicker}>TOGETHER NOW</Text><Pressable accessibilityLabel="See all shared scene actions" onPress={onOpen}><Text style={styles.contextualMore}>More</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contextualTrayActions}>{interactions.map((candidate)=><Pressable key={candidate.id} disabled={loading} accessibilityLabel={candidate.label} onPress={()=>onInteraction(candidate)} style={[styles.contextualAction,loading&&styles.sendDisabled]}><Wand2 size={13} color={colors.rose}/><Text style={styles.contextualActionText}>{candidate.label}</Text></Pressable>)}</ScrollView></View>; }
function InteractionTray({name,location,interactions,destinations,loading,onInteraction,onMove,onClose}:{name:string;location:string;interactions:InteractionCandidate[];destinations:InteractionCandidate[];loading:boolean;onInteraction:(candidate:InteractionCandidate)=>void;onMove:(candidate:InteractionCandidate)=>void;onClose:()=>void}) { return <View style={styles.interactionTray}><View style={styles.planHeader}><View style={{flex:1,minWidth:0}}><Text style={styles.planTitle}>TOGETHER AT {location.toUpperCase()}</Text><Text style={styles.contextMuted}>Choose something that fits what you and {name} are doing right now.</Text></View><Pressable accessibilityLabel="Close actions" onPress={onClose}><Text style={styles.closeText}>Close</Text></Pressable></View><Text style={styles.interactionSectionTitle}>TOGETHER</Text><View style={styles.interactionOptions}>{interactions.map((candidate)=><Pressable key={candidate.id} disabled={loading} accessibilityLabel={candidate.label} onPress={()=>onInteraction(candidate)} style={[styles.interactionOption,loading&&styles.sendDisabled]}><Wand2 size={15} color={colors.rose}/><View style={{flex:1,minWidth:0}}><Text style={styles.interactionOptionTitle}>{candidate.label}</Text>{candidate.durationMinutes?<Text style={styles.interactionOptionMeta}>About {candidate.durationMinutes} min</Text>:null}</View><ChevronRight size={16} color={colors.muted}/></Pressable>)}</View>{destinations.length?<><Text style={styles.interactionSectionTitle}>AROUND HERE</Text><View style={styles.interactionOptions}>{destinations.map((candidate)=><Pressable key={candidate.id} disabled={loading} accessibilityLabel={candidate.label} onPress={()=>onMove(candidate)} style={[styles.interactionOption,loading&&styles.sendDisabled]}><MapPin size={15} color={colors.warm}/><View style={{flex:1,minWidth:0}}><Text style={styles.interactionOptionTitle}>{candidate.label}</Text><Text style={styles.interactionOptionMeta}>Walk there together</Text></View><ChevronRight size={16} color={colors.muted}/></Pressable>)}</View></>:null}</View>; }
function CharacterProposalCard({name,proposal,busy,onAccept,onDismiss}:{name:string;proposal:CharacterInteractionProposal;busy:boolean;onAccept:()=>void;onDismiss:()=>void}){return <View accessibilityLabel={`${name} suggests ${proposal.label}`} style={styles.characterProposal}><View style={styles.characterProposalIcon}><Sparkles size={17} color={colors.rose}/></View><View style={{flex:1,minWidth:0}}><Text style={styles.characterProposalKicker}>{proposalHeading(proposal,name)}</Text><Text style={styles.characterProposalTitle}>{proposal.label}</Text></View><Pressable disabled={busy} onPress={onDismiss} style={styles.proposalSecondary}><Text style={styles.proposalSecondaryText}>Not now</Text></Pressable><Pressable disabled={busy} onPress={onAccept} style={styles.proposalPrimary}><Text style={styles.proposalPrimaryText}>Do it</Text></Pressable></View>}
function SceneActionFeedback({feedback,name,onDismiss}:{feedback:InteractionFeedbackPresentation;name:string;onDismiss:()=>void}) { const copy=interactionFeedbackCopy(feedback,name);return <Pressable accessibilityLabel={`${copy} Dismiss.`} onPress={onDismiss} style={styles.sceneActionFeedback}>{feedback.status==='accepted'?<Check size={15} color={colors.rose}/>:<Sparkles size={15} color={colors.warm}/>}<Text style={styles.sceneActionFeedbackText}>{copy}</Text></Pressable>; }

/* Legacy planner retained in source history during the migration; the live surface is PlanSelection.
function PlanTray({snapshot,character,scopedLocationId,repeatPlanId,proposal,interests,busy,onPlan,onClose}:{snapshot:Snapshot;character:CharacterInstance;scopedLocationId?:string|null;repeatPlanId?:string;proposal?:ConversationAction;interests:string[];busy:boolean;onPlan:(option:PlanOption,scheduledFor:string)=>void;onClose:()=>void}){
  const[selected,setSelected]=useState<string|null>(null),[selectedTime,setSelectedTime]=useState<string|null>(null),[elsewhere,setElsewhere]=useState(false),[custom,setCustom]=useState(false),[intent,setIntent]=useState<PlanDiscoveryIntent|null>(null),[dateValue,setDateValue]=useState(''),[timeValue,setTimeValue]=useState('19:30'),[validation,setValidation]=useState('');
  const scoped=snapshot.locations.find((item)=>item.id===scopedLocationId),preferences=snapshot.memories.filter((item)=>item.character_instance_id===character.id&&item.memory_type==='preference').map((item)=>item.canonical_text);
  const scopedWorld=worldForLocation(snapshot,scopedLocationId??character.current_location_id),planLocations=scopedWorld?locationsForWorld(snapshot,scopedWorld.id):snapshot.locations;
  const planContext={activity:character.current_activity,mood:character.current_mood,locationId:character.current_location_id,interests:character.together_character_versions.interests,userInterests:interests,preferences,personality:character.together_character_versions.personality_config,relationshipStage:character.relationship_stage,locations:planLocations,scopedLocationId,chooseElsewhere:elsewhere,previousPlans:snapshot.sharedPlans??[],intent:intent??undefined};
  const options=recommendPlanOptions(planContext),repeatPlan=(snapshot.sharedPlans??[]).find((item)=>item.id===repeatPlanId),proposalActivity=typeof proposal?.payload.activityKey==='string'?proposal.payload.activityKey:null,proposalLocation=typeof proposal?.payload.locationId==='string'?proposal.payload.locationId:null,proposalOption=proposal&&!proposal.payload.needsCompanionPick?options.find((option)=>option.locationId===proposalLocation&&option.activityKey===proposalActivity)??options.find((option)=>option.locationId===proposalLocation):undefined,choice=options.find((option)=>option.id===selected),pick=companionPick(planContext);
  useEffect(()=>{if(repeatPlan&&!selected){const match=options.find((option)=>option.locationId===repeatPlan.location_id&&option.activityKey===repeatPlan.activity_key)??options.find((option)=>option.locationId===repeatPlan.location_id);if(match){setIntent('liked');setSelected(match.id);return;}}if(proposalOption&&!selected){setSelected(proposalOption.id);return;}if(proposal?.payload.needsCompanionPick&&!selected){const match=companionPick(planContext);if(match){setIntent('companion_pick');setSelected(match.id);}}},[repeatPlan?.id,proposal?.id,proposalOption?.id,selected,options]);
  const generatedSlots=buildPlanSlots({option:choice,schedules:snapshot.schedules.filter((item)=>item.character_version_id===character.character_version_id),plans:(snapshot.sharedPlans??[]).filter((item)=>item.character_instance_id===character.id),dates:snapshot.dates.filter((item)=>item.character_instance_id===character.id)}),suggestedCandidate=typeof proposal?.payload.suggestedStartsAt==='string'?proposal.payload.suggestedStartsAt:null,suggestedStart=suggestedCandidate&&new Date(suggestedCandidate).getTime()>=Date.now()+10*60000?suggestedCandidate:null,slots=suggestedStart?[{label:'Suggested',detail:new Date(suggestedStart).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}),value:suggestedStart,reason:'The time you suggested',best:true},...generatedSlots.filter((item)=>item.value!==suggestedStart)]:generatedSlots;
  useEffect(()=>{if(choice&&!selectedTime&&slots[0])setSelectedTime(slots[0].value);},[choice?.id,selectedTime,slots[0]?.value]);
  const selectedSlot=slots.find((slot)=>slot.value===selectedTime),selectOption=(id:string)=>{setSelected(id);setSelectedTime(null);setCustom(false);setValidation('');};
  const useCustom=()=>{if(!choice)return;const value=parseCustomPlanTime(dateValue,timeValue);if(!value||value.getTime()<Date.now()+10*60000){setValidation('Choose a time at least 10 minutes from now.');return;}setValidation('');setSelectedTime(value.toISOString());setCustom(false);};
  const chooseIntent=(value:PlanDiscoveryIntent)=>{setIntent(value);setSelectedTime(null);const ranked=recommendPlanOptions({...planContext,intent:value});if(value==='companion_pick'&&ranked[0])setSelected(ranked[0].id);};
  const reset=()=>{setSelected(null);setSelectedTime(null);setCustom(false);setValidation('');if(!scoped||elsewhere)setIntent(null);};
  const confirmPlan=()=>{if(choice&&selectedTime)onPlan(choice,selectedTime);};
  return <View style={styles.plannerTray}><View style={styles.planHeader}><View style={{flex:1}}><Text style={styles.planTitle}>{choice?'CHOOSE A TIME':scoped&&!elsewhere?scoped.name:`Plan with ${character.together_character_templates.name}`}</Text><Text style={styles.contextMuted}>{choice?`${choice.title} · Nothing is saved until you confirm.`:scoped&&!elsewhere?'Pick what you want to do here. You’ll confirm the time next.':'Pick an idea first. Then choose a time and confirm the plan.'}</Text></View><Pressable disabled={busy} onPress={onClose}><Text style={styles.closeText}>Close</Text></Pressable></View>
    {choice?<><View style={styles.pickCard}>{intent==='companion_pick'?<Text style={styles.pickQuote}>{companionPickQuote(character.together_character_templates.name,choice,character.together_character_versions.personality_config)}</Text>:null}<Text style={styles.actionKicker}>PLAN DETAILS</Text><Text style={styles.pickName}>{choice.title}</Text><Text style={styles.planReason}>{choice.qualityLabel??'Best fit'} · {choice.reason}</Text><Text style={styles.bestTime}>{selectedSlot?.detail??(selectedTime?new Date(selectedTime).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Choose a time')}</Text><Text style={styles.bestReason}>{selectedSlot?.reason??(selectedTime?'Your selected time':'Select one of the options below')}</Text></View>
      {slots.length?<View style={styles.alternateTimes}>{slots.slice(0,4).map((slot)=><Pressable key={slot.value} disabled={busy} onPress={()=>{setSelectedTime(slot.value);setCustom(false);setValidation('');}} style={[styles.timeChip,selectedTime===slot.value&&styles.intentChipActive]}><View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:6}}><Text style={styles.timeChipTitle}>{slot.label}</Text>{selectedTime===slot.value?<Check size={13} color={colors.rose}/>:null}</View><Text style={styles.timeChipDetail}>{slot.detail}</Text></Pressable>)}</View>:<Text style={styles.retryText}>No smart time is available. Choose a custom date and time.</Text>}
      {custom?<View style={styles.customTime}><DateTimeFields date={dateValue} time={timeValue} onDateChange={setDateValue} onTimeChange={setTimeValue}/><Pressable disabled={busy} onPress={useCustom} style={styles.actionPrimary}><Text style={styles.actionPrimaryText}>Use this time</Text></Pressable></View>:<Pressable onPress={()=>setCustom(true)} style={styles.secondaryButton}><CalendarDays size={15} color={colors.rose}/><Text style={styles.secondaryButtonText}>Choose another date & time</Text></Pressable>}{validation?<Text style={styles.retryText}>{validation}</Text>:null}
      <Pressable accessibilityLabel={`Confirm ${choice.title}`} disabled={busy||!selectedTime} onPress={confirmPlan} style={[styles.actionPrimary,{minHeight:46,borderRadius:radius.md},(busy||!selectedTime)&&styles.planDisabled]}><Text style={styles.actionPrimaryText}>{busy?'Planning…':'Confirm plan'}</Text></Pressable><Pressable disabled={busy} onPress={reset}><Text style={styles.closeText}>{intent==='companion_pick'?`Let ${character.together_character_templates.name} pick something else`:'Change activity or place'}</Text></Pressable></>
    :<>{!scoped||elsewhere?<View style={styles.intentRow}>{([['companion_pick',`${character.together_character_templates.name} chooses`],['tonight','Tonight'],['date_night','Date night'],['casual','Casual'],['different','Something new'],['liked','Favorites']] as Array<[PlanDiscoveryIntent,string]>).map(([value,label])=><Pressable key={value} onPress={()=>chooseIntent(value)} style={[styles.intentChip,intent===value&&styles.intentChipActive]}><Text style={styles.intentText}>{label}</Text></Pressable>)}</View>:null}
      {intent||scoped&&!elsewhere?<View style={styles.planOptions}>{(intent==='companion_pick'?[pick].filter(Boolean) as PlanOption[]:options.slice(0,scoped&&!elsewhere?8:4)).map((option)=><Pressable key={option.id} onPress={()=>selectOption(option.id)} style={styles.planOption}><View style={{flex:1,minWidth:0}}><Text style={styles.planOptionTitle}>{option.title}</Text><Text style={styles.planOptionCopy} numberOfLines={2}>{option.description}</Text><Text style={styles.planReason}>{option.qualityLabel??'Best fit'} · {option.reason}</Text></View><ChevronRight size={17} color={colors.rose}/></Pressable>)}</View>:null}
      {scoped&&!elsewhere?<Pressable onPress={()=>{setElsewhere(true);setIntent(null);}} style={styles.secondaryButton}><MapPin size={15} color={colors.rose}/><Text style={styles.secondaryButtonText}>Choose somewhere else</Text></Pressable>:null}</>}
  </View>;
}

} */

type VoiceCallTimelineValue={id:string;messages:Message[];at:string;durationMs:number};
function mergeChatTimeline(messages:Message[],actions:ConversationAction[],events:ConversationEvent[],lastReadAt?:string|null){
  events=collapsePlanTimelineEvents(events);
  const resolvedActionIds=new Set(events.filter((event)=>event.event_type==='plan_proposed'&&event.metadata.resolution!=='pending').map((event)=>event.entity_id)),messageTimes=new Map(messages.map((message)=>[message.id,message.created_at]));
  const callGroups=new Map<string,Message[]>();
  for(const message of messages){const callId=typeof message.provider_metadata?.callSessionId==='string'?message.provider_metadata.callSessionId:null;if(callId)callGroups.set(callId,[...(callGroups.get(callId)??[]),message]);}
  const callMessageIds=new Set([...callGroups.values()].flat().map((message)=>message.id));
  const callEvents=new Map(events.filter((event)=>event.event_type==='voice_call').map((event)=>[event.entity_id,event])),callIds=new Set([...callGroups.keys(),...callEvents.keys()]);
  const voiceCalls=[...callIds].map((id)=>{const ordered=[...(callGroups.get(id)??[])].sort((left,right)=>new Date(left.created_at).getTime()-new Date(right.created_at).getTime()),event=callEvents.get(id),at=event?.created_at??ordered[0]?.created_at??new Date().toISOString(),durationMs=Math.max(0,Number(event?.metadata.durationMs??ordered[0]?.provider_metadata?.callDurationMs??0));return{kind:'voice_call' as const,value:{id,messages:ordered,at,durationMs},at,sortOrder:0};});
  const sorted=[...messages.filter((message)=>!callMessageIds.has(message.id)).map((value)=>({kind:'message' as const,value,at:value.created_at,sortOrder:0})),...voiceCalls,...actions.filter((value)=>!resolvedActionIds.has(value.id)).map((value)=>({kind:'action' as const,value,at:value.assistant_message_id?messageTimes.get(value.assistant_message_id)??value.created_at:value.created_at,sortOrder:1})),...events.filter((value)=>value.event_type!=='plan_proposed'&&value.event_type!=='voice_call').map((value)=>({kind:'event' as const,value,at:value.created_at,sortOrder:2}))].sort((left,right)=>new Date(left.at).getTime()-new Date(right.at).getTime()||left.sortOrder-right.sortOrder);
  const result:Array<(typeof sorted)[number]|{kind:'separator';key:string;label:string}>=[];let day='',unreadAdded=false;
  for(const item of sorted){const itemDay=new Date(item.at).toDateString();if(itemDay!==day){day=itemDay;result.push({kind:'separator',key:`day-${item.at}`,label:timelineDayLabel(new Date(item.at))});}if(!unreadAdded&&lastReadAt&&((item.kind==='message'&&item.value.role==='assistant')||item.kind==='voice_call')&&new Date(item.at)>new Date(lastReadAt)){unreadAdded=true;result.push({kind:'separator',key:`new-${item.at}`,label:'NEW'});}result.push(item);}return result;
}

function normalizeImageMime(value?:string|null,fileName?:string|null):PendingImage['mimeType']|null{const mime=(value??'').toLowerCase();if(mime==='image/jpeg'||mime==='image/png'||mime==='image/webp')return mime;const extension=(fileName??'').toLowerCase().split('.').pop();return extension==='jpg'||extension==='jpeg'?'image/jpeg':extension==='png'?'image/png':extension==='webp'?'image/webp':null;}
function pendingImageAttachment(image:PendingImage,conversationId:string):ConversationAttachment{return{id:`local-attachment-${Date.now()}`,user_id:'local',continuity_id:'local',conversation_id:conversationId,kind:'image',source:'user',storage_path:'',mime_type:image.mimeType,byte_size:image.byteSize,width:image.width,height:image.height,upload_status:'pending',analysis_status:'pending',analysis_metadata:{},metadata:{},signed_url:image.uri,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};}
async function hydrateAttachmentUrls(messages:Message[]):Promise<Message[]>{const attachments=messages.flatMap((message)=>message.together_conversation_attachments??[]).filter((attachment)=>attachment.storage_path);if(!attachments.length)return messages;const{data}=await supabase.storage.from('together-user-media').createSignedUrls(attachments.map((attachment)=>attachment.storage_path),3600);const byPath=new Map((data??[]).map((item)=>([item.path,item.signedUrl] as const)));return messages.map((message)=>({...message,attachments:(message.together_conversation_attachments??[]).map((attachment)=>({...attachment,signed_url:byPath.get(attachment.storage_path)??null}))}));}
function timelineDayLabel(date:Date){const today=new Date();const yesterday=new Date(today);yesterday.setDate(today.getDate()-1);if(date.toDateString()===today.toDateString())return'TODAY';if(date.toDateString()===yesterday.toDateString())return'YESTERDAY';return date.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'}).toUpperCase();}
function PlanTimelineCard({event,plan,locationName,busy,onOpen,onStart,onEnd,onCancel}:{event:ConversationEvent;plan?:SharedPlan;locationName?:string;busy:boolean;onOpen:(plan:SharedPlan)=>void;onStart:(plan:SharedPlan)=>void;onEnd:(plan:SharedPlan)=>void;onCancel:(plan:SharedPlan)=>void}){
  const metadata=event.metadata??{},title=plan?.title??String(metadata.title??'Shared plan'),starts=plan?.starts_at??String(metadata.startsAt??''),status=plan?.status??String(metadata.status??event.event_type.replace('plan_',''));
  const availability=plan?planActionAvailability(plan):null;
  const primaryLabel=availability?.primary==='start'?'Start plan':null;
  return <View accessibilityLabel={`${title}, ${starts?new Date(starts).toLocaleString():''}, ${status}`} style={styles.timelinePlan}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${title} details`} disabled={!plan} onPress={()=>plan&&onOpen(plan)} style={({pressed})=>[styles.timelinePlanBody,pressed&&styles.timelinePlanPressed]}>
      <CalendarDays size={18} color={status==='cancelled'?colors.muted:colors.rose}/>
      <View style={{flex:1,minWidth:0}}><Text style={styles.actionKicker}>{status==='cancelled'?'PLAN CANCELLED':status==='completed'?'SHARED':event.event_type==='plan_joined'?'PLAN STARTED':event.event_type==='plan_rescheduled'||event.event_type==='plan_switched'?'PLAN CHANGED':'PLAN SAVED'}</Text><Text style={styles.actionTitle}>{title}</Text>{event.event_type==='plan_switched'&&metadata.previousTitle?<Text style={styles.contextMuted}>Changed from {String(metadata.previousTitle)}</Text>:null}{starts?<Text style={styles.contextMuted}>{new Date(starts).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} · {locationName??String(metadata.location??'City Life')}</Text>:null}</View>
      {plan?<ChevronRight size={16} color={colors.muted}/>:null}
    </Pressable>
    {plan&&(primaryLabel||availability?.canEnd||availability?.canCancel)?<View style={styles.timelineActions}>{primaryLabel?<Pressable accessibilityRole="button" accessibilityLabel={primaryLabel} disabled={busy||!availability?.primaryEnabled} onPress={()=>onStart(plan)} style={[styles.timelineStart,busy||!availability?.primaryEnabled?styles.timelineActionDisabled:null]}>{busy?<ActivityIndicator size="small" color="#fff"/>:<Play size={13} color="#fff" fill="#fff"/>}<Text style={styles.timelineStartText}>{busy?'Starting…':primaryLabel}</Text></Pressable>:null}{availability?.canEnd?<Pressable accessibilityRole="button" accessibilityLabel={`End ${title}`} disabled={busy} onPress={()=>onEnd(plan)} style={styles.timelineCancel}><Trash2 size={13} color={colors.danger}/><Text style={styles.timelineCancelText}>End plan</Text></Pressable>:null}{availability?.canCancel?<Pressable accessibilityRole="button" accessibilityLabel={`Cancel ${title}`} disabled={busy} onPress={()=>onCancel(plan)} style={styles.timelineCancel}><Trash2 size={13} color={colors.danger}/><Text style={styles.timelineCancelText}>Cancel plan</Text></Pressable>:null}</View>:null}
  </View>;
}
function resolveScopedLocation(snapshot:Snapshot,slug?:string,worldSlug?:string,action?:ConversationAction,repeatPlanId?:string){const candidate=typeof action?.payload.locationId==='string'?action.payload.locationId:null;const repeat=(snapshot.sharedPlans??[]).find((item)=>item.id===repeatPlanId),world=snapshot.worlds.find((item)=>item.slug===worldSlug);return candidate??repeat?.location_id??snapshot.locations.find((item)=>item.slug===slug&&(!world||item.world_id===world.id))?.id??null;}
function StoryFeedback({feedback,onView,onUndo,onDismiss}:{feedback:Feedback;onView:()=>void;onUndo?:()=>void;onDismiss:()=>void}) { return <View style={styles.feedback}><View style={styles.feedbackIcon}>{feedback.kind==='memory'?<Brain size={18} color={colors.rose}/>:<Sparkles size={18} color={colors.warm}/>}</View><View style={{flex:1}}><Text style={styles.feedbackTitle}>{feedback.title}</Text><Text style={styles.feedbackBody}>{feedback.body}</Text></View><Pressable onPress={onView} style={styles.feedbackAction}><Text style={styles.feedbackActionText}>View</Text></Pressable>{onUndo?<Pressable onPress={onUndo} style={styles.feedbackIcon}><Undo2 size={16} color={colors.muted}/></Pressable>:<Pressable onPress={onDismiss} style={styles.feedbackIcon}><Check size={16} color={colors.muted}/></Pressable>}</View>; }
function ContextSection({title,children}:{title:string;children:React.ReactNode}) { return <View style={{gap:9}}><Text style={styles.railKicker}>{title}</Text>{children}</View>; }
function ContextLine({icon,title,body}:{icon:React.ReactNode;title:string;body:string}) { return <View style={styles.contextLine}>{icon}<View style={{flex:1}}><Text style={styles.contextLineTitle}>{title}</Text><Text style={styles.contextCopy}>{body}</Text></View></View>; }

function relationshipLabel(stage:string){return({stranger:'You just met',acquaintance:'Getting acquainted',friend:'A real friendship',flirting:'There is a spark',dating:'You are dating',exclusive:'Choosing each other',long_term:'Building a life'} as Record<string,string>)[stage]??'Getting closer';}
function showNewStoryFeedback(before:Snapshot|null,after:Snapshot|null,characterId:string,name:string,set:(value:Feedback|null)=>void){if(!after)return;const previousMemories=new Set(before?.memories.map((item)=>item.id)??[]);const memory=after.memories.find((item)=>item.character_instance_id===characterId&&!previousMemories.has(item.id));if(memory){set({kind:'memory',title:`${name} remembered that`,body:presentMemoryText(memory.canonical_text,name),id:memory.id});return;}const previousMoments=new Set(before?.moments.map((item)=>item.id)??[]);const moment=after.moments.find((item)=>(item.character_instance_id===characterId||item.participant_instance_ids.includes(characterId))&&!previousMoments.has(item.id));if(moment)set({kind:'moment',title:'A new Moment',body:moment.summary,id:moment.id});}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.background},shell:{flex:1,width:'100%',maxWidth:1480,alignSelf:'center',flexDirection:'row',backgroundColor:colors.background},conversation:{flex:1,minWidth:0,overflow:'hidden',borderLeftWidth:1,borderRightWidth:1,borderColor:colors.border},leftRail:{width:270,flexGrow:0,flexShrink:0,padding:18,gap:10,backgroundColor:'#0B0E17'},rightRail:{width:310,flexGrow:0,flexShrink:0,backgroundColor:'#0B0E17'},rightContent:{padding:18,gap:18,paddingBottom:40},railLogo:{marginBottom:16},railKicker:{color:colors.dimmed,fontSize:10,fontWeight:'900',letterSpacing:1.3,marginTop:8},personRow:{flexDirection:'row',alignItems:'center',gap:10,padding:10,borderRadius:radius.md},personActive:{backgroundColor:'rgba(216,62,234,.10)',borderWidth:1,borderColor:'rgba(216,62,234,.18)'},personName:{color:colors.text,fontSize:14,fontWeight:'800'},personMeta:{color:colors.muted,fontSize:10,lineHeight:14,marginTop:2},unreadDot:{width:6,height:6,borderRadius:3,backgroundColor:colors.rose},railEvent:{flexDirection:'row',gap:9,padding:10,backgroundColor:colors.surface,borderRadius:radius.md},railEventTitle:{color:colors.text,fontSize:12,fontWeight:'800'},header:{paddingTop:50,paddingHorizontal:14,paddingBottom:12,flexDirection:'row',gap:10,alignItems:'center',borderBottomWidth:1,borderBottomColor:colors.border,backgroundColor:'rgba(8,11,19,.98)'},webHeader:{paddingTop:14},icon:{width:40,height:40,alignItems:'center',justifyContent:'center',borderRadius:20,backgroundColor:colors.surface},nameLine:{flexDirection:'row',alignItems:'center',gap:8},name:{color:colors.text,fontWeight:'800',fontSize:16},status:{color:colors.muted,fontSize:11,marginTop:3},menu:{position:'absolute',zIndex:20,top:72,right:12,width:270,padding:12,gap:2,borderRadius:radius.lg,backgroundColor:colors.elevated,borderWidth:1,borderColor:colors.borderBright,shadowColor:'#000',shadowOpacity:.45,shadowRadius:18,shadowOffset:{width:0,height:10}},menuTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:8,paddingBottom:5},menuTitle:{color:colors.text,fontFamily:'Georgia',fontSize:19},menuSection:{color:colors.dimmed,fontSize:8,fontWeight:'900',letterSpacing:1.2,paddingHorizontal:8,paddingTop:9,paddingBottom:3},menuItem:{minHeight:38,justifyContent:'center',paddingHorizontal:9,borderRadius:radius.sm},menuItemText:{color:colors.text,fontSize:12,fontWeight:'700'},messageScroll:{flex:1,minWidth:0},messages:{width:'100%',minWidth:0,padding:spacing.md,paddingBottom:24,gap:8},scene:{height:190,borderRadius:radius.lg,overflow:'hidden',borderWidth:1,borderColor:colors.borderBright,marginBottom:8},sceneShade:{flex:1,padding:16,justifyContent:'flex-end',backgroundColor:'rgba(7,8,16,.48)'},sceneTop:{position:'absolute',top:14,left:14,right:14,flexDirection:'row',justifyContent:'space-between'},sceneKicker:{color:'#FFD2E1',fontSize:10,fontWeight:'900',letterSpacing:1.3},sceneTime:{color:colors.text,fontSize:10,fontWeight:'800'},sceneTitle:{fontFamily:'Georgia',fontSize:28,color:colors.text,textShadowColor:'#000',textShadowRadius:8},sceneCopy:{color:'#F1E9EE',fontSize:12,lineHeight:17,marginTop:4,maxWidth:560},scenePeople:{flexDirection:'row',alignItems:'center',gap:8,marginTop:10},scenePeopleText:{color:colors.text,fontSize:11,fontWeight:'800'},day:{alignSelf:'center',color:colors.dimmed,fontSize:10,letterSpacing:1.1,fontWeight:'800',marginVertical:8},messageRow:{width:'86%',maxWidth:680,minWidth:0,flexDirection:'row',alignItems:'flex-end',gap:7},assistantRow:{alignSelf:'flex-start'},userRow:{alignSelf:'flex-end',justifyContent:'flex-end'},bubble:{minWidth:0,maxWidth:'100%',flexShrink:1,paddingHorizontal:14,paddingVertical:10,borderRadius:radius.md},assistantBubble:{backgroundColor:colors.surface,borderBottomLeftRadius:4,borderWidth:1,borderColor:'rgba(255,255,255,.06)'},userBubble:{backgroundColor:colors.roseSoft,borderBottomRightRadius:4,shadowColor:colors.rose,shadowOpacity:.18,shadowRadius:10,shadowOffset:{width:0,height:4}},failed:{borderWidth:1,borderColor:colors.danger,opacity:.75},messageText:{minWidth:0,maxWidth:'100%',flexShrink:1,color:colors.text,fontSize:15,lineHeight:22,...(Platform.OS==='web'?({overflowWrap:'anywhere',wordBreak:'break-word'} as never):{})},messageMedia:{width:300,maxWidth:'100%',height:238,marginTop:10},messageMeta:{flexDirection:'row',justifyContent:'flex-end',alignItems:'center',gap:8,marginTop:5},timestamp:{color:'rgba(255,255,255,.48)',fontSize:9},cursor:{color:colors.rose},typing:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:8,marginLeft:35,paddingHorizontal:12,paddingVertical:10,borderRadius:16,backgroundColor:colors.surface},typingDots:{flexDirection:'row',gap:3},dot:{width:5,height:5,borderRadius:3,backgroundColor:colors.rose,opacity:.5},typingText:{color:colors.muted,fontSize:12,fontStyle:'italic'},suggestions:{gap:8,marginTop:8},suggestionLabel:{color:colors.dimmed,fontSize:9,fontWeight:'900',letterSpacing:1.1},suggestion:{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:11,paddingVertical:9,borderRadius:radius.pill,borderWidth:1,borderColor:'rgba(216,62,234,.24)',backgroundColor:'rgba(216,62,234,.06)'},suggestionText:{color:'#FFB4CC',fontSize:11,fontWeight:'700'},empty:{alignSelf:'center',width:'100%',maxWidth:520,backgroundColor:colors.surface,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,padding:spacing.lg,gap:9,marginVertical:12},emptyTitle:{color:colors.text,fontFamily:'Georgia',fontSize:21},emptyCopy:{color:colors.muted,fontSize:13,lineHeight:19},emptyPrompt:{flexDirection:'row',justifyContent:'space-between',paddingVertical:8,borderTopWidth:1,borderTopColor:colors.border},retry:{alignSelf:'center',padding:10},retryText:{color:colors.danger,fontSize:12,textAlign:'center'},composerWrap:{borderTopWidth:1,borderTopColor:colors.border,backgroundColor:'rgba(8,11,19,.99)',paddingBottom:Platform.OS==='ios'?22:8},quickActions:{flexDirection:'row',gap:7,paddingHorizontal:12,paddingTop:9},quickAction:{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:9,paddingVertical:7,borderRadius:radius.pill,backgroundColor:colors.surface},quickText:{color:colors.muted,fontSize:10,fontWeight:'700'},composer:{flexDirection:'row',alignItems:'flex-end',gap:9,padding:10},input:{flex:1,maxHeight:120,minHeight:50,borderRadius:24,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,color:colors.text,paddingHorizontal:17,paddingVertical:13},send:{width:50,height:50,borderRadius:25,backgroundColor:colors.rose,alignItems:'center',justifyContent:'center',shadowColor:colors.rose,shadowOpacity:.3,shadowRadius:12,shadowOffset:{width:0,height:5}},sendDisabled:{opacity:.4},aiNote:{color:colors.dimmed,fontSize:9,textAlign:'center',paddingHorizontal:12},contextPortrait:{width:'100%',height:190,borderRadius:radius.lg},contextName:{fontFamily:'Georgia',fontSize:27,color:colors.text,marginTop:-8},contextBio:{color:colors.muted,fontSize:11,marginTop:-14},contextLine:{flexDirection:'row',gap:8,padding:11,borderRadius:radius.md,backgroundColor:colors.surface},contextLineTitle:{color:colors.text,fontSize:12,fontWeight:'800'},contextCopy:{flex:1,color:colors.muted,fontSize:11,lineHeight:16},contextMuted:{color:colors.dimmed,fontSize:11,lineHeight:16},threadCard:{flexDirection:'row',alignItems:'center',gap:9,padding:11,borderRadius:radius.md,backgroundColor:'rgba(216,62,234,.08)',borderWidth:1,borderColor:'rgba(216,62,234,.18)'},threadTitle:{color:colors.rose,fontSize:10,fontWeight:'900'},memoryLine:{flexDirection:'row',gap:8,alignItems:'flex-start'},planButton:{minHeight:46,borderRadius:radius.md,backgroundColor:colors.rose,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},planButtonText:{color:'#fff',fontWeight:'800',fontSize:13},secondaryButton:{minHeight:46,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},secondaryButtonText:{color:colors.text,fontWeight:'800',fontSize:13},planTray:{flexDirection:'row',alignItems:'center',gap:8,padding:10,borderBottomWidth:1,borderBottomColor:colors.border,backgroundColor:colors.elevated},photoTray:{padding:12,gap:10,borderBottomWidth:1,borderBottomColor:colors.border,backgroundColor:colors.elevated},photoChoices:{flexDirection:'row',flexWrap:'wrap',gap:7},photoChoice:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,paddingVertical:8,borderRadius:radius.pill,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},photoChoiceText:{color:colors.text,fontSize:10,fontWeight:'700'},planTitle:{color:colors.text,fontWeight:'800',fontSize:12},planChoice:{paddingHorizontal:10,paddingVertical:8,borderRadius:radius.pill,backgroundColor:colors.rose},planChoiceText:{color:'#fff',fontSize:10,fontWeight:'800'},closeText:{color:colors.muted,fontSize:10,fontWeight:'700'},feedback:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:radius.lg,backgroundColor:'rgba(154,104,255,.10)',borderWidth:1,borderColor:'rgba(154,104,255,.25)',marginTop:8},feedbackIcon:{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface},feedbackTitle:{color:colors.text,fontWeight:'900',fontSize:12},feedbackBody:{color:colors.muted,fontSize:11,lineHeight:16,marginTop:2},feedbackAction:{paddingHorizontal:10,paddingVertical:7,borderRadius:radius.pill,backgroundColor:colors.rose},feedbackActionText:{color:'#fff',fontWeight:'800',fontSize:10},milestoneCard:{alignSelf:'center',width:'100%',maxWidth:560,marginTop:10,padding:18,borderRadius:radius.xl,backgroundColor:'rgba(84,37,74,.88)',borderWidth:1,borderColor:'rgba(216,62,234,.34)',shadowColor:colors.rose,shadowOpacity:.16,shadowRadius:18,shadowOffset:{width:0,height:8}},milestoneTense:{backgroundColor:'rgba(75,48,36,.88)',borderColor:'rgba(242,162,127,.38)'},milestoneIcon:{width:38,height:38,borderRadius:19,backgroundColor:'rgba(255,255,255,.07)',alignItems:'center',justifyContent:'center',marginBottom:10},milestoneKicker:{color:'#FFB4CC',fontSize:9,fontWeight:'900',letterSpacing:1.3},milestoneTitle:{fontFamily:'Georgia',fontSize:23,color:colors.text,marginTop:6},milestoneBody:{color:'#E8DDE5',fontSize:13,lineHeight:19,marginTop:7},milestonePrompt:{color:colors.text,fontSize:12,fontWeight:'800',marginTop:14},milestoneChoices:{gap:8,marginTop:10},milestoneChoice:{minHeight:44,borderRadius:radius.md,borderWidth:1,borderColor:'rgba(255,255,255,.14)',alignItems:'center',justifyContent:'center',paddingHorizontal:12},milestoneChoicePrimary:{backgroundColor:colors.rose,borderColor:colors.rose},milestoneChoiceText:{color:colors.text,fontSize:12,fontWeight:'800'},milestoneChoicePrimaryText:{color:'#fff'},olderLoading:{color:colors.muted,fontSize:11,textAlign:'center',paddingVertical:7},historyStart:{color:colors.dimmed,fontSize:10,textAlign:'center',paddingVertical:7}
  ,chatGlowLayer:{position:'absolute',top:0,right:0,bottom:0,left:0,overflow:'hidden'}
  ,chatGlow:{position:'absolute',borderRadius:999,backgroundColor:'rgba(156,68,196,.035)',...(Platform.OS==='web'?({filter:'blur(62px)'} as never):{})}
  ,chatGlowRose:{width:620,height:620,top:'14%',right:-250,backgroundColor:'rgba(216,62,234,.055)',...(Platform.OS==='web'?({backgroundImage:'radial-gradient(circle, rgba(216,62,234,.15) 0%, rgba(164,46,182,.055) 44%, transparent 73%)'} as never):{})}
  ,chatGlowViolet:{width:540,height:540,bottom:'5%',left:-250,backgroundColor:'rgba(120,72,210,.045)',...(Platform.OS==='web'?({backgroundImage:'radial-gradient(circle, rgba(130,83,220,.13) 0%, rgba(93,56,166,.045) 48%, transparent 74%)'} as never):{})}
  ,chatGlowCenter:{width:430,height:430,top:'44%',left:'30%',backgroundColor:'rgba(115,42,133,.025)',...(Platform.OS==='web'?({backgroundImage:'radial-gradient(circle, rgba(172,65,178,.075) 0%, transparent 70%)'} as never):{})}
  ,chatGlowRoseCompact:{width:420,height:420,right:-210,top:'18%',opacity:.72}
  ,chatGlowVioletCompact:{width:380,height:380,left:-210,bottom:'8%',opacity:.66}
  ,chatGlowCenterCompact:{width:300,height:300,left:'22%',opacity:.55}
  ,planScroll:{flex:1,minWidth:0}
  ,planScrollContent:{paddingBottom:24}
  ,quickActionFitted:{flex:1,minWidth:0,justifyContent:'center',paddingHorizontal:6}
  ,quickTextFitted:{flexShrink:1}
  ,inputFitted:{minWidth:0}
  ,headerIdentity:{flex:1,minWidth:0}
  ,menuFavorite:{minHeight:38,paddingHorizontal:9,borderRadius:radius.sm,flexDirection:'row',alignItems:'center',gap:8}
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
  ,actionCard:{alignSelf:'center',width:'100%',maxWidth:560,flexDirection:'row',gap:12,padding:14,borderRadius:radius.lg,backgroundColor:'rgba(33,23,44,.96)',borderWidth:1,borderColor:'rgba(216,62,234,.30)',marginVertical:6}
  ,actionIcon:{width:38,height:38,borderRadius:19,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(216,62,234,.10)'}
  ,actionKicker:{color:colors.rose,fontSize:9,fontWeight:'900',letterSpacing:1.2}
  ,actionTitle:{color:colors.text,fontSize:14,fontWeight:'900',marginTop:4,marginBottom:3}
  ,actionButtons:{flexDirection:'row',gap:8,marginTop:11}
  ,actionPrimary:{minHeight:36,paddingHorizontal:13,borderRadius:radius.pill,alignItems:'center',justifyContent:'center',backgroundColor:colors.rose}
  ,actionPrimaryText:{color:'#fff',fontSize:10,fontWeight:'900'}
  ,actionSecondary:{minHeight:36,paddingHorizontal:13,borderRadius:radius.pill,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border}
  ,actionSecondaryText:{color:colors.muted,fontSize:10,fontWeight:'800'}
  ,locationPlanCard:{alignSelf:'center',width:'100%',maxWidth:560,borderRadius:22,overflow:'hidden',backgroundColor:'rgba(26,18,35,.98)',borderWidth:1,borderColor:'rgba(216,62,234,.36)',marginVertical:8,shadowColor:'#000',shadowOpacity:.28,shadowRadius:18,shadowOffset:{width:0,height:8}}
  ,locationPlanHero:{height:190,justifyContent:'flex-end'}
  ,locationPlanShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(8,6,13,.47)'}
  ,locationPlanHeroContent:{padding:17,gap:5}
  ,locationPlanKickerRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10}
  ,locationPlanKicker:{color:'#FFD1E0',fontSize:9,fontWeight:'900',letterSpacing:1.3}
  ,locationPlanClose:{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(8,6,13,.55)',borderWidth:1,borderColor:'rgba(255,255,255,.18)'}
  ,locationPlanTitle:{color:'#fff',fontFamily:'Georgia',fontSize:25,lineHeight:30,maxWidth:'88%'}
  ,locationPlanCopy:{color:'#F0DFE7',fontSize:11,fontWeight:'700'}
  ,locationPlanBody:{padding:14,gap:9}
  ,locationPlanQuickRow:{flexDirection:'row',gap:8}
  ,locationPlanPrimary:{flex:1,minHeight:44,paddingHorizontal:13,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:colors.rose}
  ,locationPlanPrimaryText:{color:'#fff',fontSize:10,fontWeight:'900',letterSpacing:.5}
  ,locationPlanSecondary:{flex:1,minHeight:44,paddingHorizontal:13,borderRadius:14,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(216,62,234,.09)',borderWidth:1,borderColor:'rgba(216,62,234,.35)'}
  ,locationPlanSecondaryText:{color:colors.text,fontSize:10,fontWeight:'900',letterSpacing:.4}
  ,locationPlanCustom:{minHeight:43,paddingHorizontal:12,borderRadius:14,flexDirection:'row',alignItems:'center',gap:8,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface}
  ,locationPlanCustomText:{flex:1,color:colors.text,fontSize:10,fontWeight:'900',letterSpacing:.4}
  ,locationPlanFields:{gap:9,padding:11,borderRadius:14,backgroundColor:'rgba(255,255,255,.025)',borderWidth:1,borderColor:colors.border}
  ,locationPlanError:{color:colors.danger,fontSize:11,lineHeight:16}
  ,mobileCommitment:{minHeight:38,marginHorizontal:12,marginTop:8,paddingHorizontal:11,borderRadius:radius.pill,flexDirection:'row',alignItems:'center',gap:7,backgroundColor:'rgba(216,62,234,.08)',borderWidth:1,borderColor:'rgba(216,62,234,.20)'}
  ,mobileCommitmentText:{flex:1,color:colors.text,fontSize:11,fontWeight:'800'}
  ,planTarget:{padding:10,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,marginTop:7}
  ,timelinePlan:{alignSelf:'center',width:'100%',maxWidth:560,borderRadius:radius.lg,backgroundColor:'rgba(216,62,234,.07)',borderWidth:1,borderColor:'rgba(216,62,234,.22)',marginVertical:6,overflow:'hidden'}
  ,timelinePlanBody:{minHeight:72,flexDirection:'row',alignItems:'center',gap:11,paddingHorizontal:14,paddingVertical:12}
  ,timelinePlanPressed:{backgroundColor:'rgba(216,62,234,.08)'}
  ,customTime:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8}
  ,dateInput:{flex:2,minWidth:150,minHeight:40,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,color:colors.text,paddingHorizontal:12}
  ,timeInput:{flex:1,minWidth:90,minHeight:40,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,color:colors.text,paddingHorizontal:12}
  ,focusChip:{flexDirection:'row',alignItems:'center',marginHorizontal:12,marginTop:7,borderRadius:radius.pill,backgroundColor:'rgba(216,62,234,.08)',borderWidth:1,borderColor:'rgba(216,62,234,.22)',overflow:'hidden'}
  ,focusChipMain:{minWidth:0,flex:1,flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:11,paddingVertical:8}
  ,focusLabel:{color:colors.rose,fontSize:9,fontWeight:'900',textTransform:'uppercase'}
  ,focusTitle:{minWidth:0,flex:1,color:colors.text,fontSize:10,fontWeight:'800'}
  ,focusClose:{width:38,minHeight:34,alignItems:'center',justifyContent:'center',borderLeftWidth:1,borderLeftColor:colors.border}
  ,focusCloseText:{color:colors.muted,fontSize:19,lineHeight:20}
  ,intentRow:{flexDirection:'row',flexWrap:'wrap',gap:7}
  ,intentChip:{paddingHorizontal:11,paddingVertical:9,borderRadius:radius.pill,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border}
  ,intentChipActive:{borderColor:colors.rose,backgroundColor:'rgba(216,62,234,.10)'}
  ,intentText:{color:colors.text,fontSize:10,fontWeight:'800'}
  ,pickCard:{gap:7,padding:15,borderRadius:radius.lg,backgroundColor:'rgba(216,62,234,.08)',borderWidth:1,borderColor:'rgba(216,62,234,.25)'}
  ,pickQuote:{color:'#F8D9E5',fontFamily:'Georgia',fontSize:15,lineHeight:21}
  ,pickName:{color:colors.text,fontFamily:'Georgia',fontSize:23,marginTop:2}
  ,bestTime:{color:colors.text,fontSize:15,fontWeight:'900',marginTop:5}
  ,bestReason:{color:colors.warm,fontSize:10,fontWeight:'800',marginBottom:4}
  ,alternateTimes:{flexDirection:'row',flexWrap:'wrap',gap:7}
  ,timeChip:{flex:1,minWidth:130,padding:10,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface}
  ,timeChipTitle:{color:colors.text,fontSize:10,fontWeight:'900'}
  ,timeChipDetail:{color:colors.muted,fontSize:9,marginTop:3}
  ,timelineActions:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8,paddingHorizontal:12,paddingTop:9,paddingBottom:11,borderTopWidth:1,borderTopColor:'rgba(216,62,234,.14)'}
  ,timelineStart:{minHeight:36,flexGrow:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:12,borderRadius:radius.pill,backgroundColor:colors.rose}
  ,timelineStartText:{color:'#fff',fontSize:10,fontWeight:'900'}
  ,timelineCancel:{minHeight:36,flexGrow:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:12,borderRadius:radius.pill,borderWidth:1,borderColor:'rgba(255,93,121,.27)',backgroundColor:'rgba(255,93,121,.045)'}
  ,timelineCancelText:{color:colors.danger,fontSize:10,fontWeight:'900'}
  ,timelineActionDisabled:{opacity:.4}
  ,interactionSuggestion:{borderColor:'rgba(242,162,127,.38)',backgroundColor:'rgba(242,162,127,.08)'}
  ,contextualTray:{gap:8,paddingHorizontal:12,paddingVertical:10,borderTopWidth:1,borderTopColor:colors.border,backgroundColor:colors.elevated}
  ,contextualTrayHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}
  ,contextualMore:{color:colors.rose,fontSize:10,fontWeight:'900'}
  ,contextualTrayActions:{gap:8,paddingRight:16}
  ,contextualAction:{minHeight:38,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:11,borderRadius:radius.pill,backgroundColor:'rgba(216,62,234,.08)',borderWidth:1,borderColor:'rgba(216,62,234,.24)'}
  ,contextualActionText:{color:colors.text,fontSize:11,fontWeight:'800'}
  ,interactionTray:{gap:10,padding:12,borderTopWidth:1,borderTopColor:colors.border,backgroundColor:colors.elevated,maxHeight:360}
  ,interactionSectionTitle:{color:colors.dimmed,fontSize:9,fontWeight:'900',letterSpacing:1.2,marginTop:2}
  ,interactionOptions:{flexDirection:'row',flexWrap:'wrap',gap:8}
  ,interactionOption:{flexBasis:'48%',flexGrow:1,minWidth:190,flexDirection:'row',alignItems:'center',gap:9,padding:11,borderRadius:radius.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border}
  ,interactionOptionTitle:{color:colors.text,fontSize:12,fontWeight:'900'}
  ,interactionOptionMeta:{color:colors.muted,fontSize:10,marginTop:3}
  ,characterProposal:{alignSelf:'center',width:'100%',maxWidth:660,flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:9,padding:12,borderRadius:radius.lg,backgroundColor:'rgba(154,104,255,.12)',borderWidth:1,borderColor:'rgba(216,62,234,.28)',marginTop:8,shadowColor:colors.rose,shadowOpacity:.13,shadowRadius:14,shadowOffset:{width:0,height:6}}
  ,characterProposalIcon:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(216,62,234,.13)'}
  ,characterProposalKicker:{color:'#FFB4CC',fontSize:8,fontWeight:'900',letterSpacing:1.1}
  ,characterProposalTitle:{color:colors.text,fontSize:13,fontWeight:'900',marginTop:3}
  ,proposalPrimary:{minHeight:34,justifyContent:'center',paddingHorizontal:13,borderRadius:radius.pill,backgroundColor:colors.rose}
  ,proposalPrimaryText:{color:'#fff',fontSize:10,fontWeight:'900'}
  ,proposalSecondary:{minHeight:34,justifyContent:'center',paddingHorizontal:10,borderRadius:radius.pill}
  ,proposalSecondaryText:{color:colors.muted,fontSize:10,fontWeight:'800'}
  ,sceneActionFeedback:{alignSelf:'center',flexDirection:'row',alignItems:'center',gap:7,paddingHorizontal:12,paddingVertical:8,borderRadius:radius.pill,backgroundColor:'rgba(216,62,234,.08)',borderWidth:1,borderColor:'rgba(216,62,234,.20)',marginTop:8}
  ,sceneActionFeedbackText:{color:'#FFC0D4',fontSize:11,fontWeight:'800'}
  ,speakerName:{color:colors.rose,fontSize:10,fontWeight:'900',letterSpacing:.4,marginBottom:4}
  ,userAttachment:{width:300,maxWidth:'100%',height:260,borderRadius:radius.md,marginTop:8,backgroundColor:colors.elevated}
  ,listenButton:{alignSelf:'flex-start',flexDirection:'row',alignItems:'center',gap:6,marginTop:8,paddingHorizontal:10,paddingVertical:7,borderRadius:radius.pill,backgroundColor:'rgba(216,62,234,.08)',borderWidth:1,borderColor:'rgba(216,62,234,.18)'}
  ,listenButtonLocked:{backgroundColor:'rgba(255,255,255,.025)',borderColor:colors.border}
  ,listenText:{color:colors.rose,fontSize:10,fontWeight:'800'}
  ,listenTextLocked:{color:colors.muted}
  ,voiceNote:{width:'100%',minWidth:190,marginTop:8,flexDirection:'row',alignItems:'center',gap:9,padding:8,borderRadius:radius.md,backgroundColor:'rgba(255,255,255,.05)'}
  ,voiceNoteText:{flex:1,color:colors.text,fontSize:11,fontWeight:'700'}
  ,voicePlayButton:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:colors.rose}
  ,voiceProgressWrap:{flex:1,gap:4}
  ,voiceProgress:{height:6,borderRadius:3,overflow:'hidden',backgroundColor:'rgba(255,255,255,.12)'}
  ,voiceProgressFill:{height:'100%',borderRadius:3,backgroundColor:colors.rose}
  ,voiceDuration:{color:colors.muted,fontSize:9,fontVariant:['tabular-nums']}
  ,voiceCallEvent:{alignSelf:'center',width:'100%',maxWidth:560,marginVertical:8,borderRadius:radius.lg,borderWidth:1,borderColor:'rgba(216,62,234,.18)',backgroundColor:'rgba(255,255,255,.035)',overflow:'hidden'}
  ,voiceCallEventHeader:{minHeight:62,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:13,paddingVertical:10}
  ,voiceCallEventIcon:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(216,62,234,.10)'}
  ,voiceCallEventTitle:{color:colors.text,fontSize:12,fontWeight:'900'}
  ,voiceCallEventMeta:{color:colors.muted,fontSize:9,marginTop:3}
  ,voiceCallTranscript:{paddingHorizontal:13,paddingBottom:12,gap:9,borderTopWidth:1,borderTopColor:'rgba(255,255,255,.06)'}
  ,voiceCallTurn:{paddingTop:10}
  ,voiceCallSpeaker:{color:colors.rose,fontSize:8,fontWeight:'900',letterSpacing:.8}
  ,voiceCallText:{color:colors.textSecondary,fontSize:11,lineHeight:17,marginTop:2}
  ,sceneAvatarStack:{flexDirection:'row',alignItems:'center'}
  ,sceneStackedAvatar:{borderRadius:16,borderWidth:1,borderColor:'rgba(255,255,255,.55)'}
  ,sceneStackedAvatarOverlap:{marginLeft:-8}
  ,sharedSceneInvite:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8,padding:11,marginBottom:4,borderRadius:radius.lg,borderWidth:1,borderColor:'rgba(154,104,255,.28)',backgroundColor:'rgba(154,104,255,.09)'}
  ,sharedSceneInviteKicker:{color:colors.violet,fontSize:9,fontWeight:'900',letterSpacing:1.1}
  ,sharedSceneInviteText:{color:colors.text,fontSize:11,fontWeight:'700',marginTop:2}
  ,sharedSceneInviteButton:{paddingHorizontal:10,paddingVertical:8,borderRadius:radius.pill,backgroundColor:colors.violet}
  ,sharedSceneInviteButtonText:{color:'#fff',fontSize:10,fontWeight:'900'}
  ,attachmentPreview:{marginHorizontal:12,marginTop:10,flexDirection:'row',alignItems:'center',gap:10,padding:9,borderRadius:radius.md,backgroundColor:'rgba(216,62,234,.08)',borderWidth:1,borderColor:'rgba(216,62,234,.22)'}
  ,attachmentPreviewImage:{width:58,height:58,borderRadius:radius.sm,backgroundColor:colors.elevated}
  ,attachmentPreviewTitle:{color:colors.text,fontSize:11,fontWeight:'900'}
  ,attachmentPreviewMeta:{color:colors.muted,fontSize:9,marginTop:2}
  ,attachmentReplace:{color:colors.rose,fontSize:10,fontWeight:'800',marginTop:5}
  ,attachmentRemove:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface}
  ,composerInputShell:{flex:1,minWidth:0,minHeight:54,maxHeight:124,flexDirection:'row',alignItems:'flex-end',gap:4,paddingLeft:5,paddingRight:4,borderRadius:27,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border}
  ,composerInputSuggested:{borderColor:'rgba(203,168,255,.48)',backgroundColor:'rgba(70,42,108,.28)',shadowColor:'#8F5BFF',shadowOpacity:.18,shadowRadius:10,shadowOffset:{width:0,height:3}}
  ,autoDialogueInline:{flexDirection:'row',alignItems:'center',gap:2,marginRight:3,marginBottom:9}
  ,autoDialogueInlineAction:{width:29,height:29,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(154,104,255,.14)'}
  ,autoDialogueOptionsFrame:{width:'100%',maxWidth:520}
  ,autoDialogueOptionsModal:{width:'100%',padding:20,borderRadius:radius.xl,borderColor:'rgba(201,168,255,.28)',backgroundColor:'rgba(28,21,39,.92)',shadowColor:'#7A42E8',shadowOpacity:.3,shadowRadius:28,shadowOffset:{width:0,height:14}}
  ,autoDialogueOptionsHeader:{flexDirection:'row',alignItems:'flex-start',gap:12,paddingBottom:17}
  ,autoDialogueOptionsIcon:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(100,61,167,.34)',borderWidth:1,borderColor:'rgba(203,168,255,.2)'}
  ,autoDialogueOptionsTitle:{fontFamily:'Georgia',fontSize:24,color:colors.text}
  ,autoDialogueOptionsCopy:{color:colors.textSecondary,fontSize:11,lineHeight:16,marginTop:3}
  ,autoDialogueOptionsClose:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.06)'}
  ,autoDialogueOptionsList:{gap:8}
  ,autoDialogueOption:{minHeight:62,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,paddingVertical:9,borderRadius:radius.md,backgroundColor:'rgba(255,255,255,.045)',borderWidth:1,borderColor:'rgba(203,168,255,.14)'}
  ,autoDialogueOptionSpark:{width:31,height:31,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(154,104,255,.13)'}
  ,autoDialogueOptionLabel:{color:colors.text,fontSize:12,fontWeight:'900'}
  ,autoDialogueOptionDetail:{color:colors.muted,fontSize:10,lineHeight:14,marginTop:2}
  ,suggestButton:{backgroundColor:colors.violet,shadowColor:colors.violet}
  ,conversationLoading:{alignSelf:'center',width:'100%',maxWidth:560,minHeight:76,flexDirection:'row',alignItems:'center',gap:12,padding:14,borderRadius:radius.lg,backgroundColor:'rgba(255,255,255,.035)',borderWidth:1,borderColor:colors.border}
  ,conversationLoadingAvatar:{width:38,height:38,borderRadius:19,backgroundColor:'rgba(216,62,234,.13)'}
  ,conversationLoadingLine:{height:9,width:'72%',borderRadius:5,backgroundColor:'rgba(255,255,255,.09)'}
  ,conversationLoadingLineShort:{width:'46%'}
  ,conversationLoadingText:{color:colors.dimmed,fontSize:10,fontWeight:'800'}
  ,embeddedInput:{backgroundColor:'transparent',borderWidth:0,borderRadius:0,paddingLeft:4,paddingRight:10}
  ,aiMediaButton:{position:'relative',width:44,height:44,borderRadius:22,marginBottom:4,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(70,42,108,.72)',borderWidth:1,borderColor:'rgba(203,168,255,.48)',shadowColor:'#8F5BFF',shadowOpacity:.4,shadowRadius:13,shadowOffset:{width:0,height:3}}
  ,aiMediaPressed:{transform:[{scale:.96}],backgroundColor:'rgba(88,48,137,.94)'}
  ,aiMediaGlow:{position:'absolute',width:42,height:42,borderRadius:21,backgroundColor:'rgba(139,80,255,.25)',borderWidth:1,borderColor:'rgba(220,196,255,.28)'}
  ,composerAligned:{alignItems:'center',paddingHorizontal:10,paddingVertical:9}
  ,composerInputShellAligned:{alignItems:'center',paddingLeft:5,paddingRight:5,paddingVertical:4}
  ,autoDialogueInlineAligned:{marginRight:1,marginBottom:0}
  ,embeddedInputAligned:{minHeight:44,paddingLeft:4,paddingRight:7,paddingVertical:10}
  ,aiMediaButtonAligned:{width:42,height:42,borderRadius:21,marginBottom:0}
  ,dictationButton:{position:'relative',flexShrink:0,width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',overflow:'visible',backgroundColor:'rgba(100,61,167,.18)',borderWidth:1,borderColor:'rgba(203,168,255,.22)'}
  ,dictationRecording:{backgroundColor:'rgba(225,65,99,.84)',borderColor:'rgba(255,180,200,.82)'}
  ,dictationPulse:{position:'absolute',top:2,left:2,right:2,bottom:2,borderRadius:20,backgroundColor:'#FF6F91'}
  ,mediaModalBackdrop:{flex:1,alignItems:'center',justifyContent:'center',padding:20}
  ,mediaModalFrame:{width:'100%',maxWidth:520}
  ,mediaModal:{width:'100%',alignItems:'center',paddingHorizontal:28,paddingTop:36,paddingBottom:24,borderRadius:radius.xl,borderColor:'rgba(201,168,255,.28)',backgroundColor:'rgba(28,21,39,.84)',shadowColor:'#7A42E8',shadowOpacity:.3,shadowRadius:28,shadowOffset:{width:0,height:14}}
  ,mediaModalClose:{position:'absolute',zIndex:2,right:14,top:14,width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(255,255,255,.06)'}
  ,mediaModalIconWrap:{position:'relative',width:82,height:82,borderRadius:41,alignItems:'center',justifyContent:'center',backgroundColor:'rgba(100,61,167,.32)',borderWidth:1,borderColor:'rgba(203,168,255,.2)',marginBottom:18}
  ,mediaModalIconGlow:{position:'absolute',width:104,height:104,borderRadius:52,backgroundColor:'rgba(118,70,216,.13)'}
  ,mediaModalSpark:{position:'absolute',right:15,top:16}
  ,mediaModalTitle:{fontFamily:'Georgia',fontSize:28,color:colors.text,textAlign:'center'}
  ,mediaModalCopy:{maxWidth:410,color:colors.textSecondary,fontSize:14,lineHeight:21,textAlign:'center',marginTop:11,marginBottom:22}
  ,mediaPrimaryAction:{width:'100%',minHeight:56,borderRadius:radius.md,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,backgroundColor:'#7545F5',borderWidth:1,borderColor:'rgba(255,255,255,.2)',shadowColor:'#7E4CFF',shadowOpacity:.42,shadowRadius:18,shadowOffset:{width:0,height:8}}
  ,mediaPrimaryText:{color:'#fff',fontSize:15,fontWeight:'900'}
  ,mediaOptionLabel:{alignSelf:'flex-start',color:colors.dimmed,fontSize:9,fontWeight:'900',letterSpacing:1.2,marginTop:19,marginBottom:8}
  ,mediaOptions:{width:'100%',flexDirection:'row',flexWrap:'wrap',gap:8}
  ,mediaOption:{flex:1,minWidth:125,minHeight:44,paddingHorizontal:11,borderRadius:radius.md,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,backgroundColor:'rgba(255,255,255,.055)',borderWidth:1,borderColor:'rgba(203,168,255,.16)'}
  ,mediaOptionText:{color:colors.text,fontSize:10,fontWeight:'800',textAlign:'center'}
  ,mediaShareAction:{marginTop:17,minHeight:38,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingHorizontal:13,borderRadius:radius.pill,backgroundColor:'rgba(239,82,137,.08)',borderWidth:1,borderColor:'rgba(239,82,137,.18)'}
  ,mediaShareText:{color:'#FFADCA',fontSize:11,fontWeight:'800'}
  ,mediaCancel:{paddingHorizontal:18,paddingTop:17,paddingBottom:2}
  ,mediaCancelText:{color:colors.muted,fontSize:12,fontWeight:'700'}
  ,messageStack:{minWidth:0,maxWidth:'100%',flexShrink:1,gap:6}
});

