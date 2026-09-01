import { Children, isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type FlatListProps } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Brain, CalendarDays, Camera, Check, ChevronRight, Copy, FastForward, Flag, Heart, ImagePlus, LockKeyhole, MapPin, MessageCircle, Mic, MoreHorizontal, Pause, Phone, Play, Send, Sparkles, Square, Trash2, Undo2, Volume2, Wand2, X } from 'lucide-react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MESSAGE_CHARACTER_LIMIT, messageCharacterLimitError } from '@together/domain/src/message-limits';
import { isPhotoOnlyConversationMessage } from '@together/domain/src/media';
import { shouldGroupChatMessages } from '@together/domain/src/group-chat';
import { preservedPrependOffset, shouldKeepChatPinned, shouldLoadOlderChatMessages } from '../src/lib/chatScroll';
import { CharacterAvatar, CharacterMentionText, CharacterProfilePreviewModal, ChatConversationRail, ChatPhotoRequestCard, ConnectionBanner, ConversationOverflowMenu, DateTimeFields, EndPlanConfirmation, ErrorState, FailedMessageRecovery, FrostedBackdrop, FrostedSurface, JumpToLatestButton, LoadingSkeleton, MediaRequestModal, MediaTile, MemorySavedToast, MessageActionSheet, MessageCharacterCounter, MobileChatContextCard, MobileChatMediaHeader, PhotoSharingPaywallModal, PlanDetailsModal, PlanJoinBar, VoiceNotePurchaseModal, resolveCharacterPortraitSource, type MessageActionDefinition } from '../src/components';
import { characterAssets, cityLifeAsset, locationHeroAsset, worldHeroAsset } from '../src/assets';
import { colors, radius, spacing } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { ApiError, confirmConversationAction, confirmUserImage, createSharedPlan, deleteConversationAttachment, dismissConversationAction, ensureConversation, manageConversation, manageInteraction, manageMedia, manageSharedScene, meetCompanion, mutateMemory, prepareUserImage, quoteVoiceNote, refreshVoiceNote, rememberMessage, removePendingAttachment, reportMessage, requestVoiceNote, resolveRelationshipMilestone, sendDialogue, sendSceneReaction, setCharacterFavorite, setConversationPinned, setMessageFavorite, simulate, suggestDialogue } from '../src/lib/api';
import { supabase } from '../src/lib/supabase';
import type { AutoDialoguePreference, AutoDialogueSuggestion, CharacterInstance, CharacterInteractionProposal, ConversationAction, ConversationAttachment, ConversationEvent, GeneratedMedia, InteractionCandidate, MediaOffer,Message, MessageReaction, PlanExperience, RelationshipMilestone, SceneAction, SceneParticipant, SceneSession, SharedPlan, Snapshot } from '../src/types';
import { mergeOlderMessages, scopedConversationMessages } from '../src/lib/conversation';
import { resolveChatRoute, type ChatRouteParams } from '../src/lib/chatRoute';
import { confirmAction } from '../src/lib/dialogs';
import { defaultPlanTimeFields, parseCustomPlanTime, type PlanOption, type PlanTimingSelection } from '../src/lib/plans';
import { PlanSelection } from '../src/components/PlanSelection';
import { ChatSettingsModal } from '../src/components/ChatSettingsModal';
import { buildClientConversationContext, type ClientConversationContext } from '../src/lib/conversationContext';
import { chatMessageTypography } from '../src/lib/chatSettings';
import { createClientRequestId } from '../src/lib/requestId';
import { characterCatalogForWorld, characterResidentWorld, worldForLocation } from '../src/lib/place';
import type { FeaturedCompanion } from '../src/lib/featuredCompanions';
import { presentMemoryText } from '../src/lib/memoryPresentation';
import { mediaWithoutActivePhotoOffer, photoMediaForOffer, photoOfferForMessage, photoOffersWithoutVisibleMessages, shouldShowPhotoGenerationPending, visibleChatPhotoMedia } from '../src/lib/photoRequestPresentation';
import { latestMediaOfferPreviewUri } from '../src/lib/mediaOfferPresentation';
import { interactionFeedback, interactionFeedbackCopy, proposalHeading, type InteractionFeedbackPresentation } from '../src/lib/interactionPresentation';
import { dialogueFailureMayHavePersisted } from '../src/lib/dialogueRecovery';
import { reconcileMessages } from '../src/lib/messageReconciliation';
import { endPlanExperience, getPlanExperience, joinCommitment, switchPlanExperience } from '../src/lib/commitments';
import { activePlanForChat, attendedPlansForLifecycleReconciliation, collapsePlanTimelineEvents, isPlanLifecycleDividerEvent, joinablePlanForChat, planActionAvailability, planLifecycleDividerLabel, shouldShowPlanConversationAction, shouldShowPlanTimelineEvent } from '../src/lib/planActions';
import { hideVoiceNoteConfirmation, isVoiceNoteConfirmationHidden } from '../src/lib/voiceNoteConfirmation';
import { chatSessionRouteKey, conversationWithLastMessage, isConversationPinned, returnToMessagesInbox } from '../src/lib/messageInbox';
import { clearChatScrollPosition, readChatScrollPosition, restoredChatOffset, saveChatScrollPosition, shouldRestoreChatScrollPosition, type ChatScrollPosition } from '../src/lib/chatNavigationState';
import { mergeDictationTranscript } from '../src/lib/dictation';
import { useChatDictation, type ChatDictationPhase } from '../src/hooks/useChatDictation';
import { cleanupNormalizedImage, normalizeUserImage, userImagePickerOptions } from '../src/lib/imageUploads';
import { photoUploadPresentation, type PhotoUploadPhase } from '../src/lib/photoUploadPresentation';
import { privateStoredImageSource } from '../src/lib/mediaImageSource';
import { isTransientMediaFetchFailure, mediaReconciliationComplete } from '../src/lib/mediaReconciliation';
import { shouldConsumeComposerEnter, shouldSendComposerOnEnter } from '../src/lib/composerKeyboard';
import { useAuth } from '../src/hooks/useAuth';
import { useNetworkStatus } from '../src/providers/NetworkStatusProvider';
import { usePersistentMessageDraft } from '../src/hooks/usePersistentMessageDraft';
import { wasUnreadWhenChatOpened } from '../src/lib/chatUnreadWindow';
import { latestConversationHeaderImage } from '../src/lib/chatHeaderMedia';
import { newGroupPrefillHref } from '../src/lib/groupInvite';
import { canContinueMessage, isMessageFavorite } from '../src/lib/messageActions';
import { handlePhotoSharingTap } from '../src/lib/photoSharing';
import { subscriptionHref } from '../src/lib/subscriptionPresentation';

type Feedback = { kind: 'memory'|'moment'|'plan'; title: string; body: string; id?: string };
type PendingImage={uri:string;mimeType:'image/jpeg';byteSize:number;width:number;height:number;fileName:string;temporary:true;requestId:string};
type PlanMutationResult={kind:'shared_plan'|'date';commitment:{id:string};experience?:PlanExperience};
type ConversationActionMutation={applied:boolean;candidateId:string;result?:PlanMutationResult};
type SharedSceneCharacter={id:string;current_location_id?:string|null;together_character_templates:{name:string;slug:string;public_handle?:string|null};together_character_versions?:{portrait_asset_url?:string|null;visual_identity?:Record<string,unknown>}|null};
type SharedSceneRoster={scene:SceneSession|null;participants:Array<SceneParticipant&{together_character_instances?:SharedSceneCharacter|null}>;availableCharacters:Array<SharedSceneCharacter&{presence?:Record<string,unknown>}>};
type ChatParams=ChatRouteParams;
type VoiceNoteRequestResult={status?:string;providerStatus?:string;message?:string;media?:GeneratedMedia};
type VoiceNotePrompt={messageId:string;name:string;creditCost:number;creditBalance:number;shortened:boolean};
type MemorySavedNotice={id:number;name:string};
type DirectMessageAction={messageAction:'continue';anchorMessageId:string};
const PAGE_SIZE = 50;
const MESSAGE_CACHE_CONVERSATIONS = 5;
const MESSAGE_CACHE_ROWS = 150;
type DirectMessageCache = Map<string,{messages:Message[];hasMore:boolean}>;
const directMessageCaches = new Map<string,DirectMessageCache>();

function directMessageCacheFor(userId?: string): DirectMessageCache {
  if (!userId) return new Map();
  const existing = directMessageCaches.get(userId);
  if (existing) return existing;
  const created: DirectMessageCache = new Map();
  directMessageCaches.set(userId, created);
  return created;
}

export default function Chat() {
  const params=useLocalSearchParams<ChatParams>();
  const snapshot=useTogether((state)=>state.snapshot);
  const route=resolveChatRoute(snapshot,params);
  const pendingKey=[params.conversationId,params.character,params.planId,params.world,params.location].filter(Boolean).join(':')||'recent';
  return <ChatSession key={chatSessionRouteKey(route.conversation?.id,params,pendingKey)}/>;
}

function ChatSession() {
  const params = useLocalSearchParams<ChatParams>();
  const { width } = useWindowDimensions();
  const showLeft = width >= 1080;
  const showRight = width >= 920;
  const { snapshot, refresh, setSnapshot, setCoreState, updateCompanion, upsertConversation, upsertPlan, upsertMedia, upsertSceneSession, upsertConversationAction, removeConversationAction, applyServerDelta, pendingDialogues, beginPendingDialogue, finishPendingDialogue } = useTogether();
  const{session}=useAuth(),{online,phase:connectionPhase}=useNetworkStatus();
  const {character,conversation}=resolveChatRoute(snapshot,params);
  const slug = character?.together_character_templates.slug ?? '';
  const characterHandle=character?.together_character_templates.public_handle??slug;
  const subscriptionReturnTo=characterHandle?`/chat?character=${encodeURIComponent(characterHandle)}`:'/chat';
  const creditsSubscriptionHref=subscriptionHref({intent:'credits',returnTo:subscriptionReturnTo});
  const photoSharingSubscriptionHref=subscriptionHref({intent:'photo_sharing',returnTo:`${subscriptionReturnTo}${subscriptionReturnTo.includes('?')?'&':'?'}sharePhoto=1`});
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
  const [memorySavedNotice,setMemorySavedNotice]=useState<MemorySavedNotice|null>(null);
  const [showPlans, setShowPlans] = useState(params.plan === '1');
  const [planning, setPlanning] = useState(false);
  const planRequestIdRef=useRef(createClientRequestId());
  const realtimeScopeRef=useRef(createClientRequestId());
  const [pendingActionId,setPendingActionId]=useState<string|null>(null);
  const [initialPlanTimingChoice,setInitialPlanTimingChoice]=useState<'custom'|null>(null);
  const [focusPlanId,setFocusPlanId]=useState<string|null>(params.planId??null);
  const [focusDismissed,setFocusDismissed]=useState(false);
  const [showPhotoRequests, setShowPhotoRequests] = useState(false);
  const [showPhotoPaywall,setShowPhotoPaywall]=useState(false);
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
  const [characterPreview,setCharacterPreview]=useState<FeaturedCompanion|null>(null);
  const [pendingImage,setPendingImage]=useState<PendingImage|null>(null);
  const [photoUploadPhase,setPhotoUploadPhase]=useState<PhotoUploadPhase>('idle');
  const pendingImageRef=useRef<PendingImage|null>(null);
  const [awaitingPhotoOffer,setAwaitingPhotoOffer]=useState(false);
  const [reconcilingMediaId,setReconcilingMediaId]=useState<string|null>(null);
  const [mediaOffers,setMediaOffers]=useState<MediaOffer[]>([]);
  const [mediaOfferBusy,setMediaOfferBusy]=useState<string|null>(null);
  const [autoDialogue,setAutoDialogue]=useState<AutoDialogueSuggestion|null>(null);
  const [autoDialogueBusy,setAutoDialogueBusy]=useState(false);
  const [showAutoDialogueOptions,setShowAutoDialogueOptions]=useState(false);
  const [resolvingMilestone, setResolvingMilestone] = useState(false);
  const [favoriteBusy,setFavoriteBusy]=useState(false);
  const [pinBusy,setPinBusy]=useState(false);
  const [showJumpToLatest,setShowJumpToLatest]=useState(false);
  const [planModal,setPlanModal]=useState<{planId:string;confirmCancel?:boolean}|null>(null);
  const [planActionBusyId,setPlanActionBusyId]=useState<string|null>(null);
  const [planEndTarget,setPlanEndTarget]=useState<SharedPlan|null>(null);
  const [switchPlanId,setSwitchPlanId]=useState<string|null>(null);
  const [conversationBootstrapError,setConversationBootstrapError]=useState('');
  const [conversationBootstrapAttempt,setConversationBootstrapAttempt]=useState(0);
  const [showSendConnectionNotice,setShowSendConnectionNotice]=useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const clearStoredDraft=usePersistentMessageDraft({userId:session?.user.id,conversationId:conversation?.id,kind:'direct',value:input,setValue:setInput,routeDraft:params.draft});
  const pendingDialogue=conversation?pendingDialogues[conversation.id]:undefined;
  const replyPending=sending||Boolean(pendingDialogue);
  const conversationReady=Boolean(conversation&&loadedConversationId===conversation.id&&!loading);
  useEffect(()=>{if(connectionPhase==='online')setShowSendConnectionNotice(false);},[connectionPhase]);
  useEffect(()=>setShowSendConnectionNotice(false),[conversation?.id]);
  const scroll = useRef<FlatList<ReactElement>>(null);
  const sendInFlightRef = useRef(false);
  const composerInput = useRef<TextInput>(null);
  const contentHeight = useRef(0);
  const previousHeight = useRef(0);
  const previousOffsetY = useRef(0);
  const scrollOffsetY = useRef(0);
  const prepending = useRef(false);
  const bottomAlignedConversation = useRef<string|null>(null);
  const keepPinnedToBottom = useRef(true);
  const forcePinnedUntil = useRef(0);
  const activeBottomPinRequest = useRef<string|null>(null);
  const bottomPinReleaseTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const bottomPinSettleTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const initialBottomPinConversation = useRef<string|null>(null);
  const initialBottomPinReleaseTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const programmaticScrollUntil = useRef(0);
  const viewportHeight = useRef(0);
  const pendingScrollRestore = useRef<ChatScrollPosition|null>(null);
  const messageCache = useRef(directMessageCacheFor(session?.user.id));
  const autoDialogueRequest=useRef<AbortController|null>(null);
  const currentInput=useRef('');
  const latestTimelineMessageId=useRef<string|null>(null);
  const lastFocusedConversationId=useRef<string|null>(null);
  const observedPendingRequest=useRef<string|null>(null);
  const resumedSharePhoto=useRef<string|null>(null);
  const seamlessCompletionIds=useRef(new Set<string>());
  const unreadWindow=useRef<{conversationId:string|null;lastReadAt:string|null;openedAt:string}>({conversationId:null,lastReadAt:null,openedAt:new Date().toISOString()});
  const mentionCharacters=useMemo<FeaturedCompanion[]>(()=>{
    if(!snapshot||!character)return[];
    const residentWorld=characterResidentWorld(snapshot,character);
    return residentWorld?characterCatalogForWorld(snapshot,residentWorld.id).map(({template,version})=>({...template,together_character_versions:version})):[];
  },[character,snapshot]);
  useEffect(()=>{
    if(params.sharePhoto!=='1'||!characterHandle||resumedSharePhoto.current===characterHandle)return;
    resumedSharePhoto.current=characterHandle;
    void refresh().then(()=>{
      const entitled=useTogether.getState().snapshot?.entitlements?.entitlement_keys?.includes('photo_sharing')===true;
      if(entitled)setShowPhotoRequests(true);else setShowPhotoPaywall(true);
      router.setParams({sharePhoto:undefined});
    });
  },[characterHandle,params.sharePhoto,refresh]);
  if(conversation?.id&&unreadWindow.current.conversationId!==conversation.id){
    unreadWindow.current={conversationId:conversation.id,lastReadAt:conversation.last_read_at??null,openedAt:new Date().toISOString()};
  }
  const fetchPendingMediaOffers=useCallback(async(characterInstanceId:string,conversationId:string)=>{
    let lastError:unknown;
    for(const delay of [0,350,900]){
      if(delay)await new Promise((resolve)=>setTimeout(resolve,delay));
      try{
        const result=await manageMedia<{offers:MediaOffer[]}>({action:'list_pending_offers',characterInstanceId});
        return(result.offers??[]).filter((offer)=>(!offer.conversation_id||offer.conversation_id===conversationId));
      }catch(caught){lastError=caught;if(!isTransientMediaFetchFailure(caught))throw caught;}
    }
    throw lastError;
  },[]);
  const markConversationRead=useCallback(async(conversationId:string)=>{
    const result=await manageConversation<{last_read_at:string}>({action:'read',conversationId});
    const current=useTogether.getState().snapshot?.conversations.find((item)=>item.id===conversationId);
    if(current)upsertConversation({...current,last_read_at:result.last_read_at,unread:false});
  },[upsertConversation]);
  useEffect(()=>{
    if(!snapshot||!character||conversation)return;
    let cancelled=false;
    setConversationBootstrapError('');
    void ensureConversation(character.id).then((created)=>{if(!cancelled)upsertConversation(created);}).catch((caught)=>{if(!cancelled)setConversationBootstrapError(caught instanceof Error?caught.message:'The conversation could not be opened.');});
    return()=>{cancelled=true;};
  },[character?.id,conversation?.id,conversationBootstrapAttempt,upsertConversation]);
  useEffect(()=>{if(params.plan==='1')setShowPlans(true);if(params.planId)setFocusPlanId(params.planId);},[params.plan,params.planId]);
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

  const scrollToLatest=useCallback((animated:boolean)=>{programmaticScrollUntil.current=Date.now()+350;scroll.current?.scrollToEnd({animated});},[]);
  const settleSentMessageAtBottom=useCallback((requestId:string)=>{
    // FlatList, the multiline composer, and the typing row do not finish their
    // web layout in the same frame. Re-align against the measured end after
    // each likely layout phase. A manual drag clears activeBottomPinRequest, so
    // these callbacks never fight somebody intentionally reading history.
    for(const delay of [0,32,96,220,480,900]){
      const timer=setTimeout(()=>{
        bottomPinSettleTimers.current.delete(timer);
        if(activeBottomPinRequest.current!==requestId)return;
        keepPinnedToBottom.current=true;
        forcePinnedUntil.current=Date.now()+1_200;
        scrollToLatest(false);
      },delay);
      bottomPinSettleTimers.current.add(timer);
    }
  },[scrollToLatest]);
  const beginInitialBottomPin=useCallback((conversationId:string)=>{
    if(initialBottomPinReleaseTimer.current)clearTimeout(initialBottomPinReleaseTimer.current);
    initialBottomPinReleaseTimer.current=null;
    initialBottomPinConversation.current=conversationId;
    keepPinnedToBottom.current=true;
  },[]);
  const cancelInitialBottomPin=useCallback(()=>{
    if(initialBottomPinReleaseTimer.current)clearTimeout(initialBottomPinReleaseTimer.current);
    initialBottomPinReleaseTimer.current=null;
    initialBottomPinConversation.current=null;
  },[]);
  const settleInitialBottomPin=useCallback((conversationId:string)=>{
    if(initialBottomPinConversation.current!==conversationId)return;
    if(initialBottomPinReleaseTimer.current)clearTimeout(initialBottomPinReleaseTimer.current);
    // FlatList renders the initial page in several batches. Keep resetting this
    // timer until its measured content stops growing, then perform one final
    // alignment before returning scroll control to the usual near-bottom logic.
    initialBottomPinReleaseTimer.current=setTimeout(()=>{
      if(initialBottomPinConversation.current!==conversationId)return;
      scrollToLatest(false);
      initialBottomPinConversation.current=null;
      initialBottomPinReleaseTimer.current=null;
      forcePinnedUntil.current=Date.now()+600;
      keepPinnedToBottom.current=true;
    },180);
  },[scrollToLatest]);
  const prepareConversationScroll=useCallback((conversationId:string)=>{
    bottomAlignedConversation.current=null;
    const saved=readChatScrollPosition(conversationId);
    if(shouldRestoreChatScrollPosition(saved)){
      cancelInitialBottomPin();
      pendingScrollRestore.current=saved;
      keepPinnedToBottom.current=false;
      setShowJumpToLatest(true);
      return;
    }
    pendingScrollRestore.current=null;
    beginInitialBottomPin(conversationId);
    setShowJumpToLatest(false);
  },[beginInitialBottomPin,cancelInitialBottomPin]);
  useEffect(()=>()=>{if(bottomPinReleaseTimer.current)clearTimeout(bottomPinReleaseTimer.current);if(initialBottomPinReleaseTimer.current)clearTimeout(initialBottomPinReleaseTimer.current);for(const timer of bottomPinSettleTimers.current)clearTimeout(timer);bottomPinSettleTimers.current.clear();},[]);
  const loadOlder = async () => {
    const oldest=messages[0];
    if(!conversation||!oldest||loadingOlder||!hasMore)return;
    setLoadingOlder(true);
    try{
      let query=supabase.from('together_messages').select('*,together_conversation_attachments(*),together_message_reactions(*)').eq('conversation_id',conversation.id).order('conversation_sequence',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE+1);
      query=oldest.conversation_sequence?query.lt('conversation_sequence',oldest.conversation_sequence):query.lt('created_at',oldest.created_at);
      const{data,error:olderError}=await query;
      if(olderError){setError('Earlier messages could not be loaded.');return;}
      const raw=(data??[]) as Message[],page=await hydrateAttachmentUrls(raw.slice(0,PAGE_SIZE));
      setHasMore(raw.length>PAGE_SIZE);
      if(page.length){
        previousHeight.current=contentHeight.current;
        previousOffsetY.current=scrollOffsetY.current;
        prepending.current=true;
        setMessages((current)=>mergeOlderMessages(page,current));
      }
    }finally{setLoadingOlder(false);}
  };
  const recoverInterruptedDialogue=async(conversationId:string,optimistic:Message,clientRequestId:string):Promise<boolean>=>{for(const delay of [250,750,1_500,3_000,5_000]){await new Promise((resolve)=>setTimeout(resolve,delay));const{data:canonicalUser,error:userRecoveryError}=await supabase.from('together_messages').select('*,together_conversation_attachments(*),together_message_reactions(*)').eq('conversation_id',conversationId).eq('role','user').eq('client_request_id',clientRequestId).maybeSingle();if(userRecoveryError||!canonicalUser)continue;const{data:turn}=await supabase.from('together_dialogue_turns').select('id').eq('source_message_id',canonicalUser.id).maybeSingle();let replyQuery=supabase.from('together_messages').select('*,together_conversation_attachments(*),together_message_reactions(*)').eq('conversation_id',conversationId).eq('role','assistant');replyQuery=turn?.id?replyQuery.or(`response_to_message_id.eq.${canonicalUser.id},dialogue_turn_id.eq.${turn.id}`):replyQuery.eq('response_to_message_id',canonicalUser.id);const{data,error:recoveryError}=await replyQuery.order('created_at',{ascending:true}).limit(8);if(recoveryError||!(data??[]).length)continue;const canonical=await hydrateAttachmentUrls([canonicalUser,...(data??[])] as Message[]);setMessages((current)=>reconcileMessages(current,canonical,[optimistic.id]));await refresh();return true;}return false;};
  useEffect(() => {
    if(!conversation){setLoading(false);setLoadedConversationId(null);return;}
    const conversationId=conversation.id,cached=messageCache.current.get(conversationId);
    let cancelled=false;
    prepareConversationScroll(conversationId);
    setError('');setStream('');setSending(false);setFeedback(null);setMemorySavedNotice(null);setAwaitingPhotoOffer(false);setPendingImage(null);setMediaOffers([]);setLastInteraction(null);setCharacterProposal(null);setPendingActionId(null);setFocusDismissed(false);setFocusPlanId(params.planId??null);setShowPlans(params.plan==='1');setShowPhotoRequests(false);setShowInteractions(false);setShowConversationMenu(false);setShowChatSettings(false);setPlanModal(null);setPlanActionBusyId(null);setPlanEndTarget(null);setSwitchPlanId(params.switchPlanId??null);setInput('');
    if(cached){setMessages(cached.messages);setHasMore(cached.hasMore);setLoadedConversationId(conversationId);setLoading(false);}
    else{setMessages([]);setHasMore(true);setLoadedConversationId(null);setLoading(true);}
    if(__DEV__&&process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE==='true'){setMessages([]);setHasMore(false);setLoadedConversationId(conversationId);setLoading(false);return;}
    void (async()=>{
      const{data,error:loadError}=await supabase.from('together_messages').select('*,together_conversation_attachments(*),together_message_reactions(*)').eq('conversation_id',conversationId).order('conversation_sequence',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE+1);
      if(cancelled)return;
      if(loadError){if(!cached)setError('Conversation history could not be loaded.');setLoadedConversationId(conversationId);setLoading(false);return;}
      const raw=(data??[]) as Message[],page=await hydrateAttachmentUrls(raw.slice(0,PAGE_SIZE).reverse());
      if(cancelled)return;
      const hasOlder=raw.length>PAGE_SIZE;
      writeMessageCache(messageCache.current,conversationId,page,hasOlder);
      setMessages(page);setHasMore(hasOlder);setLoadedConversationId(conversationId);setLoading(false);
      void markConversationRead(conversationId).catch(()=>undefined);
    })();
    return()=>{cancelled=true;};
  },[conversation?.id,markConversationRead,prepareConversationScroll]);
  useEffect(()=>{if(loadedConversationId)writeMessageCache(messageCache.current,loadedConversationId,messages,hasMore);},[hasMore,loadedConversationId,messages]);
  useEffect(()=>{
    if(!conversation||loadedConversationId!==conversation.id)return;
    const latest=[...messages].reverse().find((message)=>message.delivery_status!=='failed'&&Boolean(message.content.trim()));
    if(!latest)return;
    const current=useTogether.getState().snapshot?.conversations.find((item)=>item.id===conversation.id)??conversation;
    const preview=latest.content.replace(/\s+/g,' ').trim();
    if(current.last_message_at===latest.created_at&&current.last_message_preview===preview&&current.last_message_role===latest.role)return;
    upsertConversation(conversationWithLastMessage(current,latest));
  },[conversation?.id,loadedConversationId,messages,upsertConversation]);
  useFocusEffect(useCallback(()=>{
    const conversationId=conversation?.id;
    if(!conversationId||(__DEV__&&process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE==='true'))return;
    if(lastFocusedConversationId.current!==conversationId){lastFocusedConversationId.current=conversationId;return;}
    let active=true;
    void (async()=>{
      const{data,error:loadError}=await supabase.from('together_messages').select('*,together_conversation_attachments(*),together_message_reactions(*)').eq('conversation_id',conversationId).order('conversation_sequence',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE+1);
      if(!active||loadError)return;
      const raw=(data??[]) as Message[],page=await hydrateAttachmentUrls(raw.slice(0,PAGE_SIZE).reverse());
      if(!active)return;
      const hasOlder=raw.length>PAGE_SIZE;
      writeMessageCache(messageCache.current,conversationId,page,hasOlder);
      prepareConversationScroll(conversationId);setMessages(page);setHasMore(hasOlder);setLoadedConversationId(conversationId);setLoading(false);
      await markConversationRead(conversationId).catch(()=>undefined);
    })();
    return()=>{active=false;};
  },[conversation?.id,markConversationRead,prepareConversationScroll]));
  useEffect(()=>{
    const currentRequest=pendingDialogue?.clientRequestId??null;
    const previousRequest=observedPendingRequest.current;
    observedPendingRequest.current=currentRequest;
    if(!conversation?.id||currentRequest||!previousRequest||(__DEV__&&process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE==='true'))return;
    const conversationId=conversation.id;
    let cancelled=false;
    void (async()=>{
      const{data,error:loadError}=await supabase.from('together_messages').select('*,together_conversation_attachments(*),together_message_reactions(*)').eq('conversation_id',conversationId).order('conversation_sequence',{ascending:false,nullsFirst:false}).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(PAGE_SIZE+1);
      if(cancelled||loadError)return;
      const raw=(data??[]) as Message[],page=await hydrateAttachmentUrls(raw.slice(0,PAGE_SIZE).reverse());
      if(cancelled)return;
      // Reconcile the canonical rows into the mounted timeline. Replacing the
      // whole array here can make FlatList discard its bottom anchor exactly
      // when an optimistic send becomes canonical (especially in long chats).
      setMessages((current)=>reconcileMessages(current,page));
      await markConversationRead(conversationId).catch(()=>undefined);
    })();
    return()=>{cancelled=true;};
  },[conversation?.id,markConversationRead,pendingDialogue?.clientRequestId]);
  useEffect(()=>{autoDialogueRequest.current?.abort();autoDialogueRequest.current=null;setAutoDialogue(null);setAutoDialogueBusy(false);setShowAutoDialogueOptions(false);},[conversation?.id]);
  useEffect(()=>()=>autoDialogueRequest.current?.abort(),[]);
  const simulationStale=Boolean(character&&(Date.now()-new Date(character.last_simulated_at).getTime()>2*60000||!(snapshot?.scheduleEvents??[]).some((item)=>item.character_instance_id===character.id&&new Date(item.ends_at)>new Date())));
  useEffect(()=>{if(!character?.id||!simulationStale)return;let cancelled=false;void simulate(character.id).then(()=>cancelled?undefined:refresh({scope:'presence',characterInstanceId:character.id})).catch(()=>undefined);return()=>{cancelled=true;};},[character?.id,refresh,simulationStale]);
  useFocusEffect(useCallback(()=>{if(!character)return;const channel=supabase.channel(`kivelle-media-${character.id}-${realtimeScopeRef.current}`).on('postgres_changes',{event:'*',schema:'public',table:'together_generated_media',filter:`character_instance_id=eq.${character.id}`},(payload)=>{const id=String((payload.new as Record<string,unknown>|null)?.id??'');if(id)void manageMedia<{media:GeneratedMedia}>({action:'status',mediaId:id}).then((result)=>{upsertMedia(result.media);if(!mediaReconciliationComplete(result.media))setReconcilingMediaId(id);}).catch(()=>setReconcilingMediaId(id));}).subscribe();return()=>{void supabase.removeChannel(channel);};},[character?.id,upsertMedia]));
  useFocusEffect(useCallback(()=>{
    if(!character?.id||!conversation?.id||(__DEV__&&process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE==='true'))return;
    let cancelled=false;
    const currentPending=(useTogether.getState().snapshot?.generatedMedia??[]).find((item)=>item.character_instance_id===character.id&&item.conversation_id===conversation.id&&item.media_type!=='voice_note'&&!mediaReconciliationComplete(item));
    if(currentPending)setReconcilingMediaId(currentPending.id);
    void manageMedia<{media:GeneratedMedia[]}>({action:'list_recent',characterInstanceId:character.id,conversationId:conversation.id,createdAfter:new Date(Date.now()-72*60*60*1000).toISOString(),limit:20}).then((result)=>{
      if(cancelled)return;
      for(const item of result.media??[])upsertMedia(item);
      const pending=(result.media??[]).find((item)=>item.media_type!=='voice_note'&&!mediaReconciliationComplete(item));
      if(pending)setReconcilingMediaId(pending.id);
    }).catch(()=>undefined);
    return()=>{cancelled=true;};
  },[character?.id,conversation?.id,upsertMedia]));
  useFocusEffect(useCallback(()=>{if(!conversation?.id)return;const channel=supabase.channel(`kivelle-conversation-actions-${conversation.id}-${realtimeScopeRef.current}`).on('postgres_changes',{event:'*',schema:'public',table:'together_conversation_actions',filter:`conversation_id=eq.${conversation.id}`},(payload)=>{const next=payload.new as ConversationAction|undefined,previous=payload.old as Partial<ConversationAction>|undefined,id=String(next?.id??previous?.id??'');if(next?.id&&next.status==='pending')upsertConversationAction(next);else if(id)removeConversationAction(id);}).subscribe();return()=>{void supabase.removeChannel(channel);};},[conversation?.id,removeConversationAction,upsertConversationAction]));
  useFocusEffect(useCallback(()=>{if(!conversation?.id)return;const channel=supabase.channel(`kivelle-conversation-events-${conversation.id}-${realtimeScopeRef.current}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'together_conversation_events',filter:`conversation_id=eq.${conversation.id}`},(payload)=>{const event=payload.new as ConversationEvent|undefined;if(!event?.id)return;const current=useTogether.getState().snapshot;if(current&&!current.conversationEvents.some((item)=>item.id===event.id))setCoreState({conversationEvents:[...current.conversationEvents,event]});}).subscribe();return()=>{void supabase.removeChannel(channel);};},[conversation?.id,setCoreState]));
  useFocusEffect(useCallback(()=>{
    if(!character?.id||!conversation?.id){setMediaOffers([]);return;}
    let cancelled=false,retryTimer:ReturnType<typeof setTimeout>|undefined;
    const loadOffers=(attempt=0)=>fetchPendingMediaOffers(character.id,conversation.id).then((offers)=>{if(!cancelled)setMediaOffers(offers);}).catch(()=>{if(!cancelled&&attempt<3)retryTimer=setTimeout(()=>void loadOffers(attempt+1),Math.min(8_000,1_500*2**attempt));});
    void loadOffers();const channel=supabase.channel(`kivelle-media-offers-${character.id}-${realtimeScopeRef.current}`).on('postgres_changes',{event:'*',schema:'public',table:'together_media_offers',filter:`character_instance_id=eq.${character.id}`},()=>void loadOffers()).subscribe();return()=>{cancelled=true;if(retryTimer)clearTimeout(retryTimer);void supabase.removeChannel(channel);};
  },[character?.id,conversation?.id,fetchPendingMediaOffers]));
  useEffect(()=>{
    if(!reconcilingMediaId||!character?.id||!conversation?.id)return;
    let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
    const reconcile=async()=>{
      const pending=(useTogether.getState().snapshot?.generatedMedia??[]).filter((item)=>item.character_instance_id===character.id&&item.conversation_id===conversation.id&&item.media_type!=='voice_note'&&!mediaReconciliationComplete(item));
      if(!pending.length){setReconcilingMediaId(null);return;}
      let refreshed:GeneratedMedia[]=[];
      try{const result=await manageMedia<{media:GeneratedMedia[]}>({action:'batch_status',mediaIds:pending.map((item)=>item.id).slice(0,20)});refreshed=result.media??[];}catch{refreshed=[];}
      if(cancelled)return;
      let incomplete=refreshed.length!==pending.length;
      for(const media of refreshed){upsertMedia(media);if(!mediaReconciliationComplete(media))incomplete=true;}
      if(!incomplete){setReconcilingMediaId(null);return;}
      timer=setTimeout(()=>void reconcile(),3000);
    };
    timer=setTimeout(()=>void reconcile(),1500);
    return()=>{cancelled=true;if(timer)clearTimeout(timer);};
  },[reconcilingMediaId,character?.id,conversation?.id,upsertMedia]);
  const lifecyclePlans=snapshot&&character?attendedPlansForLifecycleReconciliation(snapshot.sharedPlans??[],character.id):[];
  const lifecyclePlanSignature=lifecyclePlans.map((plan)=>`${plan.id}:${plan.status}:${plan.ends_at}`).join('|');
  useEffect(()=>{
    if(!lifecyclePlans.length)return;
    let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
    const reconcile=async()=>{
      const now=Date.now(),due=lifecyclePlans.filter((plan)=>new Date(plan.ends_at).getTime()<=now);
      const nextPlan=lifecyclePlans[0];
      if(!due.length&&nextPlan){const remaining=Math.max(250,new Date(nextPlan.ends_at).getTime()-now+250);timer=setTimeout(()=>void reconcile(),Math.min(remaining,2_147_000_000));return;}
      if(!due.length)return;
      const results=await Promise.allSettled(due.map((plan)=>getPlanExperience(plan.id,plan.character_instance_id)));
      if(cancelled)return;
      await refresh().catch(()=>undefined);
      // Keep a bounded retry while this snapshot still considers the plan live.
      // This also covers small differences between the device and server clocks.
      if(!cancelled)timer=setTimeout(()=>void reconcile(),results.some((result)=>result.status==='rejected')?5_000:15_000);
    };
    void reconcile();
    return()=>{cancelled=true;if(timer)clearTimeout(timer);};
  // The signature is intentional: reconciliation should restart only when the
  // server changes the lifecycle set, not on unrelated snapshot object churn.
  },[lifecyclePlanSignature,refresh]);
  useFocusEffect(useCallback(()=>{if(!character)return;const refreshPresence=()=>void refresh({scope:'presence',characterInstanceId:character.id});const channel=supabase.channel(`kivelle-presence-${character.id}-${realtimeScopeRef.current}`).on('postgres_changes',{event:'*',schema:'public',table:'together_character_schedule_events',filter:`character_instance_id=eq.${character.id}`},refreshPresence).on('postgres_changes',{event:'UPDATE',schema:'public',table:'together_character_instances',filter:`id=eq.${character.id}`},refreshPresence).subscribe();return()=>{void supabase.removeChannel(channel);};},[character?.id,refresh]));
  useEffect(() => {
    const forced=initialBottomPinConversation.current===conversation?.id||activeBottomPinRequest.current!==null||forcePinnedUntil.current>Date.now();
    if(prepending.current||(!keepPinnedToBottom.current&&!forced)||!conversationReady||bottomAlignedConversation.current!==conversation?.id)return;
    const timer=setTimeout(()=>{if(keepPinnedToBottom.current||activeBottomPinRequest.current!==null||forcePinnedUntil.current>Date.now())scrollToLatest(activeBottomPinRequest.current===null&&forcePinnedUntil.current<=Date.now());},40);
    return()=>clearTimeout(timer);
  },[conversation?.id,conversationReady,feedback,mediaOffers.length,messages,stream,replyPending,scrollToLatest]);

  if (!snapshot) return <LoadingSkeleton label="Opening your conversation…" />;
  if (!character) return <ErrorState message="This conversation is not available yet." />;
  if (!conversation) return conversationBootstrapError
    ? <ErrorState message={conversationBootstrapError} onRetry={()=>setConversationBootstrapAttempt((value)=>value+1)} />
    : <LoadingSkeleton label={`Opening your conversation with ${character.together_character_templates.name}…`} />;
  const visibleMessages=scopedConversationMessages(messages,conversation.id,loadedConversationId,loading);
  const chatContext=buildClientConversationContext(snapshot,character,new Date(),conversation.id);
  const activeSharedPlan=activePlanForChat(snapshot.sharedPlans??[],character.id);
  const joinableSharedPlan=joinablePlanForChat(snapshot.sharedPlans??[],character.id);
  const location = chatContext.scene.location;
  const generatedMedia=snapshot.generatedMedia??[];
  const portraitSource=resolveCharacterPortraitSource(character.together_character_templates,character.together_character_versions,slug)??characterAssets[slug]??characterAssets.maya!;
  const latestHeaderMedia=latestConversationHeaderImage(generatedMedia,conversation.id);
  const sharedSceneReactionNames=Object.fromEntries((sharedSceneRoster?.participants??[]).map((participant)=>[participant.character_instance_id,participant.together_character_instances?.together_character_templates.name.split(' ')[0]??'Companion']));
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
  const pendingActions=conversationReady?(snapshot.conversationActions??[]).filter((item)=>item.status==='pending'&&item.character_instance_id===character.id&&item.conversation_id===conversation.id&&shouldShowPlanConversationAction(item,chatContext.scene.locationId,Boolean(activeSharedPlan))):[];
  const startTimelinePlan=async(plan:SharedPlan)=>{
    const availability=planActionAvailability(plan);
    if(!availability.primaryEnabled){setPlanModal({planId:plan.id});return;}
    setPlanActionBusyId(plan.id);setError('');
    try{const experience=await joinCommitment(plan.id,plan.character_instance_id);upsertPlan(experience.plan);if(experience.scene){upsertSceneSession(experience.scene);setInteractionScene(experience.scene);setInteractionCandidates(experience.interactions??[]);setMovementCandidates(experience.destinations??[]);}setFocusPlanId(plan.id);setFocusDismissed(false);await refresh({force:true});if(Platform.OS!=='web')void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);}
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
  const acceptOffer=async(offer:MediaOffer,paymentMethod:'credits'|'daily_included'='credits')=>{setMediaOfferBusy(offer.id);try{const result=await manageMedia<{state:'accepted'|'needs_credits'|'daily_unavailable'|'expired';offer:MediaOffer;media?:GeneratedMedia;creditBalance:number;required?:number;dailyPhotoAllowanceRemaining?:number}>({action:'accept_offer',offerId:offer.id,requestId:createClientRequestId(),paymentMethod});if(result.state==='daily_unavailable'){setMediaOffers((current)=>current.map((item)=>item.source==='user_request'&&item.status==='pending'?{...item,preview_metadata:{...item.preview_metadata,dailyPhotoAllowanceRemaining:0}}:item));Alert.alert('Included photos used','You have used today’s included photos. You can still create this one with Credits.');return;}if(result.state==='needs_credits'){Alert.alert('More credits needed',`You need ${result.required??offer.credit_cost} credits for this photo. Current balance: ${result.creditBalance}.`,[{text:'Not now',style:'cancel'},{text:'Buy Credits',onPress:()=>router.push(creditsSubscriptionHref as never)}]);return;}if(result.state==='expired'){setMediaOffers((current)=>current.filter((item)=>item.id!==offer.id));setError('That photo moment has passed.');return;}const dailyRemaining=Math.max(0,Number(result.dailyPhotoAllowanceRemaining??result.offer.preview_metadata?.dailyPhotoAllowanceRemaining??0));setMediaOffers((current)=>current.map((item)=>item.id===offer.id?{...result.offer,preview_metadata:{...result.offer.preview_metadata,dailyPhotoAllowanceRemaining:dailyRemaining}}:paymentMethod==='daily_included'&&item.source==='user_request'&&item.status==='pending'?{...item,preview_metadata:{...item.preview_metadata,dailyPhotoAllowanceRemaining:dailyRemaining}}:item));if(result.media){upsertMedia(result.media);setReconcilingMediaId(result.media.id);}}catch(caught){setError(caught instanceof Error?caught.message:'The photo could not be prepared.');}finally{setMediaOfferBusy(null);}};
  const declineOffer=async(offer:MediaOffer)=>{setMediaOfferBusy(offer.id);try{await manageMedia({action:'decline_offer',offerId:offer.id});setMediaOffers((current)=>current.filter((item)=>item.id!==offer.id));}catch(caught){setError(caught instanceof Error?caught.message:'The offer could not be dismissed.');}finally{setMediaOfferBusy(null);}};
  const finishVoiceNotePrompt=(decision:{hideFuture:boolean}|null)=>{const resolve=voiceNotePromptResolver.current;voiceNotePromptResolver.current=null;if(!decision)setVoiceNotePrompt(null);resolve?.(decision);};
  const requestVoiceWithConfirmation=async(messageId:string,name:string):Promise<VoiceNoteRequestResult|null>=>{
    if(await isVoiceNoteConfirmationHidden())return requestVoiceNote(messageId,createClientRequestId());
    const quote=await quoteVoiceNote(messageId);
    if(!quote.generationRequired)return requestVoiceNote(messageId,createClientRequestId());
    if(voiceNotePromptResolver.current)return null;
    const decision=await new Promise<{hideFuture:boolean}|null>((resolve)=>{voiceNotePromptResolver.current=resolve;setVoiceNotePrompt({messageId,name,creditCost:quote.creditCost,creditBalance:quote.creditBalance,shortened:quote.shortened});});
    if(!decision)return null;
    setVoiceNotePromptBusy(true);
    try{if(decision.hideFuture)await hideVoiceNoteConfirmation().catch(()=>undefined);return await requestVoiceNote(messageId,createClientRequestId());}
    finally{setVoiceNotePromptBusy(false);setVoiceNotePrompt(null);}
  };
  useEffect(()=>()=>{voiceNotePromptResolver.current?.(null);voiceNotePromptResolver.current=null;},[]);
  useEffect(()=>{pendingImageRef.current=pendingImage;},[pendingImage]);
  useEffect(()=>()=>cleanupNormalizedImage(pendingImageRef.current?.uri),[]);

  const send = async (retryText?: string,retryRequestId?:string,retryMessageId?:string,messageAction?:DirectMessageAction) => {
    const draft = retryMessageId&&retryText==='[Photo]'&&pendingImage ? '' : retryText ?? input;
    if (draft.length > MESSAGE_CHARACTER_LIMIT) { setError(messageCharacterLimitError()); return; }
    const text = draft.trim(); if ((!text&&!pendingImage) || replyPending || sendInFlightRef.current) return;
    if(connectionPhase!=='online')setShowSendConnectionNotice(true);
    if(!online){setError('You’re offline. Your draft is saved and ready when you reconnect.');return;}
    sendInFlightRef.current=true;
    const sentAutoDialogue=!retryText&&!messageAction?autoDialogue:null;
    keepPinnedToBottom.current=true;
    autoDialogueRequest.current?.abort();autoDialogueRequest.current=null;setAutoDialogue(null);setAutoDialogueBusy(false);currentInput.current='';
    const before = useTogether.getState().snapshot;
    const expectsPhotoOffer=!messageAction&&shouldShowPhotoGenerationPending(text);
    if(expectsPhotoOffer)setAwaitingPhotoOffer(true);
    const selectedImage=messageAction?null:pendingImage;setInput(''); setError(''); setSending(true); setStream(''); setFeedback(null);
    let preparedAttachmentId:string|undefined;let sentAttachment:ConversationAttachment|undefined;let sceneActionId:string|undefined;
    const clientRequestId=retryRequestId??createClientRequestId();
    if(bottomPinReleaseTimer.current)clearTimeout(bottomPinReleaseTimer.current);
    activeBottomPinRequest.current=clientRequestId;
    forcePinnedUntil.current=Date.now()+1_200;
    const optimistic: Message = { id: retryMessageId??`local-${Date.now()}`, conversation_id: conversation.id, role: 'user', content: text||'[Photo]', client_request_id:clientRequestId,delivery_status: 'pending', created_at: new Date().toISOString(),provider_metadata:messageAction?{uiHidden:true,messageAction:messageAction.messageAction,anchorMessageId:messageAction.anchorMessageId}:undefined,attachments:selectedImage?[pendingImageAttachment(selectedImage,conversation.id)]:[] };
    beginPendingDialogue({conversationId:conversation.id,characterInstanceId:character.id,clientRequestId,startedAt:new Date().toISOString(),showTyping:!expectsPhotoOffer});
    setMessages((current) => retryMessageId?current.map((item)=>item.id===retryMessageId?optimistic:item):[...current, optimistic]);
    settleSentMessageAtBottom(clientRequestId);
    try {
      if(selectedImage){setPhotoUploadPhase('preparing');const prepared=await prepareUserImage({conversationId:conversation.id,characterInstanceId:character.id,mimeType:selectedImage.mimeType,byteSize:selectedImage.byteSize,width:selectedImage.width,height:selectedImage.height,requestId:selectedImage.requestId});preparedAttachmentId=prepared.attachment.id;setPhotoUploadPhase('uploading');const blob=await fetch(selectedImage.uri).then((response)=>response.blob());const{error:uploadError}=await supabase.storage.from(prepared.upload.bucket).upload(prepared.upload.path,blob,{contentType:selectedImage.mimeType,upsert:true});if(uploadError)throw new Error('That photo could not be uploaded.');setPhotoUploadPhase('processing');const confirmed=await confirmUserImage(prepared.attachment.id,text);sentAttachment={...confirmed.attachment,signed_url:selectedImage.uri};setPhotoUploadPhase('sending');}
      // A clear free-text action is matched only against the server's current
      // scene candidates, then executed before the dialogue context is built.
      // This gives the normal companion response the real scene change to
      // react to, while questions and vague ideas remain ordinary chat.
      if(isCoPresent&&!messageAction){
        try{
          const sceneResult=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[];intentMatch?:InteractionCandidate;characterProposal?:CharacterInteractionProposal}>({action:'resolve',characterInstanceId:character.id,conversationId:conversation.id,intentText:text});
          setInteractionScene(sceneResult.scene?.id?sceneResult.scene:null);
          setInteractionCandidates(sceneResult.interactions??[]);
          setMovementCandidates(sceneResult.destinations??[]);
          setCharacterProposal(sceneResult.characterProposal??null);
          if(sceneResult.intentMatch){const sceneAction=await executeInteraction(sceneResult.intentMatch,'defer_to_current_message');sceneActionId=sceneAction?.id;}
        }catch{/* The sent message is still valid if the scene changed. */}
      }
      const result = await sendDialogue({ conversationId: conversation.id, characterInstanceId: character.id, message: text,attachmentIds:preparedAttachmentId?[preparedAttachmentId]:[], clientRequestId,focusPlanId:focusPlanId??undefined,...(sceneActionId?{sceneActionId}:{}),...(messageAction?{messageAction:messageAction.messageAction,anchorMessageId:messageAction.anchorMessageId}:{}),...(sentAutoDialogue?{autoDialogueSuggestionId:sentAutoDialogue.suggestionId,autoDialogueSuggestionSource:sentAutoDialogue.source,autoDialogueSuggestionEdited:text!==sentAutoDialogue.text.trim(),autoDialogueSuggestionIntent:sentAutoDialogue.intent,autoDialogueSuggestionPreference:sentAutoDialogue.preference}:{}) }, (token) => {if(activeBottomPinRequest.current===clientRequestId)forcePinnedUntil.current=Date.now()+1_200;setStream((current) => current + token);});
      if(expectsPhotoOffer)setAwaitingPhotoOffer(false);
      seamlessCompletionIds.current.add(result.message.id);
      cleanupNormalizedImage(selectedImage?.uri);setPendingImage(null);setPhotoUploadPhase('idle');setStream(''); setMessages((current) => reconcileMessages(current,[{...optimistic,delivery_status:'complete',attachments:sentAttachment?[sentAttachment]:optimistic.attachments},result.message,...(result.additionalMessages??[])]));settleSentMessageAtBottom(clientRequestId);
      void markConversationRead(conversation.id).catch(()=>undefined);
      if(result.generatedMedia){upsertMedia(result.generatedMedia);setReconcilingMediaId(result.generatedMedia.id);}
      if(result.mediaOffer)setMediaOffers((current)=>[result.mediaOffer!,...current.filter((item)=>item.id!==result.mediaOffer!.id)]);
      if(result.photoRequestError)setError(result.photoRequestError.message);
      if(expectsPhotoOffer&&!result.photoRequestError){
        try{const offers=await fetchPendingMediaOffers(character.id,conversation.id);setMediaOffers(offers);if(!offers.length&&!result.mediaOffer)setError('The photo confirmation did not appear. Please try the request again.');}
        catch(caught){if(!result.mediaOffer&&!isTransientMediaFetchFailure(caught))setError('The photo confirmation could not be loaded. Please try again.');}
      }
      if(result.delta)applyServerDelta(result.delta);
      await clearStoredDraft();
      showNewStoryFeedback(before, useTogether.getState().snapshot, character.id, character.together_character_templates.name, setFeedback);
    } catch (caught) {
      const recovered=dialogueFailureMayHavePersisted(caught)?await recoverInterruptedDialogue(conversation.id,optimistic,clientRequestId):false;
      if(recovered){cleanupNormalizedImage(selectedImage?.uri);setPendingImage(null);setPhotoUploadPhase('idle');setStream('');setError('');await clearStoredDraft();return;}
      if(preparedAttachmentId)void removePendingAttachment(preparedAttachmentId).catch(()=>undefined);
      if(selectedImage)setPhotoUploadPhase('failed');
      setStream(''); setError(caught instanceof Error ? caught.message : 'The reply was interrupted.');
      if(!messageAction){setInput(draft);currentInput.current=draft;}
      if(caught instanceof ApiError&&caught.code==='CONVERSATION_ARCHIVED')await refresh();
      if(caught instanceof ApiError&&caught.code==='PLAN_LIMIT_REACHED')setShowPhotoPaywall(true);
      setMessages((current) => current.map((item) => item.id === optimistic.id ? { ...item, delivery_status: 'failed' } : item));
    } finally {
      sendInFlightRef.current=false;finishPendingDialogue(conversation.id,clientRequestId);setSending(false);if(expectsPhotoOffer)setAwaitingPhotoOffer(false);
      if(activeBottomPinRequest.current===clientRequestId){
        forcePinnedUntil.current=Date.now()+1_000;
        bottomPinReleaseTimer.current=setTimeout(()=>{if(activeBottomPinRequest.current!==clientRequestId)return;scrollToLatest(false);activeBottomPinRequest.current=null;forcePinnedUntil.current=Date.now()+500;},1_200);
      }
    }
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
      if(switchPlanId){if(timing.choice!=='now')throw new Error('Choose Switch Now to replace the active plan.');await switchPlanExperience<PlanMutationResult>({currentPlanId:switchPlanId,characterInstanceId:character.id,activityKey:option.activityKey,locationId:option.locationId,sourceConversationId:conversation.id,sceneId:interactionScene?.id,requestId:planRequestIdRef.current});planRequestIdRef.current=createClientRequestId();setSwitchPlanId(null);setFocusPlanId(null);setFocusDismissed(true);setInteractionScene(null);setInteractionCandidates([]);setMovementCandidates([]);router.setParams({plan:undefined,location:undefined,world:undefined,activity:undefined,switchPlanId:undefined});await refresh();setShowPlans(false);}
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
    if(interactionLoading)return;
    const previousCandidates=interactionCandidates,previousProposal=characterProposal;
    setInteractionLoading(true);setError('');setShowInteractions(false);setCharacterProposal(null);
    setInteractionCandidates((current)=>current.filter((item)=>item.interactionKey!==candidate.interactionKey));
    setLastInteraction({label:candidate.label,status:'accepted'});
    if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try{
      const result=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[];action?:SceneAction;characterProposal?:CharacterInteractionProposal}>({action:'execute',characterInstanceId:character.id,conversationId:conversation.id,sceneId:interactionScene?.id,interactionKey:candidate.interactionKey,requestId:createClientRequestId()});
      setInteractionScene(result.scene?.id?result.scene:null);applySceneDelta(result.scene);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);setCharacterProposal(result.characterProposal??null);setLastInteraction(interactionFeedback(result.action,candidate.label));
      if(reactionMode==='generate'&&result.action?.id)await generateSceneReaction(result.action.id);
      return result.action;
    }catch(caught){
      setInteractionCandidates(previousCandidates);setCharacterProposal(previousProposal);setLastInteraction(null);setShowInteractions(true);
      setError(caught instanceof Error?caught.message:'That option is no longer available.');return undefined;
    }finally{setInteractionLoading(false);}
  };
  const generateSceneReaction=async(actionId:string)=>{if(replyPending)return;const clientRequestId=createClientRequestId();beginPendingDialogue({conversationId:conversation.id,characterInstanceId:character.id,clientRequestId,startedAt:new Date().toISOString(),showTyping:true});setSending(true);setStream('');try{const reaction=await sendSceneReaction({conversationId:conversation.id,characterInstanceId:character.id,sceneActionId:actionId,clientRequestId},(token)=>setStream((current)=>current+token),()=>setStream(''));setStream('');setMessages((current)=>current.some((message)=>message.id===reaction.message.id)?current:[...current,reaction.message]);}catch(caught){setStream('');setError(caught instanceof Error?caught.message:'The activity was saved, but the reply was interrupted.');}finally{finishPendingDialogue(conversation.id,clientRequestId);setSending(false);}};
  const acceptCharacterProposal=async()=>{
    const proposal=characterProposal;
    if(!proposal||interactionLoading)return;
    // The choice should feel local and immediate. Server confirmation and the
    // optional companion reaction continue after the card leaves the timeline.
    setCharacterProposal(null);setInteractionLoading(true);setError('');
    if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try{
      const result=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[];action?:SceneAction;characterProposal?:CharacterInteractionProposal}>({action:'accept_proposal',characterInstanceId:character.id,conversationId:conversation.id,sceneId:interactionScene?.id,proposalActionId:proposal.actionId,requestId:createClientRequestId()});
      setInteractionScene(result.scene?.id?result.scene:null);applySceneDelta(result.scene);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);
      setCharacterProposal(result.characterProposal?.actionId===proposal.actionId?null:result.characterProposal??null);
      setLastInteraction({label:proposal.label,status:'accepted'});
      if(result.action?.id)await generateSceneReaction(result.action.id);
    }catch(caught){
      setError(caught instanceof Error?caught.message:'That suggestion is no longer available.');
      setCharacterProposal((current)=>current??proposal);
    }finally{setInteractionLoading(false);}
  };
  const dismissCharacterProposal=async()=>{
    const proposal=characterProposal;
    if(!proposal||interactionLoading)return;
    // Dismiss optimistically; a slow network should never hold a declined card
    // on screen. A later scene refresh will reconcile server state if needed.
    setCharacterProposal(null);setInteractionLoading(true);setError('');
    if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try{
      const result=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[]}>({action:'dismiss_proposal',characterInstanceId:character.id,conversationId:conversation.id,sceneId:interactionScene?.id,proposalActionId:proposal.actionId});
      setInteractionScene(result.scene?.id?result.scene:null);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);
    }catch(caught){setError(caught instanceof Error?caught.message:'That suggestion could not be dismissed.');}
    finally{setInteractionLoading(false);}
  };
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
  const toggleMessageSaved=async(message:Message)=>{
    if(message.id.startsWith('local-'))return;
    const favorite=!isMessageFavorite(message),previous=message.user_metadata;
    setMessages((current)=>current.map((item)=>item.id===message.id?{...item,user_metadata:{...(item.user_metadata??{}),favorite}}:item));
    try{const updated=await setMessageFavorite(conversation.id,message.id,favorite);setMessages((current)=>current.map((item)=>item.id===message.id?{...item,...updated}:item));}
    catch(caught){setMessages((current)=>current.map((item)=>item.id===message.id?{...item,user_metadata:previous}:item));setError(caught instanceof Error?caught.message:'That message could not be saved.');}
  };
  const deleteConversation=()=>confirmAction({title:'Delete this conversation?',message:`It will disappear from Messages and conversation history, but you can restore the text from Settings → Archived Chats for 30 days.\n\nUploaded photos are removed immediately and cannot be restored. ${character.together_character_templates.name} will still remember separately saved memories, and your relationship and Moments remain.`,confirmLabel:'Delete conversation',destructive:true,onConfirm:async()=>{try{const archived=await manageConversation<Snapshot['conversations'][number]>({action:'delete',conversationId:conversation.id});setMessages([]);setShowConversationMenu(false);await refresh();const latest=useTogether.getState().snapshot;if(latest)useTogether.getState().setCoreState({conversations:latest.conversations.map((item)=>item.id===archived.id?archived:item)});returnToMessagesInbox({reset:(href)=>router.replace(href as never),navigate:(href)=>router.push(href as never)});}catch(caught){setError(caught instanceof Error?caught.message:'The conversation could not be archived.');}}});
  const openMessagesInbox=()=>{
    returnToMessagesInbox({
      reset:(href)=>router.replace(href as never),
      navigate:(href)=>router.push(href as never),
    });
  };
  const toggleFavorite=async()=>{if(favoriteBusy)return;const previous=snapshot.favoriteCharacterTemplateIds??[],next=isFavorite?previous.filter((id)=>id!==character.character_template_id):[...new Set([...previous,character.character_template_id])];setFavoriteBusy(true);setCoreState({favoriteCharacterTemplateIds:next});try{const result=await setCharacterFavorite(character.character_template_id,!isFavorite,'chat_menu');setCoreState({favoriteCharacterTemplateIds:result.favoriteCharacterTemplateIds});}catch(caught){setCoreState({favoriteCharacterTemplateIds:previous});setError(caught instanceof Error?caught.message:'That favorite could not be saved.');}finally{setFavoriteBusy(false);}};
  const togglePinned=async()=>{if(pinBusy)return;setPinBusy(true);try{upsertConversation(await setConversationPinned(conversation.id,!isConversationPinned(conversation)));}catch(caught){setError(caught instanceof Error?caught.message:'That chat could not be pinned.');}finally{setPinBusy(false);}};
  const desktopChat=width>=920,messageTypography=chatMessageTypography(conversation,{desktop:desktopChat});
  const photoSharingEntitled=snapshot.entitlements?.entitlement_keys?.includes('photo_sharing')===true;
  const choosePhoto=async(source:'camera'|'library')=>{if(!photoSharingEntitled){setShowPhotoRequests(false);setShowPhotoPaywall(true);return;}try{if(Platform.OS!=='web'){const permission=source==='camera'?await ImagePicker.requestCameraPermissionsAsync():await ImagePicker.requestMediaLibraryPermissionsAsync();if(!permission.granted){setError(source==='camera'?'Camera access is needed to take a photo.':'Photo access is needed to choose a photo.');return;}}const options=userImagePickerOptions(source),result=source==='camera'?await ImagePicker.launchCameraAsync(options):await ImagePicker.launchImageLibraryAsync(options);setShowPhotoRequests(false);if(result.canceled||!result.assets[0])return;const asset=result.assets[0],normalized=await normalizeUserImage({uri:asset.uri,width:asset.width,height:asset.height,fileSize:asset.fileSize,fileName:asset.fileName},.88);cleanupNormalizedImage(pendingImage?.uri);setPendingImage({...normalized,requestId:createClientRequestId()});setPhotoUploadPhase('idle');setError('');composerInput.current?.focus();}catch(caught){setShowPhotoRequests(false);setError(caught instanceof Error?caught.message:'That photo could not be opened.');}};
  const requestSharePhoto=(source:'camera'|'library')=>handlePhotoSharingTap(photoSharingEntitled,{openPicker:()=>void choosePhoto(source),openPaywall:()=>{setShowPhotoRequests(false);setShowPhotoPaywall(true);}});
  const clearPendingImage=()=>{cleanupNormalizedImage(pendingImage?.uri);setPendingImage(null);setPhotoUploadPhase('idle');};
  const deleteSharedPhoto=(attachment:ConversationAttachment)=>confirmAction({title:'Delete this photo?',message:'The private file and its derived visual description will be removed immediately. This cannot be undone.',confirmLabel:'Delete photo',destructive:true,onConfirm:async()=>{try{await deleteConversationAttachment(attachment.id);setMessages((current)=>current.map((message)=>({...message,attachments:(message.attachments??message.together_conversation_attachments??[]).filter((item)=>item.id!==attachment.id),together_conversation_attachments:(message.together_conversation_attachments??[]).filter((item)=>item.id!==attachment.id)})));}catch(caught){setError(caught instanceof Error?caught.message:'The photo could not be deleted.');}}});
  const invitePreviewToGroup=async(person:FeaturedCompanion)=>{
    let currentSnapshot=snapshot;
    let invited=currentSnapshot.characters.find((item)=>item.character_template_id===person.id||item.together_character_templates.slug===person.slug);
    try{
      if(!invited?.introduced_at&&!invited?.contact_added_at){
        currentSnapshot=await meetCompanion(person.id,'group_invite');
        setSnapshot(currentSnapshot);
        invited=currentSnapshot.characters.find((item)=>item.character_template_id===person.id||item.together_character_templates.slug===person.slug);
      }
      if(!invited)throw new Error(`${person.name} could not be prepared for this group.`);
      const currentCharacter=currentSnapshot.characters.find((item)=>item.id===character.id)??character;
      const world=characterResidentWorld(currentSnapshot,currentCharacter);
      const invitedWorld=characterResidentWorld(currentSnapshot,invited);
      if(!world||invitedWorld?.id!==world.id)throw new Error('Group companions must belong to the same world.');
      setCharacterPreview(null);
      router.push(newGroupPrefillHref({currentParticipantIds:[currentCharacter.id],invitedCharacterId:invited.id,worldId:world.id}) as never);
    }catch(caught){
      setCharacterPreview(null);
      setError(caught instanceof Error?caught.message:`${person.name} could not be invited right now.`);
    }
  };

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
    <View style={[styles.shell,desktopChat&&styles.shellDesktop]}>
      {showLeft ? <ChatConversationRail snapshot={snapshot} activeConversationId={conversation.id} /> : null}
      <View style={styles.conversation}>
        <ChatAmbientGlow compact={width < 720} />
        {width<720?<MobileChatMediaHeader
          key={conversation.id}
          name={character.together_character_templates.name}
          subtitle={location.trim().toLowerCase()==='home'?'At home':`At ${location}`}
          portraitSource={portraitSource}
          mediaSource={latestHeaderMedia?.signed_url?{uri:latestHeaderMedia.signed_url}:portraitSource}
          hasMedia={Boolean(latestHeaderMedia)}
          onBack={openMessagesInbox}
          onProfile={()=>router.push(`/character/${slug}` as never)}
          onPhoto={()=>setShowPhotoRequests(true)}
          onCall={()=>router.push(`/call?character=${character.id}&conversation=${conversation.id}` as never)}
          onMenu={()=>setShowConversationMenu((value)=>!value)}
          onMedia={latestHeaderMedia?()=>router.push(`/media/${latestHeaderMedia.id}` as never):undefined}
        />:<ChatHeader character={character} location={location} onBack={openMessagesInbox} onCall={()=>router.push(`/call?character=${character.id}&conversation=${conversation.id}` as never)} onMenu={()=>setShowConversationMenu((value)=>!value)} />}
        <ConnectionBanner sendFailed={messages.some((item)=>item.delivery_status==='failed')} sendScoped={showSendConnectionNotice}/>
        {!showRight?<MobileChatContextCard identityKey={conversation.id} name={character.together_character_templates.name} location={chatContext.scene.location} activity={chatContext.scene.activity} next={chatContext.nextCommitment?{title:chatContext.nextCommitment.title,detail:new Date(chatContext.nextCommitment.startsAt).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'}),onPress:chatContext.nextCommitment.kind==='plan'?()=>router.push(`/plan/${chatContext.nextCommitment!.id}` as never):undefined}:null} memoryCount={snapshot.memoryCounts?.[character.id]??snapshot.memories.filter((item)=>item.character_instance_id===character.id).length} memoryLocked={snapshot.entitlements?.entitlement_keys?.includes('memory_inspector')!==true} onMemory={()=>router.push(`/memories?character=${slug}` as never)} onPlan={activeSharedPlan?undefined:openPlanPicker}/>:null}
        {showConversationMenu ? <ConversationOverflowMenu
          title={character.together_character_templates.name}
          kind="direct"
          hasActivePlan={Boolean(activeSharedPlan)}
          favorite={isFavorite}
          favoriteBusy={favoriteBusy}
          pinned={isConversationPinned(conversation)}
          pinBusy={pinBusy}
          memoryLocked={snapshot.entitlements?.entitlement_keys?.includes('memory_inspector') !== true}
          onClose={()=>setShowConversationMenu(false)}
          onFavorite={toggleFavorite}
          onPin={()=>void togglePinned()}
          onDetails={()=>{setShowConversationMenu(false);router.push(`/character/${slug}` as never);}}
          onMemory={()=>{setShowConversationMenu(false);router.push(`/memories?character=${slug}` as never);}}
          onHistory={()=>{setShowConversationMenu(false);router.push(`/conversations/${character.id}` as never);}}
          onCreatePlan={()=>{openPlanPicker();setShowConversationMenu(false);}}
          onChangePlan={()=>{if(activeSharedPlan)openPlanPicker();setShowConversationMenu(false);}}
          onEndPlan={()=>{setShowConversationMenu(false);if(activeSharedPlan)requestEndPlan(activeSharedPlan);}}
          onSettings={()=>{setShowConversationMenu(false);setShowChatSettings(true);}}
          onFresh={startNewConversation}
          onAdvanced={()=>{setShowConversationMenu(false);router.push(`/conversation-controls?character=${encodeURIComponent(character.id)}` as never);}}
          onDelete={deleteConversation}
        /> : null}
        <ChatSettingsModal visible={showChatSettings} conversation={conversation} character={character} onClose={()=>setShowChatSettings(false)} />
        <CharacterProfilePreviewModal companion={characterPreview} onClose={()=>setCharacterPreview(null)} onViewProfile={(person)=>{setCharacterPreview(null);router.push(`/character/${person.slug}` as never);}} onInviteToGroup={invitePreviewToGroup} />
        <VoiceNotePurchaseModal visible={Boolean(voiceNotePrompt)} name={voiceNotePrompt?.name??character.together_character_templates.name} creditCost={voiceNotePrompt?.creditCost??0} creditBalance={voiceNotePrompt?.creditBalance??0} shortened={voiceNotePrompt?.shortened} busy={voiceNotePromptBusy} onClose={()=>finishVoiceNotePrompt(null)} onConfirm={(hideFuture)=>finishVoiceNotePrompt({hideFuture})} onBuyCredits={()=>{finishVoiceNotePrompt(null);router.push(creditsSubscriptionHref as never);}}/>
        <MediaRequestModal visible={showPhotoRequests} character={character} conversationId={conversation.id} onPhotoRequest={(request)=>{setShowPhotoRequests(false);void send(request);}} photoSharingEntitled={photoSharingEntitled} onShareLibrary={()=>void requestSharePhoto('library')} onTakePhoto={Platform.OS==='web'?undefined:()=>void requestSharePhoto('camera')} onPhotoSharingUpgrade={()=>{setShowPhotoRequests(false);setShowPhotoPaywall(true);}} onVideoCreated={(media)=>{upsertMedia(media);setReconcilingMediaId(media.id);setShowPhotoRequests(false);router.push(`/media/${media.id}` as never);}} onBuyCredits={()=>{setShowPhotoRequests(false);router.push(creditsSubscriptionHref as never);}} onClose={()=>setShowPhotoRequests(false)}/>
        <PhotoSharingPaywallModal visible={showPhotoPaywall} onClose={()=>setShowPhotoPaywall(false)} onUpgrade={()=>{setShowPhotoPaywall(false);router.push(photoSharingSubscriptionHref as never);}}/>
        <AutoDialogueOptionsModal visible={showAutoDialogueOptions} name={character.together_character_templates.name} hasSuggestion={Boolean(autoDialogue)} onChoose={(preference)=>void requestAutoDialogue(preference)} onClose={()=>setShowAutoDialogueOptions(false)}/>
        <PlanDetailsModal visible={Boolean(planModal)} planId={planModal?.planId??null} confirmCancel={planModal?.confirmCancel} onClose={()=>setPlanModal(null)}/>
        <EndPlanConfirmation visible={Boolean(planEndTarget)} plan={planEndTarget} busy={Boolean(planEndTarget&&planActionBusyId===planEndTarget.id)} onClose={()=>{if(!planActionBusyId)setPlanEndTarget(null);}} onConfirm={()=>void confirmEndPlan()}/>
        {showPlans ? <ScrollView style={styles.planScroll} contentContainerStyle={styles.planScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <PlanSelection snapshot={snapshot} character={character} scopedLocationId={resolveScopedLocation(snapshot,params.location,params.world,pendingActions.find((item)=>item.id===pendingActionId),params.repeatPlanId)} currentLocationId={chatContext.scene.locationId} initialActivityKey={params.activity} repeatPlanId={params.repeatPlanId} proposal={pendingActions.find((item)=>item.id===pendingActionId)} initialTimingChoice={switchPlanId?'now':initialPlanTimingChoice??undefined} mode={switchPlanId?'switch':'create'} currentPlan={switchPlanId?(snapshot.sharedPlans??[]).find((item)=>item.id===switchPlanId)??null:null} interests={[...(snapshot.profile?.interests??[]),...snapshot.memories.filter((item)=>item.character_instance_id===character.id&&item.memory_type==='preference').map((item)=>item.canonical_text)]} busy={planning} error={error} onPlan={(option,timing) => void plan(option,timing)} onClose={() => {setShowPlans(false);setPendingActionId(null);setSwitchPlanId(null);setInitialPlanTimingChoice(null);router.setParams({plan:undefined,location:undefined,world:undefined,activity:undefined,switchPlanId:undefined});}} />
        </ScrollView> : <VirtualizedConversationList
          listRef={scroll}
          style={styles.messageScroll}
          contentContainerStyle={[styles.messages,desktopChat&&styles.messagesDesktop]}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={32}
          onScrollBeginDrag={()=>{cancelInitialBottomPin();activeBottomPinRequest.current=null;forcePinnedUntil.current=0;keepPinnedToBottom.current=false;if(bottomPinReleaseTimer.current)clearTimeout(bottomPinReleaseTimer.current);}}
          onScroll={(event)=>{
            const native=event.nativeEvent,offsetY=native.contentOffset.y,now=Date.now(),forced=initialBottomPinConversation.current===conversation.id||activeBottomPinRequest.current!==null||forcePinnedUntil.current>now,previousOffset=scrollOffsetY.current;
            keepPinnedToBottom.current=shouldKeepChatPinned({contentHeight:native.contentSize.height,viewportHeight:native.layoutMeasurement.height,offsetY},forced?Number.POSITIVE_INFINITY:forcePinnedUntil.current,now);
            viewportHeight.current=native.layoutMeasurement.height;
            saveChatScrollPosition(conversation.id,{offsetY,contentHeight:native.contentSize.height,viewportHeight:native.layoutMeasurement.height});
            setShowJumpToLatest(!forced&&!keepPinnedToBottom.current);
            scrollOffsetY.current=offsetY;
            const userReachedHistoryStart=shouldLoadOlderChatMessages({bottomAligned:bottomAlignedConversation.current===conversation.id,forcedBottomPin:forced,programmaticScrollUntil:programmaticScrollUntil.current,now,offsetY,previousOffsetY:previousOffset});
            if(userReachedHistoryStart)void loadOlder();
          }}
          onLayout={(event)=>{viewportHeight.current=event.nativeEvent.layout.height;if(keepPinnedToBottom.current&&bottomAlignedConversation.current===conversation.id)setTimeout(()=>scrollToLatest(false),0);}}
          onContentSizeChange={(_,height)=>{
            contentHeight.current=height;
            if(prepending.current){
              const offset=preservedPrependOffset({previousOffsetY:previousOffsetY.current,previousContentHeight:previousHeight.current,nextContentHeight:height});
              prepending.current=false;scrollOffsetY.current=offset;programmaticScrollUntil.current=Date.now()+350;
              setTimeout(()=>scroll.current?.scrollToOffset({offset,animated:false}),0);
              return;
            }
            if(pendingScrollRestore.current){
              const saved=pendingScrollRestore.current,offset=restoredChatOffset(saved,height,viewportHeight.current||saved.viewportHeight);
              pendingScrollRestore.current=null;scrollOffsetY.current=offset;bottomAlignedConversation.current=conversation.id;programmaticScrollUntil.current=Date.now()+350;
              setTimeout(()=>scroll.current?.scrollToOffset({offset,animated:false}),0);
              return;
            }
            if(initialBottomPinConversation.current===conversation.id){
              keepPinnedToBottom.current=true;
              scrollToLatest(false);
              bottomAlignedConversation.current=conversation.id;
              settleInitialBottomPin(conversation.id);
              return;
            }
            if(conversationReady&&bottomAlignedConversation.current!==conversation.id){keepPinnedToBottom.current=true;scrollToLatest(false);bottomAlignedConversation.current=conversation.id;return;}
            if(conversationReady&&(keepPinnedToBottom.current||activeBottomPinRequest.current!==null||forcePinnedUntil.current>Date.now()))scrollToLatest(false);
          }}
        >
          {loadingOlder?<Text style={styles.olderLoading}>Loading earlier messages…</Text>:conversationReady&&!hasMore&&visibleMessages.length?<Text style={styles.historyStart}>Beginning of this conversation</Text>:null}
          <SceneCard character={character} context={chatContext} snapshot={snapshot} roster={sharedSceneRoster} />
          {isCoPresent&&sharedSceneRoster?.availableCharacters.length?<SharedSceneInvite people={sharedSceneRoster.availableCharacters} busy={interactionLoading} onJoin={(person)=>void addSceneParticipant(person)}/>:null}
          {!conversationReady?<ConversationHistoryLoading name={character.together_character_templates.name}/>:visibleMessages.length===0?<EmptyConversation character={character} prompts={prompts} onPrompt={stageManualInput} />:null}
          {mergeChatTimeline(visibleMessages,pendingActions,(snapshot.conversationEvents??[]).filter((event)=>event.conversation_id===conversation.id&&shouldShowPlanTimelineEvent(event)),unreadWindow.current.lastReadAt,unreadWindow.current.openedAt,seamlessCompletionIds.current).map((item,index,timeline)=>item.kind==='separator'?<Text key={item.key} style={[styles.day,item.label==='NEW'&&{color:colors.rose}]}>{item.label}</Text>:item.kind==='message'?<MessageBubble key={item.value.id} desktop={desktopChat} message={item.value} character={character} mentionCharacters={mentionCharacters} onCharacterMention={setCharacterPreview} media={generatedMedia.filter((media)=>media.message_id===item.value.id)} photoOffer={photoOfferForMessage(mediaOffers,item.value.id)} photoPreviewSource={mediaOfferPreviewSource} photoOfferBusy={mediaOfferBusy===photoOfferForMessage(mediaOffers,item.value.id)?.id} grouped={index>0&&timeline[index-1]?.kind==='message'&&shouldGroupChatMessages((timeline[index-1] as {kind:'message';value:Message}).value,item.value)} textStyle={messageTypography} reactionNames={sharedSceneReactionNames} voiceVisible={snapshot.profile?.multimodal_preferences?.companionVoiceNotes!==false} voiceEnabled={snapshot.experienceCapabilities?.voiceNotes!==false} memoryManualControl={snapshot.entitlements?.entitlement_keys?.includes('memory_manual_control')===true} favorite={isMessageFavorite(item.value)} canContinue={canContinueMessage(item.value,visibleMessages)&&!replyPending&&!pendingImage} onFavorite={()=>toggleMessageSaved(item.value)} onContinue={()=>send('Continue.',undefined,undefined,{messageAction:'continue',anchorMessageId:item.value.id})} onSuggest={()=>requestAutoDialogue()} onPlan={openPlanPicker} onPhoto={()=>setShowPhotoRequests(true)} onFresh={startNewConversation} seamlessCompletion={seamlessCompletionIds.current.has(item.value.id)} activeVoiceNoteId={activeVoiceNoteId} onVoiceActivate={setActiveVoiceNoteId} onVoiceRequest={requestVoiceWithConfirmation} onRemember={async(messageId)=>{try{await rememberMessage(messageId,character.id);await refresh();setMemorySavedNotice({id:Date.now(),name:character.together_character_templates.name});}catch(caught){Alert.alert('Could not remember that',caught instanceof Error?caught.message:'Please try again.');}}} onDeletePhoto={deleteSharedPhoto} onPhotoOfferAccept={(offer,paymentMethod)=>void acceptOffer(offer,paymentMethod)} onPhotoOfferDecline={(offer)=>void declineOffer(offer)} onMediaRetry={async(mediaId)=>{const result=await manageMedia<{media:GeneratedMedia}>({action:'retry',mediaId});upsertMedia(result.media);setReconcilingMediaId(result.media.id);}} onFailedRetry={item.value.delivery_status==='failed'?()=>void send(item.value.content,item.value.client_request_id??undefined,item.value.id):undefined} onFailedEdit={item.value.delivery_status==='failed'?()=>{setMessages((current)=>current.filter((message)=>message.id!==item.value.id));stageManualInput(item.value.content);setError('');}:undefined} onFailedDiscard={item.value.delivery_status==='failed'?()=>{setMessages((current)=>current.filter((message)=>message.id!==item.value.id));if(currentInput.current.trim()===item.value.content.trim()){setInput('');currentInput.current='';}setError('');}:undefined}/>:item.kind==='voice_call'?<VoiceCallEventRow key={item.value.id} value={item.value}/>:item.kind==='action'?<ConversationActionCard key={item.value.id} action={item.value} busy={planning} onConfirm={async(planId)=>{const proposed=typeof item.value.payload.proposedStartsAt==='string'?item.value.payload.proposedStartsAt:null,validProposed=Boolean(proposed&&new Date(proposed).getTime()>=Date.now()+10*60000),direct=['plan_cancel','cancel_plan'].includes(item.value.candidate_type)||validProposed||Boolean(planId);if(!direct){setPendingActionId(item.value.id);setSwitchPlanId(null);setShowPlans(true);return;}setPlanning(true);try{await confirmConversationAction(item.value.id,{planId,startsAt:validProposed?proposed??undefined:undefined});await refresh();}catch(caught){setError(caught instanceof Error?caught.message:'That action could not be completed.');}finally{setPlanning(false);}}} onChange={()=>{setPendingActionId(item.value.id);setSwitchPlanId(null);setShowPlans(true);}} onDismiss={()=>{const action=item.value;removeConversationAction(action.id);void dismissConversationAction(action.id).catch((caught)=>{upsertConversationAction(action);setError(caught instanceof Error?caught.message:'That suggestion could not be dismissed.');});}}/>:isPlanLifecycleDividerEvent(item.value)?<PlanLifecycleDivider key={item.value.id} event={item.value} companionName={character.together_character_templates.name}/>:<PlanTimelineCard key={item.value.id} event={item.value} plan={(snapshot.sharedPlans??[]).find((plan)=>plan.id===item.value.entity_id)} locationName={snapshot.locations.find((location)=>location.id===(snapshot.sharedPlans??[]).find((plan)=>plan.id===item.value.entity_id)?.location_id)?.name} busy={planActionBusyId===item.value.entity_id||planning} onOpen={(plan)=>setPlanModal({planId:plan.id})} onStart={(plan)=>void startTimelinePlan(plan)} onEnd={requestEndPlan} onCancel={(plan)=>setPlanModal({planId:plan.id,confirmCancel:true})}/>) }
          {orphanMediaOffers.map((offer)=><ChatPhotoRequestCard key={offer.id} offer={offer} media={generatedMedia.find((item)=>item.id===offer.generated_media_id)} previewSource={mediaOfferPreviewSource} busy={mediaOfferBusy===offer.id} onAccept={(paymentMethod)=>void acceptOffer(offer,paymentMethod)} onDecline={()=>void declineOffer(offer)} onBuyCredits={()=>router.push(creditsSubscriptionHref as never)} onRetry={offer.generated_media_id?()=>{void manageMedia<{media:GeneratedMedia}>({action:'retry',mediaId:String(offer.generated_media_id)}).then((result)=>{upsertMedia(result.media);setReconcilingMediaId(result.media.id);});}:undefined}/>) }
          {awaitingPhotoOffer?<ChatPhotoRequestCard previewSource={mediaOfferPreviewSource} preparing busy={false} onAccept={()=>undefined} onDecline={()=>undefined} onBuyCredits={()=>router.push(creditsSubscriptionHref as never)}/>:null}
          {stream ? <StreamingBubble desktop={desktopChat} character={character} content={stream} textStyle={messageTypography} reserveVoiceControl={snapshot.profile?.multimodal_preferences?.companionVoiceNotes!==false} /> : null}
          {replyPending && !stream && !awaitingPhotoOffer && pendingDialogue?.showTyping!==false ? <TypingState name={character.together_character_templates.name} /> : null}
          {milestone ? <RelationshipMomentCard milestone={milestone} busy={resolvingMilestone} onChoose={(action)=>void resolveMilestone(action)} /> : null}
          {characterProposal?<CharacterProposalCard name={character.together_character_templates.name} proposal={characterProposal} busy={interactionLoading} onAccept={()=>void acceptCharacterProposal()} onDismiss={()=>void dismissCharacterProposal()}/>:null}
          {lastInteraction?<SceneActionFeedback feedback={lastInteraction} name={character.together_character_templates.name} onDismiss={()=>setLastInteraction(null)} />:null}
          {feedback ? <StoryFeedback feedback={feedback} onView={() => router.push(feedback.kind === 'memory' ? '/memories' : feedback.kind==='plan'? '/(tabs)/dates':'/moments')} onUndo={feedback.kind === 'memory' ? () => void undoMemory() : undefined} onDismiss={() => setFeedback(null)} /> : null}
          {error ? <Pressable onPress={() => { const failed = [...visibleMessages].reverse().find((item) => item.delivery_status === 'failed'); if (failed) void send(failed.content,failed.client_request_id??undefined,failed.id); }} style={styles.retry}><Text style={styles.retryText}>{error}{visibleMessages.some((item) => item.delivery_status === 'failed') ? ' Tap to retry.' : ''}</Text></Pressable> : null}
        </VirtualizedConversationList>}
        <JumpToLatestButton visible={!showPlans&&showJumpToLatest} bottom={width<720?104:92} onPress={()=>{keepPinnedToBottom.current=true;setShowJumpToLatest(false);clearChatScrollPosition(conversation.id);scrollToLatest(true);}}/>
        {showInteractions?<InteractionTray name={character.together_character_templates.name} location={location} loading={interactionLoading} interactions={interactionCandidates} destinations={movementCandidates} onInteraction={(candidate)=>void executeInteraction(candidate)} onMove={(candidate)=>void moveScene(candidate)} onClose={()=>setShowInteractions(false)} />:isCoPresent&&interactionCandidates.length?<ContextualInteractionTray loading={interactionLoading} interactions={interactionCandidates.slice(0,3)} onOpen={()=>setShowInteractions(true)} onInteraction={(candidate)=>void executeInteraction(candidate)} />:null}
        {!activeSharedPlan&&joinableSharedPlan?<PlanJoinBar plan={joinableSharedPlan} locationName={snapshot.locations.find((item)=>item.id===joinableSharedPlan.location_id)?.name} busy={planActionBusyId===joinableSharedPlan.id||planning} onJoin={()=>void startTimelinePlan(joinableSharedPlan)} onDetails={()=>setPlanModal({planId:joinableSharedPlan.id})}/>:null}
        {focusPlanId&&focusPlanId!==activeSharedPlan?.id?<PlanFocusChip plan={(snapshot.sharedPlans??[]).find((item)=>item.id===focusPlanId)} onOpen={(id)=>router.push(`/plan/${id}` as never)} onClose={()=>{setFocusPlanId(null);setFocusDismissed(true);}}/>:null}
        {memorySavedNotice?<MemorySavedToast key={memorySavedNotice.id} name={memorySavedNotice.name} onDismiss={()=>setMemorySavedNotice(null)}/>:null}
        <Composer compact={width<720} desktop={desktopChat} inputRef={composerInput} conversationId={conversation.id} character={character} input={input} onChangeInput={changeComposerInput} onDictation={(text)=>stageManualInput(mergeDictationTranscript(currentInput.current,text))} onDictationError={setError} onDictationStart={()=>setActiveVoiceNoteId(null)} pendingImage={pendingImage} photoUploadPhase={photoUploadPhase} onAddPhoto={()=>void requestSharePhoto('library')} onRemovePhoto={clearPendingImage} sending={replyPending||!conversationReady} onSend={() => void send()} onPhoto={()=>setShowPhotoRequests((value)=>!value)} autoDialogue={autoDialogue} autoDialogueBusy={autoDialogueBusy} canSuggest={Boolean(conversationReady&&latestAssistantMessage&&!milestone&&!replyPending&&!pendingImage)} onSuggest={()=>void requestAutoDialogue()} onSuggestOptions={openAutoDialogueOptions} onClearSuggestion={clearAutoDialogue} onLayout={()=>{const requestId=activeBottomPinRequest.current;if(requestId)settleSentMessageAtBottom(requestId);}} />
      </View>
      {showRight ? <ContextRail snapshot={snapshot} character={character} context={chatContext} activePlan={activeSharedPlan} onPrompt={stageManualInput} onPlan={openPlanPicker} /> : null}
    </View>
  </KeyboardAvoidingView>;
}

type VirtualizedConversationListProps=Omit<FlatListProps<ReactElement>,'data'|'renderItem'|'keyExtractor'>&{
  children:ReactNode;
  listRef:RefObject<FlatList<ReactElement>|null>;
};

function VirtualizedConversationList({children,listRef,...props}:VirtualizedConversationListProps){
  const rows=Children.toArray(children).filter(isValidElement);
  return <FlatList
    {...props}
    ref={listRef}
    data={rows}
    keyExtractor={(item,index)=>String(item.key??`timeline-${index}`)}
    renderItem={({item})=>item}
    initialNumToRender={18}
    maxToRenderPerBatch={12}
    updateCellsBatchingPeriod={24}
    windowSize={9}
    removeClippedSubviews={Platform.OS!=='web'}
  />;
}

function writeMessageCache(cache:Map<string,{messages:Message[];hasMore:boolean}>,conversationId:string,messages:Message[],hasMore:boolean){
  const trimmed=messages.length>MESSAGE_CACHE_ROWS?messages.slice(-MESSAGE_CACHE_ROWS):messages;
  cache.delete(conversationId);
  cache.set(conversationId,{messages:trimmed,hasMore:hasMore||trimmed.length<messages.length});
  while(cache.size>MESSAGE_CACHE_CONVERSATIONS){
    const oldestKey=cache.keys().next().value as string|undefined;
    if(!oldestKey)break;
    cache.delete(oldestKey);
  }
}

function ChatAmbientGlow({compact}:{compact:boolean}) {
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.chatGlowLayer}>
    <View style={[styles.chatGlow,styles.chatGlowRose,compact&&styles.chatGlowRoseCompact]} />
    <View style={[styles.chatGlow,styles.chatGlowViolet,compact&&styles.chatGlowVioletCompact]} />
    <View style={[styles.chatGlow,styles.chatGlowCenter,compact&&styles.chatGlowCenterCompact]} />
  </View>;
}

function ChatHeader({character,location,onBack,onCall,onMenu}:{character:CharacterInstance;location:string;onBack:()=>void;onCall:()=>void;onMenu:()=>void}) { const slug=character.together_character_templates.slug,locationStatus=location.trim().toLowerCase()==='home'?'At home':`At ${location}`;return <View style={[styles.header, Platform.OS === 'web' && styles.webHeader]}><Pressable accessibilityRole="button" accessibilityLabel="Back to Messages" onPress={onBack} style={styles.icon}><ArrowLeft color={colors.text}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`View ${character.together_character_templates.name}'s profile`} onPress={()=>router.push(`/character/${slug}` as never)}><CharacterAvatar slug={slug} name={character.together_character_templates.name} size={42}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`View ${character.together_character_templates.name}'s profile`} onPress={()=>router.push(`/character/${slug}` as never)} style={styles.headerIdentity}><Text numberOfLines={1} style={[styles.name,styles.desktopHeaderName]}>{character.together_character_templates.name}</Text><Text numberOfLines={1} style={[styles.status,styles.desktopHeaderStatus]}>{locationStatus}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Call ${character.together_character_templates.name}`} onPress={onCall} style={styles.icon}><Phone size={18} color={colors.text}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Conversation menu" onPress={onMenu} style={styles.icon}><MoreHorizontal color={colors.text}/></Pressable></View>; }


function ConversationHistoryLoading({name}:{name:string}){return <View style={styles.conversationLoading}><View style={styles.conversationLoadingAvatar}/><View style={{flex:1,gap:7}}><View style={styles.conversationLoadingLine}/><View style={[styles.conversationLoadingLine,styles.conversationLoadingLineShort]}/></View><Text style={styles.conversationLoadingText}>Opening {name}…</Text></View>;}

function ContextRail({snapshot,character,context,activePlan,onPrompt,onPlan}:{snapshot:Snapshot;character:CharacterInstance;context:ClientConversationContext;activePlan:SharedPlan|null;onPrompt:(value:string)=>void;onPlan:()=>void}) { const memories=snapshot.memories.filter((item)=>item.character_instance_id===character.id).slice(0,3),memoryInspector=snapshot.entitlements?.entitlement_keys?.includes('memory_inspector')===true,memoryCount=snapshot.memoryCounts?.[character.id]??memories.length;return <ScrollView style={styles.rightRail} contentContainerStyle={styles.rightContent}><Image source={characterAssets[character.together_character_templates.slug]} style={styles.contextPortrait} contentFit="cover" contentPosition="top"/><Text style={[styles.contextName,styles.desktopContextName]}>{character.together_character_templates.name}</Text><Text style={[styles.contextBio,styles.desktopContextBio]}>{character.together_character_templates.occupation} · {relationshipLabel(character.relationship_stage)}</Text>{context.nextCommitment?<ContextSection title="NEXT TOGETHER"><Pressable onPress={()=>context.nextCommitment?.kind==='plan'&&router.push(`/plan/${context.nextCommitment.id}` as never)}><ContextLine icon={<CalendarDays size={15} color={colors.rose}/>} title={context.nextCommitment.title} body={`${new Date(context.nextCommitment.startsAt).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'})}${context.nextCommitment.location?` · ${context.nextCommitment.location}`:''}`}/></Pressable></ContextSection>:null}<ContextSection title={context.interactionMode==='co_present'?'TOGETHER NOW':`${character.together_character_templates.name.toUpperCase()} RIGHT NOW`}><ContextLine icon={<MapPin size={15} color={colors.warm}/>} title={context.scene.location} body={context.scene.activity}/></ContextSection>{context.story?<ContextSection title="CURRENT STORY"><ContextLine icon={<Sparkles size={15} color={colors.violet}/>} title={context.story.title} body={context.story.chapter}/></ContextSection>:null}{context.thread?<Pressable onPress={()=>onPrompt(context.thread!.prompt)} style={styles.threadCard}><CalendarDays size={16} color={colors.rose}/><View style={{flex:1}}><Text style={[styles.threadTitle,styles.desktopThreadTitle]}>FOLLOW UP</Text><Text style={[styles.contextCopy,styles.desktopContextCopy]}>{context.thread.label}</Text></View><ChevronRight size={16} color={colors.muted}/></Pressable>:null}<ContextSection title={`WHAT ${character.together_character_templates.name.toUpperCase()} REMEMBERS`}>{memoryInspector?(memories.length?memories.map((memory)=><Pressable key={memory.id} onPress={()=>router.push(`/memories?character=${character.together_character_templates.slug}` as never)} style={styles.memoryLine}><Brain size={14} color={memory.pinned?colors.rose:colors.violet}/><Text style={[styles.contextCopy,styles.desktopContextCopy]} numberOfLines={2}>{presentMemoryText(memory.canonical_text,character.together_character_templates.name)}</Text></Pressable>):<Text style={[styles.contextMuted,styles.desktopContextCopy]}>Meaningful details will collect here.</Text>):<Pressable onPress={()=>router.push(`/memories?character=${character.together_character_templates.slug}` as never)} style={styles.memoryLine}><LockKeyhole size={14} color={colors.violet}/><Text style={[styles.contextCopy,styles.desktopContextCopy]}>{memoryCount} saved {memoryCount===1?'detail':'details'} · Kivelle+</Text></Pressable>}</ContextSection>{!activePlan?<Pressable onPress={onPlan} style={styles.planButton}><CalendarDays size={17} color="#fff"/><Text style={[styles.planButtonText,styles.desktopContextButtonText]}>Plan something</Text></Pressable>:null}<Pressable onPress={()=>router.push(`/memories?character=${character.together_character_templates.slug}` as never)} style={styles.secondaryButton}>{memoryInspector?<Brain size={17} color={colors.rose}/>:<LockKeyhole size={17} color={colors.rose}/>}<Text style={[styles.secondaryButtonText,styles.desktopContextButtonText]}>{memoryInspector?'Memory Center':'Memory Center · Kivelle+'}</Text></Pressable></ScrollView>; }

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

function MessageBubble({desktop,message,character,mentionCharacters,onCharacterMention,media,photoOffer,photoPreviewSource,photoOfferBusy,grouped,textStyle,reactionNames,voiceVisible,voiceEnabled,memoryManualControl,favorite,canContinue,onFavorite,onContinue,onSuggest,onPlan,onPhoto,onFresh,seamlessCompletion,activeVoiceNoteId,onVoiceActivate,onVoiceRequest,onRemember,onDeletePhoto,onPhotoOfferAccept,onPhotoOfferDecline,onMediaRetry,onFailedRetry,onFailedEdit,onFailedDiscard}:{desktop:boolean;message:Message;character:CharacterInstance;mentionCharacters:FeaturedCompanion[];onCharacterMention:(character:FeaturedCompanion)=>void;media:GeneratedMedia[];photoOffer:MediaOffer|null;photoPreviewSource?:ImageSource|number;photoOfferBusy:boolean;grouped:boolean;textStyle:{fontSize:number;lineHeight:number};reactionNames:Record<string,string>;voiceVisible:boolean;voiceEnabled:boolean;memoryManualControl:boolean;favorite:boolean;canContinue:boolean;onFavorite:()=>void|Promise<void>;onContinue:()=>void|Promise<void>;onSuggest:()=>void|Promise<void>;onPlan:()=>void;onPhoto:()=>void;onFresh:()=>void;seamlessCompletion:boolean;activeVoiceNoteId:string|null;onVoiceActivate:(id:string|null)=>void;onVoiceRequest:(messageId:string,name:string)=>Promise<VoiceNoteRequestResult|null>;onRemember:(messageId:string)=>Promise<void>;onDeletePhoto:(attachment:ConversationAttachment)=>void;onPhotoOfferAccept:(offer:MediaOffer,paymentMethod:'credits'|'daily_included')=>void;onPhotoOfferDecline:(offer:MediaOffer)=>void;onMediaRetry:(id:string)=>Promise<void>;onFailedRetry?:()=>void;onFailedEdit?:()=>void;onFailedDiscard?:()=>void}) {
  const[actionsOpen,setActionsOpen]=useState(false),[voiceBusy,setVoiceBusy]=useState(false),[localVoice,setLocalVoice]=useState<GeneratedMedia|undefined>();const opacity=useRef(new Animated.Value(seamlessCompletion?1:0)).current;const translate=useRef(new Animated.Value(seamlessCompletion?0:8)).current;const completionControlsOpacity=useRef(new Animated.Value(seamlessCompletion?0:1)).current;
  useEffect(()=>{
    if(seamlessCompletion){Animated.timing(completionControlsOpacity,{toValue:1,duration:140,useNativeDriver:true}).start();return;}
    Animated.parallel([Animated.timing(opacity,{toValue:1,duration:220,useNativeDriver:true}),Animated.timing(translate,{toValue:0,duration:220,useNativeDriver:true})]).start();
  },[completionControlsOpacity,opacity,seamlessCompletion,translate]);
  const assistant=message.role==='assistant',photoOnly=isPhotoOnlyConversationMessage(message),attachments=message.attachments??message.together_conversation_attachments??[],images=visibleChatPhotoMedia(media),voice=localVoice??media.find((item)=>item.media_type==='voice_note'),speakerName=String(message.provider_metadata?.speakerName??character.together_character_templates.name),speakerSlug=String(message.provider_metadata?.speakerSlug??character.together_character_templates.slug);
  const photoMedia=photoMediaForOffer(media,photoOffer?.generated_media_id);
  // The active offer owns its pending and failed presentation. Excluding its
  // linked media here prevents the legacy MediaTile loader from appearing
  // beside the blurred inline offer card.
  const standaloneImages=mediaWithoutActivePhotoOffer(images,photoOffer?photoMedia?.id:null);
  if(photoOnly&&!photoMedia&&!photoOffer)return null;
  if(photoOnly)return <Animated.View style={[{width:'100%',maxWidth:430,alignSelf:'flex-start',marginVertical:2},{opacity,transform:[{translateY:translate}]}]}><ChatPhotoRequestCard offer={photoOffer} media={photoMedia} previewSource={photoPreviewSource} busy={photoOfferBusy} onAccept={(paymentMethod)=>{if(photoOffer)onPhotoOfferAccept(photoOffer,paymentMethod);}} onDecline={()=>{if(photoOffer)onPhotoOfferDecline(photoOffer);}} onBuyCredits={()=>router.push(subscriptionHref({intent:'credits'}) as never)} onRetry={photoMedia||photoOffer?.generated_media_id?()=>void onMediaRetry(photoMedia?.id??String(photoOffer?.generated_media_id)):undefined}/></Animated.View>;
  const onVoice=async()=>{if(voiceBusy)return;setVoiceBusy(true);try{const result=await onVoiceRequest(message.id,speakerName);if(!result)return;if(result.status==='not_configured'){Alert.alert('Voice note',result.message??"Voice isn't connected yet.");return;}if(result.media){setLocalVoice(result.media);if(result.media.status==='ready'&&Platform.OS!=='web')onVoiceActivate(result.media.id);}}catch(caught){Alert.alert('Voice note',caught instanceof Error?caught.message:'The voice note could not be generated.');}finally{setVoiceBusy(false);}};
  const refreshVoice=async()=>{if(!voice)return;const result=await refreshVoiceNote(voice.id);setLocalVoice(result.media);};
  const voiceAction=()=>{if(!voiceEnabled){router.push(subscriptionHref({intent:'voice'}) as never);return;}if(voice){onVoiceActivate(activeVoiceNoteId===voice.id?null:voice.id);return;}return onVoice();};
  const actionItems:MessageActionDefinition[]=[
    ...(assistant&&canContinue?[{key:'continue',label:'Continue',icon:<FastForward size={23} color={colors.textSecondary}/>,onPress:onContinue}]:[]),
    ...(memoryManualControl&&!message.id.startsWith('local-')?[{key:'memory',label:'Memory',icon:<Brain size={23} color={colors.textSecondary}/>,onPress:()=>onRemember(message.id)}]:[]),
    {key:'copy',label:'Copy',icon:<Copy size={23} color={colors.textSecondary}/>,onPress:()=>Clipboard.setStringAsync(message.content)},
    ...(!message.id.startsWith('local-')?[{key:'favorite',label:favorite?'Favorited':'Favorite',icon:<Heart size={23} color={favorite?colors.rose:colors.textSecondary} fill={favorite?colors.rose:'transparent'}/>,selected:favorite,onPress:onFavorite}]:[]),
    ...(assistant&&voiceVisible?[{key:'voice',label:voice?'Voice':'Listen',icon:<Volume2 size={23} color={voiceEnabled?colors.textSecondary:colors.muted}/>,onPress:voiceAction}]:[]),
    ...(assistant&&canContinue?[{key:'suggest',label:'Suggest reply',icon:<Wand2 size={23} color={colors.textSecondary}/>,onPress:onSuggest}]:[]),
    ...(assistant?[{key:'plan',label:'Plan something',icon:<CalendarDays size={23} color={colors.textSecondary}/>,onPress:onPlan},{key:'photo',label:'Ask for photo',icon:<Camera size={23} color={colors.textSecondary}/>,onPress:onPhoto}]:[]),
    ...(!assistant&&attachments.length&&!message.id.startsWith('local-')?[{key:'delete-photo',label:'Delete photo',icon:<Trash2 size={23} color={colors.danger}/>,destructive:true,onPress:()=>onDeletePhoto(attachments[0]!)}]:[]),
    {key:'fresh',label:'Fresh chat',icon:<MessageCircle size={23} color={colors.textSecondary}/>,onPress:onFresh},
    ...(assistant&&!message.id.startsWith('local-')?[{key:'report',label:'Report',icon:<Flag size={23} color={colors.muted}/>,onPress:()=>reportMessage(message.id,'other')}]:[]),
    ...(message.delivery_status==='failed'&&onFailedRetry?[{key:'retry',label:'Retry send',icon:<Undo2 size={23} color={colors.rose}/>,onPress:onFailedRetry}]:[]),
  ];
  return <><Animated.View style={[styles.messageRow,desktop&&styles.messageRowDesktop,assistant?styles.assistantRow:styles.userRow,{opacity,transform:[{translateY:translate}]}]}>
    {assistant&&!grouped?<CharacterAvatar slug={speakerSlug} size={28}/>:assistant?<View style={{width:28}}/>:null}
    <View style={styles.messageStack}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${assistant?speakerName:'Your'} message. Tap for actions.`} onPress={()=>setActionsOpen(true)} onLongPress={()=>setActionsOpen(true)} style={[styles.bubble,desktop&&styles.bubbleDesktop,assistant?styles.assistantBubble:styles.userBubble,message.delivery_status==='failed'&&styles.failed]}>
        {!photoOnly&&message.content!=='[Photo]'?(assistant?<CharacterMentionText text={message.content} characters={mentionCharacters} excludeSlug={speakerSlug} onCharacterPress={onCharacterMention} style={[styles.messageText,textStyle]}/>:<Text style={[styles.messageText,textStyle]}>{message.content}</Text>):!assistant&&!attachments.length?<Text style={[styles.messageText,textStyle,{opacity:.66}]}>Photo deleted</Text>:null}
        {attachments.map((attachment)=><Pressable key={attachment.id} accessibilityRole="button" accessibilityLabel="Open shared photo" onPress={()=>attachment.signed_url&&void Linking.openURL(attachment.signed_url)}><Image source={privateStoredImageSource(attachment.signed_url,attachment.storage_path)} style={styles.userAttachment} contentFit="cover" cachePolicy="memory-disk" priority="low" recyclingKey={attachment.id}/></Pressable>)}
        {standaloneImages.map((item)=><MediaTile key={item.id} media={item} style={styles.messageMedia} onRetry={()=>void onMediaRetry(item.id)}/>)}
        {assistant&&!photoOnly&&voiceVisible&&(voice||voiceBusy)?<Animated.View style={[styles.listenControlSlot,{opacity:completionControlsOpacity}]}>{voice?<VoiceNoteInline media={voice} active={activeVoiceNoteId===voice.id} onActivate={()=>onVoiceActivate(activeVoiceNoteId===voice.id?null:voice.id)} onRetry={()=>void onVoice()} onRefresh={()=>void refreshVoice()}/>:<View style={styles.voiceNote}><ActivityIndicator size="small" color={colors.rose}/><Text style={styles.voiceNoteText}>Generating voice…</Text></View>}</Animated.View>:null}
        <View style={styles.messageMeta}><Text style={[styles.timestamp,desktop&&styles.timestampDesktop,{opacity:.58}]}>{new Date(message.created_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</Text></View>
      </Pressable>
      {message.together_message_reactions?.length?<View style={styles.messageReactions}>{message.together_message_reactions.map((reaction:MessageReaction)=><View key={reaction.id} style={styles.messageReaction}><Text style={styles.messageReactionEmoji}>{reaction.reaction}</Text><Text style={styles.messageReactionName}>{reactionNames[reaction.reactor_character_instance_id]??String(reaction.metadata?.reactorName??'Companion').split(' ')[0]}</Text></View>)}</View>:null}
      {assistant&&photoOffer?<ChatPhotoRequestCard offer={photoOffer} media={photoMedia} previewSource={photoPreviewSource} busy={photoOfferBusy} onAccept={(paymentMethod)=>onPhotoOfferAccept(photoOffer,paymentMethod)} onDecline={()=>onPhotoOfferDecline(photoOffer)} onBuyCredits={()=>router.push(subscriptionHref({intent:'credits'}) as never)} onRetry={photoMedia||photoOffer.generated_media_id?()=>void onMediaRetry(photoMedia?.id??String(photoOffer.generated_media_id)):undefined}/>:null}
      {message.delivery_status==='failed'&&onFailedRetry&&onFailedEdit&&onFailedDiscard?<FailedMessageRecovery onRetry={onFailedRetry} onEdit={onFailedEdit} onDiscard={onFailedDiscard}/>:null}
    </View>
  </Animated.View><MessageActionSheet visible={actionsOpen} message={message.content} senderName={speakerName} sentAt={message.created_at} userMessage={!assistant} actions={actionItems} onClose={()=>setActionsOpen(false)}/></>;
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

function StreamingBubble({desktop,character,content,textStyle,reserveVoiceControl}:{desktop:boolean;character:CharacterInstance;content:string;textStyle:{fontSize:number;lineHeight:number};reserveVoiceControl:boolean}) { return <View style={[styles.messageRow,desktop&&styles.messageRowDesktop,styles.assistantRow]}><CharacterAvatar slug={character.together_character_templates.slug} size={28}/><View style={styles.messageStack}><View style={[styles.bubble,desktop&&styles.bubbleDesktop,styles.assistantBubble]}><Text style={[styles.messageText,textStyle]}>{content}<Text style={styles.cursor}>▍</Text></Text>{reserveVoiceControl?<View aria-hidden style={styles.listenPlaceholder}/>:null}<View style={styles.messageMeta}><Text style={[styles.timestamp,desktop&&styles.timestampDesktop]}>Now</Text></View></View></View></View>; }
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
  return <View style={styles.composerWrap}><View style={styles.quickActions}><Pressable onPress={onPhoto} style={[styles.quickAction,styles.quickActionFitted]}><Camera size={14} color={colors.rose}/><Text numberOfLines={1} style={[styles.quickText,styles.quickTextFitted]}>{compact?'Photo':'Ask for a photo'}</Text></Pressable><Pressable onPress={onPlan} style={[styles.quickAction,styles.quickActionFitted]}><CalendarDays size={14} color={colors.warm}/><Text numberOfLines={1} style={[styles.quickText,styles.quickTextFitted]}>{compact?'Plan':'Plan something'}</Text></Pressable><Pressable onPress={()=>router.push('/memories')} style={[styles.quickAction,styles.quickActionFitted]}><Brain size={14} color={colors.violet}/><Text numberOfLines={1} style={[styles.quickText,styles.quickTextFitted]}>Memories</Text></Pressable></View><View style={styles.composer}><TextInput value={input} onChangeText={setInput} placeholder={`Message ${character.together_character_templates.name}…`} placeholderTextColor={colors.dimmed} multiline style={[styles.input,styles.inputFitted]} textAlignVertical="top"/><Pressable accessibilityLabel="Send message" onPress={onSend} disabled={!input.trim()||sending||overLimit} style={[styles.send,(!input.trim()||sending||overLimit)&&styles.sendDisabled]}><Send color="#fff" size={19}/></Pressable></View><MessageCharacterCounter value={input}/></View>; }

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
function Composer({compact,desktop,inputRef,conversationId,character,input,onChangeInput,onDictation,onDictationError,onDictationStart,pendingImage,photoUploadPhase,onAddPhoto,onRemovePhoto,sending,onSend,onPhoto,autoDialogue,autoDialogueBusy,canSuggest,onSuggest,onSuggestOptions,onClearSuggestion,onLayout}:{compact:boolean;desktop:boolean;inputRef:{current:TextInput|null};conversationId:string;character:CharacterInstance;input:string;onChangeInput:(value:string)=>void;onDictation:(text:string)=>void;onDictationError:(message:string)=>void;onDictationStart:()=>void;pendingImage:PendingImage|null;photoUploadPhase:PhotoUploadPhase;onAddPhoto:()=>void;onRemovePhoto:()=>void;sending:boolean;onSend:()=>void;onPhoto:()=>void;autoDialogue:AutoDialogueSuggestion|null;autoDialogueBusy:boolean;canSuggest:boolean;onSuggest:()=>void;onSuggestOptions:()=>void;onClearSuggestion:()=>void;onLayout?:()=>void}) {
  const insets=useSafeAreaInsets();
  const [composerFocused,setComposerFocused]=useState(false);
  const dictation=useChatDictation({conversationId,characterInstanceId:character.id,disabled:sending||autoDialogueBusy,onBeforeStart:onDictationStart,onTranscript:onDictation,onError:onDictationError});
  const dictationBusy=dictation.phase!=='idle',overLimit=input.length>MESSAGE_CHARACTER_LIMIT,suggestMode=!input.trim()&&!pendingImage,actionDisabled=sending||autoDialogueBusy||dictationBusy||overLimit||(suggestMode&&!canSuggest),autoDialogueEdited=Boolean(autoDialogue&&input!==autoDialogue.text);
  const counter=<MessageCharacterCounter value={input}/>;
  return <View onLayout={onLayout} style={[styles.composerWrap,compact&&styles.composerWrapCompact,{paddingBottom:Math.max(8,insets.bottom)}]}>
    {pendingImage?<PhotoAttachmentPreview image={pendingImage} phase={photoUploadPhase} sending={sending} onReplace={onAddPhoto} onRemove={onRemovePhoto}/>:null}
    {compact?counter:null}
    <View style={[styles.composer,styles.composerAligned]}><View style={[styles.composerInputShell,styles.composerInputShellAligned,autoDialogue&&!autoDialogueEdited&&styles.composerInputSuggested,composerFocused&&styles.composerInputFocused]}><AiMediaButton name={character.together_character_templates.name} onPress={onPhoto} disabled={sending||autoDialogueBusy||dictationBusy}/><TextInput ref={inputRef} value={input} onChangeText={onChangeInput} onFocus={()=>setComposerFocused(true)} onBlur={()=>setComposerFocused(false)} onKeyPress={(event)=>{const nativeEvent=event.nativeEvent as typeof event.nativeEvent&{shiftKey?:boolean;isComposing?:boolean},intent={platform:Platform.OS,key:nativeEvent.key,shiftKey:nativeEvent.shiftKey,isComposing:nativeEvent.isComposing,hasContent:Boolean(input.trim()||pendingImage),disabled:actionDisabled};if(!shouldConsumeComposerEnter(intent))return;event.preventDefault();if(shouldSendComposerOnEnter(intent))onSend();}} editable={!autoDialogueBusy&&!dictationBusy} placeholder={dictation.phase==='recording'?'Listening…':dictation.phase==='transcribing'?'Turning voice into text…':autoDialogueBusy?'Thinking of what you might say…':`Message ${character.together_character_templates.name}…`} placeholderTextColor={colors.dimmed} multiline style={[styles.input,styles.inputFitted,styles.embeddedInput,styles.embeddedInputAligned,styles.composerTextInput,desktop&&styles.composerTextInputDesktop]} textAlignVertical="top"/>{autoDialogue&&!autoDialogueEdited?<View style={[styles.autoDialogueInline,styles.autoDialogueInlineAligned]}><Pressable accessibilityRole="button" accessibilityLabel={`Adjust suggested ${autoDialogueIntentLabel(autoDialogue.intent).toLowerCase()} reply`} onPress={onSuggestOptions} style={styles.autoDialogueInlineAction}><Sparkles size={14} color="#D4BEFF"/></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Clear suggested reply" onPress={onClearSuggestion} style={styles.autoDialogueInlineAction}><X size={14} color={colors.muted}/></Pressable></View>:null}<DictationButton phase={dictation.phase} elapsedMs={dictation.elapsedMs} disabled={sending||autoDialogueBusy} onPress={()=>void dictation.toggle()}/></View><Pressable accessibilityRole="button" accessibilityLabel={suggestMode?'Suggest a reply. Hold for reply options.':'Send message'} onPress={suggestMode?onSuggest:onSend} onLongPress={suggestMode&&canSuggest?onSuggestOptions:undefined} delayLongPress={350} disabled={actionDisabled} style={[styles.send,suggestMode&&styles.suggestButton,actionDisabled&&styles.sendDisabled]}>{autoDialogueBusy?<ActivityIndicator color="#fff" size="small"/>:suggestMode?<Sparkles color="#fff" size={19}/>:<Send color="#fff" size={19}/>}</Pressable></View>
    {!compact?counter:null}
  </View>;
}

function PhotoAttachmentPreview({image,phase,sending,onReplace,onRemove}:{image:PendingImage;phase:PhotoUploadPhase;sending:boolean;onReplace:()=>void;onRemove:()=>void}){const state=photoUploadPresentation(phase);return <View accessibilityLiveRegion="polite" accessibilityLabel={`Selected photo. ${state.label}${state.retry?'. Send again to retry.':''}`} style={styles.attachmentPreview}><Image source={{uri:image.uri}} style={styles.attachmentPreviewImage} contentFit="contain"/><View style={{flex:1,minWidth:0}}><Text style={styles.attachmentPreviewTitle}>{state.label}</Text><Text style={styles.attachmentPreviewMeta}>{image.fileName??'Selected image'} · {Math.max(1,Math.round(image.byteSize/1024))} KB</Text>{state.busy?<View accessibilityRole="progressbar" accessibilityValue={{min:0,max:100,now:Math.round(state.progress*100)}} style={styles.attachmentProgressTrack}><View style={[styles.attachmentProgressFill,{width:`${Math.round(state.progress*100)}%`}]}/></View>:null}<View style={styles.attachmentPreviewActions}><Pressable accessibilityRole="button" accessibilityLabel="Replace selected photo" disabled={sending} onPress={onReplace} style={styles.attachmentTextButton}><Text style={styles.attachmentReplace}>Replace</Text></Pressable>{state.retry?<Text style={styles.attachmentRetry}>Tap Send to retry</Text>:null}</View></View>{sending?<ActivityIndicator color={colors.rose}/>:<Pressable accessibilityRole="button" accessibilityLabel="Remove selected photo" onPress={onRemove} style={styles.attachmentRemove}><X size={16} color={colors.text}/></Pressable>}</View>;}

function autoDialogueIntentLabel(intent:AutoDialogueSuggestion['intent']):string{return({answer:'Answer',repair:'Repair',support:'Supportive',celebrate:'Celebrate',flirt:'Romantic',follow_up:'Follow-up',coordinate_plan:'Plans',advance_scene:'Scene',close_scene:'Wrap-up',engage_group:'Group',curious:'Curious'} satisfies Record<AutoDialogueSuggestion['intent'],string>)[intent];}

function AiMediaButton({name,onPress,disabled}:{name:string;onPress:()=>void;disabled:boolean}){
  const glow=useRef(new Animated.Value(0)).current;
  useEffect(()=>{const loop=Animated.loop(Animated.sequence([Animated.timing(glow,{toValue:1,duration:1500,useNativeDriver:true}),Animated.timing(glow,{toValue:0,duration:1500,useNativeDriver:true})]));loop.start();return()=>loop.stop();},[glow]);
  return <Pressable testID="chat-media-menu-button" accessibilityRole="button" accessibilityLabel={`Open photo and video options for ${name}`} onPress={onPress} disabled={disabled} style={({pressed})=>[styles.aiMediaButton,styles.aiMediaButtonAligned,pressed&&styles.aiMediaPressed,disabled&&styles.sendDisabled]}>
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
function mergeChatTimeline(messages:Message[],actions:ConversationAction[],events:ConversationEvent[],lastReadAt?:string|null,openedAt?:string|null,observedMessageIds:ReadonlySet<string>=new Set()){
  events=collapsePlanTimelineEvents(events);
  const resolvedActionIds=new Set(events.filter((event)=>event.event_type==='plan_proposed'&&event.metadata.resolution!=='pending').map((event)=>event.entity_id)),messageTimes=new Map(messages.map((message)=>[message.id,message.created_at]));
  const callGroups=new Map<string,Message[]>();
  for(const message of messages){const callId=typeof message.provider_metadata?.callSessionId==='string'?message.provider_metadata.callSessionId:null;if(callId)callGroups.set(callId,[...(callGroups.get(callId)??[]),message]);}
  const callMessageIds=new Set([...callGroups.values()].flat().map((message)=>message.id));
  const callEvents=new Map(events.filter((event)=>event.event_type==='voice_call').map((event)=>[event.entity_id,event])),callIds=new Set([...callGroups.keys(),...callEvents.keys()]);
  const voiceCalls=[...callIds].map((id)=>{const ordered=[...(callGroups.get(id)??[])].sort((left,right)=>new Date(left.created_at).getTime()-new Date(right.created_at).getTime()),event=callEvents.get(id),at=event?.created_at??ordered[0]?.created_at??new Date().toISOString(),durationMs=Math.max(0,Number(event?.metadata.durationMs??ordered[0]?.provider_metadata?.callDurationMs??0));return{kind:'voice_call' as const,value:{id,messages:ordered,at,durationMs},at,sortOrder:0};});
  const sorted=[...messages.filter((message)=>!callMessageIds.has(message.id)).map((value)=>({kind:'message' as const,value,at:value.created_at,sortOrder:0})),...voiceCalls,...actions.filter((value)=>!resolvedActionIds.has(value.id)).map((value)=>({kind:'action' as const,value,at:value.assistant_message_id?messageTimes.get(value.assistant_message_id)??value.created_at:value.created_at,sortOrder:1})),...events.filter((value)=>value.event_type!=='plan_proposed'&&value.event_type!=='voice_call').map((value)=>({kind:'event' as const,value,at:value.created_at,sortOrder:2}))].sort((left,right)=>new Date(left.at).getTime()-new Date(right.at).getTime()||left.sortOrder-right.sortOrder);
  const result:Array<(typeof sorted)[number]|{kind:'separator';key:string;label:string}>=[];let day='',unreadAdded=false;
  for(const item of sorted){const itemDay=new Date(item.at).toDateString();if(itemDay!==day){day=itemDay;result.push({kind:'separator',key:`day-${item.at}`,label:timelineDayLabel(new Date(item.at))});}const observed=item.kind==='message'&&observedMessageIds.has(item.value.id);if(!unreadAdded&&!observed&&((item.kind==='message'&&item.value.role==='assistant')||item.kind==='voice_call')&&wasUnreadWhenChatOpened(item.at,{lastReadAt,openedAt})){unreadAdded=true;result.push({kind:'separator',key:`new-${item.at}`,label:'NEW'});}result.push(item);}return result;
}

function pendingImageAttachment(image:PendingImage,conversationId:string):ConversationAttachment{return{id:`local-attachment-${Date.now()}`,user_id:'local',continuity_id:'local',conversation_id:conversationId,kind:'image',source:'user',storage_path:'',mime_type:image.mimeType,byte_size:image.byteSize,width:image.width,height:image.height,upload_status:'pending',analysis_status:'pending',analysis_metadata:{},metadata:{requestId:image.requestId},signed_url:image.uri,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};}
async function hydrateAttachmentUrls(messages:Message[]):Promise<Message[]>{const paths=messages.flatMap((message)=>message.together_conversation_attachments??[]).map((attachment)=>attachment.storage_path).filter((path):path is string=>Boolean(path));if(!paths.length)return messages;const{data}=await supabase.storage.from('together-user-media').createSignedUrls(paths,3600);const byPath=new Map((data??[]).map((item)=>([item.path,item.signedUrl] as const)));return messages.map((message)=>({...message,attachments:(message.together_conversation_attachments??[]).map((attachment)=>({...attachment,signed_url:attachment.storage_path?byPath.get(attachment.storage_path)??null:null}))}));}
function timelineDayLabel(date:Date){const today=new Date();const yesterday=new Date(today);yesterday.setDate(today.getDate()-1);if(date.toDateString()===today.toDateString())return'TODAY';if(date.toDateString()===yesterday.toDateString())return'YESTERDAY';return date.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'}).toUpperCase();}
function PlanLifecycleDivider({event,companionName}:{event:ConversationEvent;companionName:string}){const label=planLifecycleDividerLabel(event,companionName);if(!label)return null;return <View accessibilityRole="text" accessibilityLabel={label} style={styles.planLifecycleDivider}><View style={styles.planLifecycleLine}/><Text style={styles.planLifecycleText}>{label}</Text><View style={styles.planLifecycleLine}/></View>;}
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
function ContextSection({title,children}:{title:string;children:React.ReactNode}) { return <View style={{gap:9}}><Text style={[styles.railKicker,styles.desktopRailKicker]}>{title}</Text>{children}</View>; }
function ContextLine({icon,title,body}:{icon:React.ReactNode;title:string;body:string}) { return <View style={styles.contextLine}>{icon}<View style={{flex:1}}><Text style={[styles.contextLineTitle,styles.desktopContextLineTitle]}>{title}</Text><Text style={[styles.contextCopy,styles.desktopContextCopy]}>{body}</Text></View></View>; }

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
  ,planLifecycleDivider:{width:'100%',maxWidth:560,alignSelf:'center',flexDirection:'row',alignItems:'center',gap:10,marginVertical:10,paddingHorizontal:4}
  ,planLifecycleLine:{height:1,flex:1,backgroundColor:'rgba(255,255,255,.16)'}
  ,planLifecycleText:{color:colors.dimmed,fontSize:10,fontWeight:'800',letterSpacing:.55,textAlign:'center'}
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
  ,listenControlSlot:{alignSelf:'stretch',minWidth:128}
  ,listenPlaceholder:{width:128,height:30,marginTop:8,opacity:0}
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
  ,attachmentProgressTrack:{height:3,borderRadius:2,overflow:'hidden',backgroundColor:'rgba(255,255,255,.10)',marginTop:7}
  ,attachmentProgressFill:{height:3,borderRadius:2,backgroundColor:colors.rose}
  ,attachmentPreviewActions:{minHeight:38,flexDirection:'row',alignItems:'center',gap:10}
  ,attachmentRetry:{color:colors.danger,fontSize:10,fontWeight:'800'}
  ,attachmentReplace:{color:colors.rose,fontSize:10,fontWeight:'800',marginTop:5}
  ,attachmentTextButton:{alignSelf:'flex-start',minHeight:44,justifyContent:'center',marginTop:-4}
  ,attachmentRemove:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface}
  ,composerInputShell:{flex:1,minWidth:0,minHeight:54,maxHeight:124,flexDirection:'row',alignItems:'flex-end',gap:4,paddingLeft:5,paddingRight:4,borderRadius:27,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border}
  ,composerInputFocused:{backgroundColor:'rgba(43,27,56,.98)',borderColor:'rgba(188,142,216,.20)',shadowOpacity:0}
  ,composerTextInput:{...(Platform.OS==='web'?({outlineStyle:'none'} as never):{})}
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
  ,composerWrapCompact:{paddingBottom:Platform.OS==='ios'?10:2}
  ,aiNoteCompact:{paddingTop:4,paddingBottom:0}
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
  ,mediaModalPortrait:{width:82,height:82,borderRadius:41,alignItems:'center',justifyContent:'center',overflow:'hidden',marginBottom:18,backgroundColor:colors.elevated,borderWidth:1,borderColor:'rgba(255,255,255,.16)',shadowColor:'#000',shadowOpacity:.32,shadowRadius:14,shadowOffset:{width:0,height:7}}
  ,mediaModalTitle:{fontFamily:'Georgia',fontSize:28,color:colors.text,textAlign:'center'}
  ,mediaModalCopy:{maxWidth:410,color:colors.textSecondary,fontSize:14,lineHeight:21,textAlign:'center',marginTop:11,marginBottom:22}
  ,mediaPrimaryAction:{width:'100%',minHeight:56,borderRadius:radius.md,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,backgroundColor:'#7545F5',borderWidth:1,borderColor:'rgba(255,255,255,.2)',shadowColor:'#7E4CFF',shadowOpacity:.42,shadowRadius:18,shadowOffset:{width:0,height:8}}
  ,mediaPrimaryText:{color:'#fff',fontSize:15,fontWeight:'900'}
  ,mediaOptionLabel:{alignSelf:'flex-start',color:colors.dimmed,fontSize:9,fontWeight:'900',letterSpacing:1.2,marginTop:19,marginBottom:8}
  ,mediaOptions:{width:'100%',flexDirection:'row',flexWrap:'wrap',gap:8}
  ,mediaOption:{flex:1,minWidth:125,minHeight:44,paddingHorizontal:11,borderRadius:radius.md,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,backgroundColor:'rgba(255,255,255,.055)',borderWidth:1,borderColor:'rgba(203,168,255,.16)'}
  ,mediaOptionText:{color:colors.text,fontSize:10,fontWeight:'800',textAlign:'center'}
  ,mediaDescriptionRow:{width:'100%',flexDirection:'row',alignItems:'center',gap:8}
  ,mediaDescriptionInput:{flex:1,minWidth:0,minHeight:46,paddingHorizontal:13,borderRadius:radius.md,color:colors.text,fontSize:13,backgroundColor:'rgba(7,5,12,.52)',borderWidth:1,borderColor:'rgba(203,168,255,.24)'}
  ,mediaDescriptionSubmit:{width:46,height:46,borderRadius:radius.md,alignItems:'center',justifyContent:'center',backgroundColor:'#7545F5',borderWidth:1,borderColor:'rgba(255,255,255,.18)'}
  ,mediaShareAction:{marginTop:17,minHeight:38,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingHorizontal:13,borderRadius:radius.pill,backgroundColor:'rgba(239,82,137,.08)',borderWidth:1,borderColor:'rgba(239,82,137,.18)'}
  ,mediaShareText:{color:'#FFADCA',fontSize:11,fontWeight:'800'}
  ,mediaCancel:{paddingHorizontal:18,paddingTop:17,paddingBottom:2}
  ,mediaCancelText:{color:colors.muted,fontSize:12,fontWeight:'700'}
  ,messageStack:{minWidth:0,maxWidth:'100%',flexShrink:1,gap:6}
  ,messageReactions:{flexDirection:'row',flexWrap:'wrap',gap:5,marginTop:-2}
  ,messageReaction:{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:7,paddingVertical:3,borderRadius:radius.pill,backgroundColor:'rgba(255,255,255,.055)',borderWidth:1,borderColor:colors.border}
  ,messageReactionEmoji:{fontSize:12}
  ,messageReactionName:{color:colors.muted,fontSize:9,fontWeight:'700'}
  ,shellDesktop:{maxWidth:1680}
  ,messagesDesktop:{paddingHorizontal:20}
  ,messageRowDesktop:{width:'88%',maxWidth:820}
  ,bubbleDesktop:{paddingHorizontal:16,paddingVertical:12}
  ,timestampDesktop:{fontSize:10,color:'rgba(255,255,255,.52)'}
  ,composerTextInputDesktop:{fontSize:16,lineHeight:22}
  ,desktopHeaderName:{fontSize:18}
  ,desktopHeaderStatus:{fontSize:12}
  ,desktopRailKicker:{fontSize:11}
  ,desktopPersonName:{fontSize:15}
  ,desktopPersonMeta:{fontSize:11,lineHeight:16}
  ,desktopRailEventTitle:{fontSize:13}
  ,desktopContextName:{fontSize:29}
  ,desktopContextBio:{fontSize:12,lineHeight:17}
  ,desktopContextLineTitle:{fontSize:13}
  ,desktopContextCopy:{fontSize:12,lineHeight:18}
  ,desktopThreadTitle:{fontSize:11}
  ,desktopContextButtonText:{fontSize:14}
});

