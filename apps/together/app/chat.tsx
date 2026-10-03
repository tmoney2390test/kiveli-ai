import { authorizeReply } from '../src/features/chat/authorizeReply';
import { uploadConversationImage } from '../src/features/chat/uploadConversationImage';
import { recoverPersistedReply } from '../src/features/chat/recoverPersistedReply';
import { useChatRequestScope } from '../src/features/chat/useChatRequestScope';
import type { ChatRequestScope } from '../src/features/chat/requestScope';
import { useScopedChatState } from '../src/features/chat/useScopedChatState';
import { CONVERSATION_PAGE_SIZE as PAGE_SIZE, useDirectHistoryState, useDirectConversationHistory } from '../src/features/chat/useDirectConversationHistory';
import { useConversationGallery } from '../src/features/chat/useConversationGallery';
import { ChatRecoveryNotice } from '../src/components/ChatRecoveryNotice';
import { canPreviewCharacterBlueprint } from '@together/domain/src/character-blueprint';
import { createRealtimeChannel } from '../src/lib/realtimeChannel';
import { SchedulePauseControl } from '../src/components/settings/SchedulePauseControl';
import { ScenarioConversationBanner } from '../src/components/ScenarioConversationBanner';
import { WorldPulseConversationBanner } from '../src/components/WorldPulseConversationBanner';
import { photoRequestRestriction, PHOTO_CONTENT_BLOCKED, PHOTO_REQUEST_BLOCKED_MESSAGE } from '@together/domain/src/photo-request-policy';
import { useChatInboxNavigation } from '../src/hooks/useChatInboxNavigation';
import { styles } from '../src/styles/chatStyles';
import { CatalogImage as Image } from '../src/components/CatalogImage';
import { useMessageRewrite } from '../src/hooks/useMessageRewrite';
import { useContextQuote } from '../src/hooks/useContextQuote';
import { ContextCostConfirmation } from '../src/components/settings/ContextCostConfirmation';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, type FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { type ImageSource } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Brain, CalendarDays, ChevronRight, GitBranch, LockKeyhole, MapPin, MessageCircle, Mic, Play, Send, Sparkles, Square, Trash2, Wand2, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MESSAGE_CHARACTER_LIMIT, messageCharacterLimitError } from '@together/domain/src/message-limits';
import { ONE_TAP_SELFIE_MESSAGE_PRESENTATION, type OneTapSelfieMessagePresentation } from '@together/domain/src/media';
import { shouldGroupChatMessages } from '@together/domain/src/group-chat';
import { preservedPrependOffset, shouldKeepChatPinned, shouldLoadOlderChatMessages } from '../src/lib/chatScroll';
import { CharacterAvatar, ErrorState, LoadingSkeleton, resolveCharacterPortraitSource } from '../src/components/ui';
import { CharacterProfilePreviewModal } from '../src/components/CharacterProfilePreviewModal';
import { ChatConversationRail } from '../src/components/ChatConversationRail';
import { ChatPhotoRequestCard } from '../src/components/media/ChatPhotoRequestCard';
import { ChatTypingIndicator } from '../src/components/ChatTypingIndicator';
import { ConnectionBanner } from '../src/components/ConnectionBanner';
import { ConversationOverflowMenu } from '../src/components/ConversationOverflowMenu';
import { DateTimeFields } from '../src/components/DateTimeFields';
import { EndPlanConfirmation, PlanJoinBar } from '../src/components/ActivePlanBar';
import { FrostedBackdrop, FrostedSurface } from '../src/components/FrostedGlass';
import { JumpToLatestButton } from '../src/components/JumpToLatestButton';
import { MediaRequestModal } from '../src/components/MediaRequestModal';
import { MemorySavedToast } from '../src/components/MemorySavedToast';
import { MessageCharacterCounter } from '../src/components/MessageCharacterCounter';
import { MobileChatContextCard } from '../src/components/MobileChatContextCard';
import { MobileChatMediaHeader } from '../src/components/MobileChatMediaHeader';
import { MomentQuickMenuButton } from '../src/components/MomentQuickMenuButton';
import { PhotoSharingPaywallModal } from '../src/components/PhotoSharingPaywallModal';
import { PlanDetailsModal } from '../src/components/PlanDetailsModal';
import { VoiceNotePurchaseModal } from '../src/components/VoiceNotePurchaseModal';
import { characterAssets } from '../src/assets';
import { locationImageSource } from '../src/lib/locationImageSource';
import { colors } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { ApiError } from '../src/lib/api/transport';
import { confirmConversationAction, createSharedPlan, dismissConversationAction, manageInteraction, manageSharedScene } from '../src/lib/api/plans';
import { deleteConversationAttachment, removePendingAttachment } from '../src/lib/api/multimodal';
import { loadPhotoOfferStatus, manageMedia } from '../src/lib/api/media';
import { manageConversation, openConversation, setConversationPinned, setMessageFavorite } from '../src/lib/api/conversations';
import { managePersona } from '../src/lib/api/account';
import { meetCompanion, resolveRelationshipMilestone, setCharacterFavorite, simulate } from '../src/lib/api/companions';
import { mutateMemory, rememberMessage } from '../src/lib/api/memory';
import { quoteVoiceNote, requestVoiceNote } from '../src/lib/api/voice';
import { sendDialogue, sendSceneReaction, suggestDialogue } from '../src/lib/api/dialogue';
import { supabase } from '../src/lib/supabase';
import type { AutoDialoguePreference, AutoDialogueSuggestion, CharacterInstance, CharacterInteractionProposal, ConversationAction, ConversationAttachment, ConversationEvent, GeneratedMedia, InteractionCandidate, MediaOffer, Message, PlanExperience, RelationshipMilestone, SceneAction, SceneParticipant, SceneSession, SharedPlan, Snapshot } from '../src/types';
import { scopedConversationMessages } from '../src/lib/conversation';
import { resolveChatRoute, type ChatRouteParams } from '../src/lib/chatRoute';
import { confirmAction } from '../src/lib/dialogs';
import { FreshChatConfirmation } from '../src/components/FreshChatConfirmation';
import { defaultPlanTimeFields, parseCustomPlanTime, type PlanOption, type PlanTimingSelection } from '../src/lib/plans';
import { PlanSelection } from '../src/components/PlanSelection';
import { ChatSettingsModal } from '../src/components/ChatSettingsModal';
import { ConversationTimelineSkeleton } from '../src/components/ConversationTimelineSkeleton';
import { buildClientConversationContext, type ClientConversationContext } from '../src/lib/conversationContext';
import { chatMessageTypography, resolveChatBubbleColors } from '../src/lib/chatSettings';
import { createClientRequestId } from '../src/lib/requestId';
import { characterCatalogForWorld, characterResidentWorld, worldForLocation } from '../src/lib/place';
import type { FeaturedCompanion } from '../src/lib/featuredCompanions';
import { presentMemoryText } from '../src/lib/memoryPresentation';
import { photoOfferForMessage, photoOffersAtTimelineTail, shouldShowPhotoGenerationPending } from '../src/lib/photoRequestPresentation';
import { latestMediaOfferPreviewUri } from '../src/lib/mediaOfferPresentation';
import { proposalHeading, sceneActionDividerLabel, sceneActionTimelineEntryFromAction, type SceneActionTimelineEntry } from '../src/lib/interactionPresentation';
import { createProposalDecisionGuard, reactToSavedProposal } from '../src/lib/proposalDecision';
import { dialogueFailureMayHavePersisted, dialogueRecoveryShouldContinue, latestUnansweredDialogueRequest, staleDialogueReplayDelay } from '../src/lib/dialogueRecovery';
import { reconcileMessages } from '../src/lib/messageReconciliation';
import { endPlanExperience, getPlanExperience, joinCommitment, switchPlanExperience } from '../src/lib/commitments';
import { activePlanForChat, attendedPlansForLifecycleReconciliation, isPlanLifecycleDividerEvent, joinablePlanForChat, planActionAvailability, planLifecycleDividerLabel, shouldShowPlanConversationAction, shouldShowPlanTimelineEvent } from '../src/lib/planActions';
import { hideVoiceNoteConfirmation, isVoiceNoteConfirmationHidden } from '../src/lib/voiceNoteConfirmation';
import { chatSessionRouteKey, conversationWithLastMessage, isConversationPinned } from '../src/lib/messageInbox';
import { clearChatScrollPosition, readChatScrollPosition, restoredChatOffset, saveChatScrollPosition, shouldRestoreChatScrollPosition, type ChatScrollPosition } from '../src/lib/chatNavigationState';
import { declinedPhotoReplyAnchor, declinedPhotoReplayText, withPhotoRequestTimeout, createOptimisticPhotoRequest, matchingServerPhotoOffer, queueOptimisticPhotoOfferAcceptance, queueServerPhotoOfferAcceptance, waitForMatchingServerPhotoOffer, waitForPhotoOfferStatus, type OptimisticPhotoRequest } from '../src/lib/photoOfferOptimism';
import { mergeDictationTranscript } from '../src/lib/dictation';
import { useChatDictation, type ChatDictationPhase } from '../src/hooks/useChatDictation';
import { cleanupNormalizedImage, normalizeUserImage, userImagePickerOptions } from '../src/lib/imageUploads';
import { photoUploadPresentation, type PhotoUploadPhase } from '../src/lib/photoUploadPresentation';
import { mediaOfferActionBusy } from '../src/lib/mediaOfferBusy';
import { chatMediaGalleryItems } from '../src/lib/chatMediaGallery';
import { isTransientMediaFetchFailure, mediaReconciliationComplete, mergeGeneratedMediaCollections, missingMediaIds } from '../src/lib/mediaReconciliation';
import { shouldConsumeComposerEnter, shouldSendComposerOnEnter } from '../src/lib/composerKeyboard';
import { useAuth } from '../src/hooks/useAuth';
import { useNetworkStatus } from '../src/providers/NetworkStatusProvider';
import { usePersistentMessageDraft } from '../src/hooks/usePersistentMessageDraft';
import { useMobileChatKeyboardPin } from '../src/hooks/useMobileChatKeyboardPin';
import { ChatKeyboardFrame } from '../src/components/ChatKeyboardFrame';
import { ChatComposerFrame } from '../src/components/ChatComposerFrame';
import { latestConversationHeaderImage } from '../src/lib/chatHeaderMedia';
import { newGroupPrefillHref } from '../src/lib/groupInvite';
import { canContinueMessage, isMessageFavorite } from '../src/lib/messageActions';
import { canOfferChatBranch } from '../src/lib/chatBranch';
import { handlePhotoSharingTap } from '../src/lib/photoSharing';
import { subscriptionHref } from '../src/lib/subscriptionPresentation';
import { conversationLocationHref, mediaViewerHref } from '../src/lib/conversationNavigation';
import { writeConversationMessagePage } from '../src/lib/conversationMessageWarmup';
import { hasCoherentConversationTimeline } from '../src/lib/conversationTimelineVisibility';
import { hidePlanInteractionTray, isPlanInteractionTrayHidden, shouldShowPlanInteractionTray } from '../src/lib/planInteractionTrayPreference';
import { CHAT_PRESENCE_FALLBACK_REFRESH_MS, nextChatPresenceTickDelay } from '../src/lib/chatPresence';
import { DailyMessageAllowanceNotice } from '../src/components/DailyMessageAllowanceNotice';
import { isDailyMessageAllowanceExhausted } from '../src/lib/dailyMessageAllowance';
import type { MediaMomentMode } from '../src/lib/mediaMomentPicker';
import { type Feedback, type VoiceNoteRequestResult } from '../src/features/chat/types';
import { navigateChatSurface } from '../src/features/chat/navigation';
import { mergeChatTimeline } from '../src/features/chat/timeline';
import { VirtualizedConversationList } from '../src/features/chat/components/VirtualizedConversationList';
import { ChatAmbientGlow, ChatHeader } from '../src/features/chat/components/ChatHeader';
import { ConversationHistoryFailure, EmptyConversation, RelationshipMomentCard, StoryFeedback } from '../src/features/chat/components/ConversationNotices';
import { ChatPlaceInfoModal } from '../src/features/chat/components/ChatPlaceInfoModal';
import { ChatMediaGalleryModal } from '../src/features/chat/components/ChatMediaGalleryModal';
import { MessageBubble, StreamingBubble } from '../src/features/chat/components/MessageBubble';
import { VoiceCallEventRow } from '../src/features/chat/components/VoiceMessage';

type PendingImage={uri:string;mimeType:'image/jpeg';byteSize:number;width:number;height:number;fileName:string;temporary:true;requestId:string};
type PlanMutationResult={kind:'shared_plan'|'date';commitment:{id:string};experience?:PlanExperience};
type ConversationActionMutation={applied:boolean;candidateId:string;result?:PlanMutationResult};
type SharedSceneCharacter={id:string;current_location_id?:string|null;together_character_templates:{name:string;slug:string;public_handle?:string|null};together_character_versions?:{portrait_asset_url?:string|null;visual_identity?:Record<string,unknown>}|null};
type SharedSceneRoster={scene:SceneSession|null;participants:Array<SceneParticipant&{together_character_instances?:SharedSceneCharacter|null}>;availableCharacters:Array<SharedSceneCharacter&{presence?:Record<string,unknown>}>};
type ChatParams=ChatRouteParams&{group?:string;id?:string};
type VoiceNotePrompt={messageId:string;name:string;creditCost:number;creditBalance:number;shortened:boolean};
type MemorySavedNotice={id:number;name:string};
type DirectMessageAction={messageAction:'continue'|'respond_to_declined_photo';anchorMessageId:string};
type QueuedPhotoOfferDecision={requestId:string;action:'accept'|'decline';paymentMethod?:'credits'|'daily_included'};
type ConversationMessagePage={messages:Message[];hasMore:boolean;replyStatus?:{pending:boolean;requestId:string|null}};
const GroupChatScreen=lazy(()=>import('./group-chat'));

export default function Chat() {
  const params=useLocalSearchParams<ChatParams>();
  const snapshot=useTogether((state)=>state.snapshot);
  if(params.group==='1'&&params.id)return <Suspense fallback={<View style={{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:colors.background}}><ActivityIndicator color={colors.violet}/></View>}><GroupChatScreen/></Suspense>;
  const route=resolveChatRoute(snapshot,params);
  const pendingKey=[params.conversationId,params.character,params.planId,params.world,params.location].filter(Boolean).join(':')||'recent';
  return <ChatSession key={`${snapshot?.activeContinuity?.id??'loading'}:${chatSessionRouteKey(route.conversation?.id,params,pendingKey)}`}/>;
}

function ChatSession() {
  const openMessagesInbox = useChatInboxNavigation();
  const params = useLocalSearchParams<ChatParams>();
  const { width } = useWindowDimensions();
  const [floatingComposerHeight,setFloatingComposerHeight]=useState(110);
  const showLeft = width >= 1080;
  const showRight = width >= 920;
  const { snapshot, refresh, setSnapshot, setCoreState, updateCompanion, upsertConversation, upsertPlan, upsertMedia, removeMedia, upsertSceneSession, upsertConversationAction, removeConversationAction, applyServerDelta, pendingDialogues, beginPendingDialogue, finishPendingDialogue, consumeDailyMessageAllowance, exhaustDailyMessageAllowance } = useTogether();
  const [branching,setBranching]=useState(false);
  const branchInFlight=useRef(false);
  const branchRequest=useRef<{anchorId:string;requestId:string}|null>(null);
  const{session}=useAuth(),{online,phase:connectionPhase}=useNetworkStatus();
  const {character,conversation}=resolveChatRoute(snapshot,params);
  const activeSharedPlan=snapshot&&character?activePlanForChat(snapshot.sharedPlans??[],character.id):null;
  const slug = character?.together_character_templates.slug ?? '';
  const characterHandle=character?.together_character_templates.public_handle??slug;
  const subscriptionReturnTo=characterHandle?`/chat?character=${encodeURIComponent(characterHandle)}`:'/chat';
  const creditsSubscriptionHref=subscriptionHref({intent:'credits',returnTo:subscriptionReturnTo});
  const photoSharingSubscriptionHref=subscriptionHref({intent:'photo_sharing',returnTo:`${subscriptionReturnTo}${subscriptionReturnTo.includes('?')?'&':'?'}sharePhoto=1`});
  const dailyMessageExhausted=isDailyMessageAllowanceExhausted(snapshot?.dailyMessageAllowance);
  const chatScope=useChatRequestScope(session?.user.id,snapshot?.activeContinuity?.id,conversation?.id);
  const history=useDirectHistoryState(chatScope);
  const {messages,setMessages,verifiedHistoryId,loadedConversationId,loading,loadingOlder,hasMore,historyLoadFailed}=history;
  const [activeVoiceNoteId,setActiveVoiceNoteId]=useState<string|null>(null);
  const [voiceNotePrompt,setVoiceNotePrompt]=useState<VoiceNotePrompt|null>(null);
  const [voiceNotePromptBusy,setVoiceNotePromptBusy]=useState(false);
  const voiceNotePromptResolver=useRef<((decision:{hideFuture:boolean}|null)=>void)|null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [stream, setStream] = useState('');
  const [error, setError] = useState('');
  const [blockedPhoto, setBlockedPhoto] = useState<{text:string;message:string}|null>(null);
  const [feedback, setFeedback] = useState<Feedback|null>(null);
  const [memorySavedNotice,setMemorySavedNotice]=useState<MemorySavedNotice|null>(null);
  const [showPlans, setShowPlans] = useState(params.plan === '1');
  const [planning, setPlanning] = useScopedChatState(chatScope,false);
  const planRequestIdRef=useMemo(()=>({current:createClientRequestId()}),[chatScope]);
  const realtimeScopeRef=useRef(createClientRequestId());
  const [pendingActionId,setPendingActionId]=useScopedChatState<string|null>(chatScope,null);
  const [initialPlanTimingChoice,setInitialPlanTimingChoice]=useState<'custom'|null>(null);
  const [focusPlanId,setFocusPlanId]=useState<string|null>(params.planId??null);
  const [focusDismissed,setFocusDismissed]=useState(false);
  const [showPhotoRequests, setShowPhotoRequests] = useState(false);
  const [mediaRequestMode,setMediaRequestMode]=useState<MediaMomentMode>('photo');
  useEffect(()=>{if(!showPhotoRequests)setMediaRequestMode('photo');},[showPhotoRequests]);
  const [showPhotoPaywall,setShowPhotoPaywall]=useState(false);
  const [showInteractions, setShowInteractions] = useState(false);
  const [dismissedInteractionPlanId,setDismissedInteractionPlanId]=useState<string|null>(null);
  const [interactionTrayPreferenceReady,setInteractionTrayPreferenceReady]=useState(false);
  const [interactionCandidates, setInteractionCandidates] = useState<InteractionCandidate[]>([]);
  const [movementCandidates, setMovementCandidates] = useState<InteractionCandidate[]>([]);
  const [interactionScene, setInteractionScene] = useState<SceneSession|null>(null);
  const hydratedInteractionSceneKey=useRef<string|null>(null);
  const markInteractionSceneHydrated=(scene?:SceneSession|null)=>{if(scene?.id)hydratedInteractionSceneKey.current=`${scene.id}:${scene.location_id}`;};
  const [sharedSceneRoster,setSharedSceneRoster]=useState<SharedSceneRoster|null>(null);
  const [interactionLoading, setInteractionLoading] = useState(false);
  const [pendingSceneAction,setPendingSceneAction]=useState<(SceneActionTimelineEntry&{createdAt:string})|null>(null);
  const [characterProposal,setCharacterProposal]=useState<CharacterInteractionProposal|null>(null);
  const proposalDecisions=useRef(createProposalDecisionGuard()).current;
  const proposalScopeActive=useRef(true);
  useEffect(()=>{proposalScopeActive.current=true;return()=>{proposalScopeActive.current=false;};},[]);
  const [showConversationMenu, setShowConversationMenu] = useState(false);
  const [showFreshChat, setShowFreshChat] = useState(false);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [showPlaceInfo,setShowPlaceInfo]=useState(false);
  const [showChatMedia,setShowChatMedia]=useState(false);
  const {media:loadedGalleryMedia,attachments:loadedGalleryAttachments,loading:galleryLoading,error:galleryError,load:loadChatGallery}=useConversationGallery({scope:chatScope,conversationId:conversation?.id,visible:showChatMedia,onMedia:upsertMedia});
  const [characterPreview,setCharacterPreview]=useState<FeaturedCompanion|null>(null);
  const [pendingImage,setPendingImage]=useState<PendingImage|null>(null);
  const [photoUploadPhase,setPhotoUploadPhase]=useState<PhotoUploadPhase>('idle');
  const pendingImageRef=useRef<PendingImage|null>(null);
  const [awaitingPhotoOffer,setAwaitingPhotoOffer]=useState(false);
  const [optimisticPhotoRequest,setOptimisticPhotoRequest]=useState<OptimisticPhotoRequest|null>(null);
  const optimisticPhotoRequestRef=useRef<OptimisticPhotoRequest|null>(null);
  const queuedPhotoOfferDecisionRef=useRef<QueuedPhotoOfferDecision|null>(null);
  const optimisticPhotoDecisionInFlight=useRef(new Set<string>());
  const optimisticPhotoDecisionDispatched=useRef(new Set<string>());
  const resolveOptimisticPhotoOfferRef=useRef<(offers:MediaOffer[])=>void>(()=>undefined);
  const [reconcilingMediaId,setReconcilingMediaId]=useState<string|null>(null);
  const [mediaOffers,setMediaOffers]=useState<MediaOffer[]>([]);
  const [mediaOfferBusy,setMediaOfferBusy]=useScopedChatState<string|null>(chatScope,null);
  const [declinedPhotoReply,setDeclinedPhotoReply]=useScopedChatState<{offer:MediaOffer;dismissed:MediaOffer;queuedAt:number}|null>(chatScope,null);
  const [mediaRetryBusyId,setMediaRetryBusyId]=useState<string|null>(null);
  const [autoDialogue,setAutoDialogue]=useState<AutoDialogueSuggestion|null>(null);
  const [autoDialogueBusy,setAutoDialogueBusy]=useState(false);
  const [showAutoDialogueOptions,setShowAutoDialogueOptions]=useState(false);
  const [resolvingMilestone, setResolvingMilestone] = useState(false);
  const [favoriteBusy,setFavoriteBusy]=useState(false);
  const [pinBusy,setPinBusy]=useState(false);
  const [showJumpToLatest,setShowJumpToLatest]=useState(false);
  const [planModal,setPlanModal]=useState<{planId:string;confirmCancel?:boolean}|null>(null);
  const [planActionBusyId,setPlanActionBusyId]=useScopedChatState<string|null>(chatScope,null);
  const [planEndTarget,setPlanEndTarget]=useState<SharedPlan|null>(null);
  const [switchPlanId,setSwitchPlanId]=useState<string|null>(null);
  const [conversationBootstrapError,setConversationBootstrapError]=useState('');
  const [conversationBootstrapAttempt,setConversationBootstrapAttempt]=useState(0);
  const [showSendConnectionNotice,setShowSendConnectionNotice]=useState(false);
  const [presenceNow,setPresenceNow]=useState(()=>Date.now());
  const clearStoredDraft=usePersistentMessageDraft({userId:session?.user.id,conversationId:conversation?.id,kind:'direct',value:input,setValue:setInput,routeDraft:params.draft});
  const pendingDialogue=conversation?pendingDialogues[conversation.id]:undefined;
  const messageRewrite=useMessageRewrite({profile:snapshot?.profile,userId:session?.user.id,conversation,messages,pending:sending||Boolean(pendingDialogue),characterInstanceId:character?.id,onMessage:(message)=>setMessages(current=>reconcileMessages(current,[message])),onError:setError,onFinished:()=>{void refresh();}});
  const replyPending=sending||Boolean(pendingDialogue)||messageRewrite.busy;
  const replyPendingRef=useRef(replyPending);
  replyPendingRef.current=replyPending;
  const contextPricing=useContextQuote({userId:session?.user.id,activationId:(conversation?.metadata?.chatPreferences as {contextCostActivationId?:string}|undefined)?.contextCostActivationId,preference:(conversation?.metadata?.chatPreferences as {contextPreference?:string}|undefined)?.contextPreference,draft:{conversationId:conversation?.id,characterInstanceId:character?.id,message:input,focusPlanId:focusPlanId??undefined},revision:JSON.stringify([conversation?.metadata?.chatPreferences,messages.at(-1)?.id]),paused:replyPending,hasPendingPhoto:Boolean(pendingImage)});
  const conversationReady=!loading&&hasCoherentConversationTimeline({activeConversationId:conversation?.id,loadedConversationId});
  useEffect(()=>{if(connectionPhase==='online')setShowSendConnectionNotice(false);},[connectionPhase]);
  useEffect(()=>{setShowSendConnectionNotice(false);setShowPlaceInfo(false);setShowChatMedia(false);},[conversation?.id]);
  useEffect(()=>{
    const userId=session?.user.id,planId=activeSharedPlan?.id;
    let cancelled=false;
    setShowInteractions(false);
    setDismissedInteractionPlanId(null);
    if(!userId||!planId){setInteractionTrayPreferenceReady(true);return()=>{cancelled=true;};}
    setInteractionTrayPreferenceReady(false);
    void isPlanInteractionTrayHidden(userId,planId).then((hidden)=>{if(cancelled)return;setDismissedInteractionPlanId(hidden?planId:null);setInteractionTrayPreferenceReady(true);});
    return()=>{cancelled=true;};
  },[session?.user.id,activeSharedPlan?.id]);
  const scroll = useRef<FlatList<ReactElement>>(null);
  const latestConversationScroller=useRef<((animated:boolean)=>void)|null>(null);
  const sendInFlightRef = useRef(false);
  const activeSendRequest = useRef<string|null>(null);
  useEffect(()=>()=>{activeSendRequest.current=null;sendInFlightRef.current=false;},[conversation?.id]);
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
  const autoDialogueRequest=useRef<AbortController|null>(null);
  const mediaRetryInFlight=useRef(new Set<string>());
  const currentInput=useRef('');
  const latestTimelineMessageId=useRef<string|null>(null);
  const resumedSharePhoto=useRef<string|null>(null);
  const seamlessCompletionIds=useRef(new Set<string>());
  const staleDialogueReplayAttempts=useRef(new Set<string>());
  const replayPersistedDialogueRef=useRef<(message:Message)=>void>(()=>undefined);
  const unreadWindow=useRef<{conversationId:string|null;lastReadAt:string|null;openedAt:string}>({conversationId:null,lastReadAt:null,openedAt:new Date().toISOString()});
  const openChatGallery=useCallback(()=>setShowChatMedia(true),[]);
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
      if(entitled){setMediaRequestMode('share');setShowPhotoRequests(true);}else setShowPhotoPaywall(true);
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
  useEffect(()=>{
    if(!awaitingPhotoOffer||!character?.id||!conversation?.id)return;
    let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
    const startedAt=Date.now();
    const deadline=setTimeout(()=>{cancelled=true;if(timer)clearTimeout(timer);optimisticPhotoRequestRef.current=null;queuedPhotoOfferDecisionRef.current=null;setAwaitingPhotoOffer(false);setOptimisticPhotoRequest(null);setError('The photo confirmation could not be confirmed. Check your conversation before requesting another photo.');},24_000);
    const recover=async()=>{
      try{
        const offers=await fetchPendingMediaOffers(character.id,conversation.id);
        if(cancelled)return;
        const request=optimisticPhotoRequestRef.current;
        const matchingOffer=request?matchingServerPhotoOffer(offers,request):undefined;
        if(matchingOffer){
          setMediaOffers(offers);
          // Resolve against the authoritative rows immediately. Waiting for a
          // later mediaOffers render can strand a decision when the server
          // offer and the user's tap land in the same React update batch.
          resolveOptimisticPhotoOfferRef.current(offers);
          return;
        }
      }catch{/* Keep the short recovery window independent from the send request. */}
      if(cancelled)return;
      if(Date.now()-startedAt>=24_000){optimisticPhotoRequestRef.current=null;queuedPhotoOfferDecisionRef.current=null;setAwaitingPhotoOffer(false);setOptimisticPhotoRequest(null);setError('The photo confirmation did not appear. Please try the request again.');return;}
      timer=setTimeout(()=>void recover(),2_500);
    };
    timer=setTimeout(()=>void recover(),1_500);
    return()=>{cancelled=true;if(timer)clearTimeout(timer);clearTimeout(deadline);};
  },[awaitingPhotoOffer,character?.id,conversation?.id,fetchPendingMediaOffers]);
  useEffect(()=>resolveOptimisticPhotoOfferRef.current(mediaOffers),[mediaOffers]);
  const markConversationRead=useCallback(async(conversationId:string)=>{
    const isCurrent=chatScope.capture();
    const result=await manageConversation<{last_read_at:string}>({action:'read',conversationId});
    const current=useTogether.getState().snapshot?.conversations.find((item)=>item.id===conversationId);
    if(isCurrent()&&current)upsertConversation({...current,last_read_at:result.last_read_at,unread:false});
  },[chatScope,upsertConversation]);
  useEffect(()=>{
    if(!snapshot||!character||conversation)return;
    let cancelled=false;
    setConversationBootstrapError('');
    void openConversation(character.id).then((opened)=>{if(cancelled)return;const userId=session?.user.id;if(userId)writeConversationMessagePage(userId,opened.conversation.id,{messages:[...opened.messages].reverse(),hasMore:opened.hasMore});upsertConversation(opened.conversation);}).catch((caught)=>{if(!cancelled)setConversationBootstrapError(caught instanceof Error?caught.message:'The conversation could not be opened.');});
    return()=>{cancelled=true;};
  },[character?.id,conversation?.id,conversationBootstrapAttempt,session?.user.id,upsertConversation]);
  useEffect(()=>{if(params.plan==='1')setShowPlans(true);if(params.planId)setFocusPlanId(params.planId);},[params.plan,params.planId]);
  useEffect(()=>{const focus=conversation?.metadata?.focus as Record<string,unknown>|undefined;if(!focusDismissed&&!focusPlanId&&focus?.type==='plan'&&typeof focus.planId==='string')setFocusPlanId(focus.planId);},[conversation?.id,conversation?.metadata,focusPlanId,focusDismissed]);
  const activeSceneMetadata=(conversation?.metadata?.activeScene??conversation?.metadata?.scene??null) as Record<string,unknown>|null;
  const hasActiveCommitment=Boolean(snapshot&&character&&((snapshot.sharedPlans??[]).some((plan)=>plan.character_instance_id===character.id&&isLivePlan(plan)&&Boolean(plan.attendance?.user&&!plan.attendance.user.left_at))||(snapshot.dates??[]).some((date)=>date.character_instance_id===character.id&&date.status==='active')));
  const metadataCoPresent=activeSceneMetadata?.interactionMode==='co_present'&&activeSceneMetadata?.entryReason!=='shared_plan';
  const isCoPresent=Boolean(metadataCoPresent||hasActiveCommitment);
  useEffect(()=>{
    if(!character?.id||!conversation?.id||!isCoPresent){hydratedInteractionSceneKey.current=null;setInteractionCandidates([]);setMovementCandidates([]);setInteractionScene(null);setCharacterProposal(null);return;}
    const currentSceneId=interactionScene?.id??(typeof activeSceneMetadata?.sceneSessionId==='string'?activeSceneMetadata.sceneSessionId:null);
    const currentLocationId=interactionScene?.location_id??(typeof activeSceneMetadata?.locationId==='string'?activeSceneMetadata.locationId:'');
    if(currentSceneId&&hydratedInteractionSceneKey.current===`${currentSceneId}:${currentLocationId}`){setInteractionLoading(false);return;}
    let cancelled=false;setInteractionLoading(true);
    void manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[];characterProposal?:CharacterInteractionProposal}>({action:'resolve',characterInstanceId:character.id,conversationId:conversation.id}).then((result)=>{if(cancelled)return;markInteractionSceneHydrated(result.scene);setInteractionScene(result.scene?.id?result.scene:null);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);setCharacterProposal(result.characterProposal??null);}).catch((caught)=>{if(!cancelled&&caught instanceof ApiError&&caught.code!=='SCENE_REQUIRED')setError(caught.message);}).finally(()=>{if(!cancelled)setInteractionLoading(false);});
    return()=>{cancelled=true;};
  },[character?.id,conversation?.id,isCoPresent,interactionScene?.id,interactionScene?.location_id,activeSceneMetadata?.sceneSessionId,activeSceneMetadata?.locationId]);
  useFocusEffect(useCallback(()=>{
    if(!conversation?.id||!isCoPresent){setSharedSceneRoster(null);return;}
    let cancelled=false;
    const loadRoster=()=>manageSharedScene<SharedSceneRoster>({action:'available',conversationId:conversation.id}).then((result)=>{if(!cancelled)setSharedSceneRoster(result);}).catch(()=>{if(!cancelled)setSharedSceneRoster(null);});
    void loadRoster();
    const channel=createRealtimeChannel(supabase, `kivelle-shared-scene-${conversation.id}-${realtimeScopeRef.current}`).on('postgres_changes',{event:'*',schema:'public',table:'together_scene_participants'},()=>void loadRoster()).on('postgres_changes',{event:'UPDATE',schema:'public',table:'together_scene_sessions'},()=>void loadRoster()).subscribe();
    return()=>{cancelled=true;void supabase.removeChannel(channel);};
  },[conversation?.id,isCoPresent,activeSceneMetadata?.sceneSessionId]));

  const scrollToLatest=useCallback((animated:boolean)=>{
    programmaticScrollUntil.current=Date.now()+350;
    if(latestConversationScroller.current){latestConversationScroller.current(animated);return;}
    scroll.current?.scrollToEnd({animated});
  },[]);
  const pinLatestForMobileKeyboard=useCallback(()=>{
    if(width>=720||!conversation?.id||!keepPinnedToBottom.current)return;
    keepPinnedToBottom.current=true;
    forcePinnedUntil.current=Date.now()+1_400;
    setShowJumpToLatest(false);
    scrollToLatest(false);
  },[conversation?.id,scrollToLatest,width]);
  const onMobileComposerFocus=useMobileChatKeyboardPin(width<720,pinLatestForMobileKeyboard);
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
  const jumpToLatest=useCallback(()=>{
    if(!conversation?.id)return;
    const requestId=`jump-${Date.now()}`;
    activeBottomPinRequest.current=requestId;
    keepPinnedToBottom.current=true;
    forcePinnedUntil.current=Date.now()+1_400;
    setShowJumpToLatest(false);
    clearChatScrollPosition(conversation.id);
    scrollToLatest(true);
    settleSentMessageAtBottom(requestId);
    if(bottomPinReleaseTimer.current)clearTimeout(bottomPinReleaseTimer.current);
    bottomPinReleaseTimer.current=setTimeout(()=>{
      if(activeBottomPinRequest.current!==requestId)return;
      scrollToLatest(false);
      activeBottomPinRequest.current=null;
      forcePinnedUntil.current=Date.now()+500;
    },1_200);
  },[conversation?.id,scrollToLatest,settleSentMessageAtBottom]);
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
  const recoverInterruptedDialogue=async(conversationId:string,characterInstanceId:string,optimistic:Message,clientRequestId:string,expectsPhotoOffer=false):Promise<boolean>=>{
    const isCurrent=chatScope.capture();
    const recovered=await recoverPersistedReply({
      requestId:clientRequestId,isCurrent,
      load:async()=>{const page=await manageConversation<ConversationMessagePage>({action:'messages',conversationId,limit:PAGE_SIZE,includeReplyStatus:true});return {...page,messages:[...page.messages].reverse()};},
      messages:(page)=>page.messages,
      shouldContinue:(page)=>dialogueRecoveryShouldContinue(page.replyStatus,clientRequestId),
      acceptResponse:async(_page,response)=>{
        if(!expectsPhotoOffer)return true;
        const offers=await fetchPendingMediaOffers(characterInstanceId,conversationId);
        if(!isCurrent()||!offers.some((offer)=>offer.message_id===response.id))return false;
        setMediaOffers(offers);setAwaitingPhotoOffer(false);return true;
      },
    });
    if(!isCurrent()||recovered.status==='cancelled')return false;
    if(recovered.latest)setMessages((current)=>reconcileMessages(current,recovered.latest!.messages,[optimistic.id]));
    if(recovered.status==='recovered')void refresh().catch(()=>undefined);
    return recovered.status==='recovered';
  };
  const {loadOlder}=useDirectConversationHistory({
    scope:chatScope,history,userId:session?.user.id,conversationId:conversation?.id,
    connectionPhase,pendingRequestId:pendingDialogue?.clientRequestId,
    demo:__DEV__&&process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE==='true',
    onReset:(id)=>{prepareConversationScroll(id);setBlockedPhoto(null);setError('');setStream('');setSending(false);setFeedback(null);setMemorySavedNotice(null);setAwaitingPhotoOffer(false);setOptimisticPhotoRequest(null);optimisticPhotoRequestRef.current=null;queuedPhotoOfferDecisionRef.current=null;optimisticPhotoDecisionInFlight.current.clear();optimisticPhotoDecisionDispatched.current.clear();setPendingImage(null);setMediaOffers([]);setPendingSceneAction(null);setCharacterProposal(null);setPendingActionId(null);setFocusDismissed(false);setFocusPlanId(params.planId??null);setShowPlans(params.plan==='1');setShowPhotoRequests(false);setShowInteractions(false);setShowConversationMenu(false);setShowChatSettings(false);setPlanModal(null);setPlanActionBusyId(null);setPlanEndTarget(null);setSwitchPlanId(params.switchPlanId??null);setInput('');},
    onRead:markConversationRead,onError:setError,
    onRecovered:()=>setError((current)=>current&&dialogueFailureMayHavePersisted(new Error(current))?'':current),
    onBeforePrepend:()=>{previousHeight.current=contentHeight.current;previousOffsetY.current=scrollOffsetY.current;prepending.current=true;},
  });
  useEffect(()=>{
    if(!conversation||loadedConversationId!==conversation.id)return;
    const latest=[...messages].reverse().find((message)=>message.delivery_status!=='failed'&&Boolean(message.content.trim()));
    if(!latest)return;
    const current=useTogether.getState().snapshot?.conversations.find((item)=>item.id===conversation.id)??conversation;
    const preview=latest.content.replace(/\s+/g,' ').trim();
    if(current.last_message_at===latest.created_at&&current.last_message_preview===preview&&current.last_message_role===latest.role)return;
    upsertConversation(conversationWithLastMessage(current,latest));
  },[conversation?.id,loadedConversationId,messages,upsertConversation]);
  useEffect(()=>{autoDialogueRequest.current?.abort();autoDialogueRequest.current=null;setAutoDialogue(null);setAutoDialogueBusy(false);setShowAutoDialogueOptions(false);},[conversation?.id]);
  useEffect(()=>()=>autoDialogueRequest.current?.abort(),[]);
  useEffect(()=>{
    if(!conversation?.id||loadedConversationId!==conversation.id||verifiedHistoryId!==conversation.id||replyPending||!online||connectionPhase!=='online')return;
    const unanswered=latestUnansweredDialogueRequest(messages),requestId=unanswered?.client_request_id;
    if(!unanswered||!requestId||staleDialogueReplayAttempts.current.has(requestId))return;
    const delay=staleDialogueReplayDelay(unanswered);
    if(delay===null)return;
    const timer=setTimeout(()=>{
      if(staleDialogueReplayAttempts.current.has(requestId))return;
      staleDialogueReplayAttempts.current.add(requestId);
      replayPersistedDialogueRef.current(unanswered);
    },delay+100);
    return()=>clearTimeout(timer);
  },[connectionPhase,conversation?.id,loadedConversationId,verifiedHistoryId,messages,online,replyPending]);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    const scheduleTick=()=>{timer=setTimeout(()=>{setPresenceNow(Date.now());scheduleTick();},nextChatPresenceTickDelay(Date.now()));};
    scheduleTick();
    const appState=AppState.addEventListener('change',(state)=>{if(state==='active')setPresenceNow(Date.now());});
    return()=>{if(timer)clearTimeout(timer);appState.remove();};
  },[conversation?.id]);
  const simulationStale=Boolean(character&&(presenceNow-new Date(character.last_simulated_at).getTime()>2*60000||!(snapshot?.scheduleEvents??[]).some((item)=>item.character_instance_id===character.id&&new Date(item.ends_at).getTime()>presenceNow)));
  useEffect(()=>{if(!character?.id||!simulationStale)return;let cancelled=false;void simulate(character.id).then(()=>cancelled?undefined:refresh({scope:'presence',characterInstanceId:character.id})).catch(()=>undefined);return()=>{cancelled=true;};},[character?.id,refresh,simulationStale]);
  useFocusEffect(useCallback(()=>{if(!character)return;const channel=createRealtimeChannel(supabase, `kivelle-media-${character.id}-${realtimeScopeRef.current}`).on('postgres_changes',{event:'*',schema:'public',table:'together_generated_media',filter:`character_instance_id=eq.${character.id}`},(payload)=>{const id=String((payload.new as Record<string,unknown>|null)?.id??'');if(id)void manageMedia<{media:GeneratedMedia}>({action:'status',mediaId:id}).then((result)=>{upsertMedia(result.media);if(!mediaReconciliationComplete(result.media))setReconcilingMediaId(id);}).catch((caught)=>{if(caught instanceof ApiError&&caught.code==='NOT_FOUND'){removeMedia(id);return;}setReconcilingMediaId(id);});}).subscribe();return()=>{void supabase.removeChannel(channel);};},[character?.id,removeMedia,upsertMedia]));
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
  useFocusEffect(useCallback(()=>{if(!conversation?.id)return;const channel=createRealtimeChannel(supabase, `kivelle-conversation-actions-${conversation.id}-${realtimeScopeRef.current}`).on('postgres_changes',{event:'*',schema:'public',table:'together_conversation_actions',filter:`conversation_id=eq.${conversation.id}`},(payload)=>{const next=payload.new as ConversationAction|undefined,previous=payload.old as Partial<ConversationAction>|undefined,id=String(next?.id??previous?.id??'');if(next?.id&&next.status==='pending')upsertConversationAction(next);else if(id)removeConversationAction(id);}).subscribe();return()=>{void supabase.removeChannel(channel);};},[conversation?.id,removeConversationAction,upsertConversationAction]));
  useFocusEffect(useCallback(()=>{if(!conversation?.id)return;const channel=createRealtimeChannel(supabase, `kivelle-conversation-events-${conversation.id}-${realtimeScopeRef.current}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'together_conversation_events',filter:`conversation_id=eq.${conversation.id}`},(payload)=>{const event=payload.new as ConversationEvent|undefined;if(!event?.id)return;const current=useTogether.getState().snapshot;if(current&&!current.conversationEvents.some((item)=>item.id===event.id))setCoreState({conversationEvents:[...current.conversationEvents,event]});}).subscribe();return()=>{void supabase.removeChannel(channel);};},[conversation?.id,setCoreState]));
  useFocusEffect(useCallback(()=>{
    if(!character?.id||!conversation?.id){setMediaOffers([]);return;}
    let cancelled=false,retryTimer:ReturnType<typeof setTimeout>|undefined;
    const loadOffers=async(attempt=0)=>{try{
      const offers=await fetchPendingMediaOffers(character.id,conversation.id);if(cancelled)return;
      setMediaOffers(offers);resolveOptimisticPhotoOfferRef.current(offers);
      const mediaIds=[...new Set(offers.map((offer)=>offer.generated_media_id).filter((id):id is string=>Boolean(id)))].slice(0,20);
      if(mediaIds.length){
        const result=await manageMedia<{media:GeneratedMedia[]}>({action:'batch_status',mediaIds});if(cancelled)return;
        for(const media of result.media??[]){upsertMedia(media);if(!mediaReconciliationComplete(media))setReconcilingMediaId(media.id);}
        for(const id of missingMediaIds(mediaIds,result.media??[]))removeMedia(id);
      }
    }catch{if(!cancelled&&attempt<3)retryTimer=setTimeout(()=>void loadOffers(attempt+1),Math.min(8_000,1_500*2**attempt));}};
    void loadOffers();const channel=createRealtimeChannel(supabase, `kivelle-media-offers-${character.id}-${realtimeScopeRef.current}`).on('postgres_changes',{event:'*',schema:'public',table:'together_media_offers',filter:`character_instance_id=eq.${character.id}`},()=>void loadOffers()).subscribe();return()=>{cancelled=true;if(retryTimer)clearTimeout(retryTimer);void supabase.removeChannel(channel);};
  },[character?.id,conversation?.id,fetchPendingMediaOffers,removeMedia,upsertMedia]));
  useEffect(()=>{
    if(!reconcilingMediaId||!character?.id||!conversation?.id||!online)return;
    let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined,failedAttempts=0;
    const reconcile=async()=>{
      if (AppState.currentState !== 'active' || typeof document !== 'undefined' && document.visibilityState === 'hidden') { timer=setTimeout(()=>void reconcile(),10_000); return; }
      const pending=(useTogether.getState().snapshot?.generatedMedia??[]).filter((item)=>item.character_instance_id===character.id&&item.conversation_id===conversation.id&&item.media_type!=='voice_note'&&!mediaReconciliationComplete(item));
      if(!pending.length){setReconcilingMediaId(null);return;}
      const requestedIds=pending.map((item)=>item.id).slice(0,20);let refreshed:GeneratedMedia[]=[];
      try{const result=await manageMedia<{media:GeneratedMedia[]}>({action:'batch_status',mediaIds:requestedIds});refreshed=result.media??[];failedAttempts=0;}catch{failedAttempts+=1;if(!cancelled)timer=setTimeout(()=>void reconcile(),Math.min(30_000,3_000*2**Math.min(failedAttempts-1,3)));return;}
      if(cancelled)return;
      for(const id of missingMediaIds(requestedIds,refreshed))removeMedia(id);
      let incomplete=false;
      for(const media of refreshed){upsertMedia(media);if(!mediaReconciliationComplete(media))incomplete=true;}
      if(!incomplete){setReconcilingMediaId(null);return;}
      timer=setTimeout(()=>void reconcile(),3000);
    };
    timer=setTimeout(()=>void reconcile(),1500);
    return()=>{cancelled=true;if(timer)clearTimeout(timer);};
  },[reconcilingMediaId,character?.id,conversation?.id,removeMedia,upsertMedia,online,connectionPhase]);
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
  useFocusEffect(useCallback(()=>{
    if(!character)return;
    const refreshPresence=()=>{setPresenceNow(Date.now());void refresh({scope:'presence',characterInstanceId:character.id});};
    refreshPresence();
    const fallbackTimer=setInterval(refreshPresence,CHAT_PRESENCE_FALLBACK_REFRESH_MS);
    const channel=createRealtimeChannel(supabase, `kivelle-presence-${character.id}-${realtimeScopeRef.current}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'together_character_schedule_events',filter:`character_instance_id=eq.${character.id}`},refreshPresence)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'together_character_instances',filter:`id=eq.${character.id}`},refreshPresence)
      .on('postgres_changes',{event:'*',schema:'public',table:'together_scene_sessions',filter:`character_instance_id=eq.${character.id}`},refreshPresence)
      .subscribe();
    return()=>{if(fallbackTimer)clearInterval(fallbackTimer);void supabase.removeChannel(channel);};
  },[character?.id,refresh]));
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
  const chatContext=buildClientConversationContext(snapshot,character,new Date(presenceNow),conversation.id);
  const joinableSharedPlan=joinablePlanForChat(snapshot.sharedPlans??[],character.id);
  const location = chatContext.scene.location;
  const generatedMedia=(snapshot.generatedMedia??[]).filter((item)=>item.conversation_id===conversation.id);
  const galleryGeneratedMedia=mergeGeneratedMediaCollections(loadedGalleryMedia,generatedMedia);
  const chatGalleryItems=chatMediaGalleryItems(galleryGeneratedMedia,visibleMessages,conversation.id,loadedGalleryAttachments);
  const activePlace=snapshot.locations.find((item)=>item.id===(chatContext.scene.locationId??character.current_location_id));
  const activePlaceWorld=activePlace?worldForLocation(snapshot,activePlace.id):characterResidentWorld(snapshot,character);
  const activePlaceHref=activePlace?conversationLocationHref(activePlace.slug,{worldSlug:activePlaceWorld?.slug,character:characterHandle}):null;
  const mobileLocationBackground=sceneVisualSource(snapshot,character,chatContext);
  const portraitSource=resolveCharacterPortraitSource(character.together_character_templates,character.together_character_versions,slug)??characterAssets[slug]??characterAssets.maya!;
  const latestHeaderMedia=latestConversationHeaderImage(generatedMedia,conversation.id);
  const sharedSceneReactionNames=Object.fromEntries((sharedSceneRoster?.participants??[]).map((participant)=>[participant.character_instance_id,participant.together_character_instances?.together_character_templates.name.split(' ')[0]??'Companion']));
  const mediaOfferPreviewUri=latestMediaOfferPreviewUri(snapshot.generatedMedia??[],character.id,conversation.id);
  const mediaOfferPreviewSource=mediaOfferPreviewUri?{uri:mediaOfferPreviewUri}:resolveCharacterPortraitSource(character.together_character_templates,character.together_character_versions,slug);
  const visibleMessageIds=new Set(visibleMessages.map((message)=>message.id));
  const orphanMediaOffers=conversationReady?photoOffersAtTimelineTail(mediaOffers,visibleMessageIds,visibleMessages.map((message)=>message.created_at)):[];
  const isFavorite=(snapshot.favoriteCharacterTemplateIds??[]).includes(character.character_template_id);
  const milestone = snapshot.relationshipMilestones?.find((item) => item.character_instance_id === character.id);
  const prompts = chatContext.prompts;
  const latestPersistedMessage=[...visibleMessages].reverse().find((message)=>!message.id.startsWith('local-'));
  const latestAssistantMessage=latestPersistedMessage?.role==='assistant'&&latestPersistedMessage.delivery_status==='complete'&&latestPersistedMessage.content.trim()&&latestPersistedMessage.content!=='[Photo]'?latestPersistedMessage:null;
  const subscriberCanBranch=snapshot.entitlements?.tier==='kivelle_plus'||snapshot.entitlements?.tier==='kivelle_max';
  const branchSourceLifeId=typeof conversation.metadata?.branchSourceContinuityId==='string'?conversation.metadata.branchSourceContinuityId:null;
  const branchSourceConversationId=typeof conversation.metadata?.branchSourceConversationId==='string'?conversation.metadata.branchSourceConversationId:null;
  const alternatePaths=(snapshot.continuities??[]).filter((life)=>life.kind==='branch'&&life.metadata?.sourceConversationId===conversation.id);
  const branchFromLatest=(message:Message)=>{
    if(!subscriberCanBranch){navigateChatSurface(subscriptionHref({intent:'plans',returnTo:subscriptionReturnTo}));return;}
    if(branching||replyPending||pendingImage||message.id!==latestAssistantMessage?.id)return;
    confirmAction({title:'Start an alternate path?',message:`Continue from this reply in a separate Life with ${character.together_character_templates.name}. Your original conversation stays intact. Saved memories and relationships at this point are copied into the new path.`,confirmLabel:'Create path',onConfirm:async()=>{
      if(branchInFlight.current)return;
      branchInFlight.current=true;
      setBranching(true);
      try{
        if(branchRequest.current?.anchorId!==message.id)branchRequest.current={anchorId:message.id,requestId:createClientRequestId()};
        const result=await manageConversation<{continuityId:string;conversationId:string;characterInstanceId:string}>({action:'branch',conversationId:conversation.id,anchorMessageId:message.id,requestId:branchRequest.current.requestId});
        await refresh({force:true});
        navigateChatSurface(`/chat?character=${encodeURIComponent(result.characterInstanceId)}&conversationId=${encodeURIComponent(result.conversationId)}`,'replace');
      }catch(caught){Alert.alert('Could not create path',caught instanceof Error?caught.message:'Please try again.');}
      finally{branchInFlight.current=false;setBranching(false);}
    }});
  };
  const returnToOriginal=async()=>{
    if(!branchSourceLifeId||!branchSourceConversationId||branching)return;
    setBranching(true);
    try{
      setSnapshot(await managePersona<Snapshot>({action:'switch_life',continuityId:branchSourceLifeId}));
      navigateChatSurface(`/chat?conversationId=${encodeURIComponent(branchSourceConversationId)}`,'replace');
    }catch(caught){Alert.alert('Could not switch paths',caught instanceof Error?caught.message:'Please try again.');}
    finally{setBranching(false);}
  };
  const openAlternatePath=async(lifeId:string,conversationId:string)=>{
    if(branching)return;
    setBranching(true);
    try{
      setSnapshot(await managePersona<Snapshot>({action:'switch_life',continuityId:lifeId}));
      navigateChatSurface(`/chat?conversationId=${encodeURIComponent(conversationId)}`,'replace');
    }catch(caught){Alert.alert('Could not switch paths',caught instanceof Error?caught.message:'Please try again.');}
    finally{setBranching(false);}
  };
  currentInput.current=input;
  latestTimelineMessageId.current=latestPersistedMessage?.id??null;
  const pendingActions=conversationReady?(snapshot.conversationActions??[]).filter((item)=>item.status==='pending'&&item.character_instance_id===character.id&&item.conversation_id===conversation.id&&shouldShowPlanConversationAction(item,chatContext.scene.locationId,Boolean(activeSharedPlan))):[];
  const applyStartedPlan=(experience:PlanExperience,planId=experience.plan.id)=>{
    markInteractionSceneHydrated(experience.scene);
    upsertPlan(experience.plan);
    if(experience.scene){upsertSceneSession(experience.scene);setInteractionScene(experience.scene);setInteractionCandidates(experience.interactions??[]);setMovementCandidates(experience.destinations??[]);}
    setFocusPlanId(planId);setFocusDismissed(false);
  };
  const startTimelinePlan=async(plan:SharedPlan)=>{
    const availability=planActionAvailability(plan);
    if(!availability.primaryEnabled){setPlanModal({planId:plan.id});return;}
    const request=chatScope.start('plan-mutation');
    if(!request)return;
    setPlanActionBusyId(plan.id);setError('');
    try{const experience=await joinCommitment(plan.id,plan.character_instance_id);if(!request.isCurrent())return;applyStartedPlan(experience,plan.id);void refresh({force:true});if(Platform.OS!=='web')void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);}
    catch(caught){if(request.isCurrent()){setError(caught instanceof Error?caught.message:'The plan could not be started.');setPlanModal({planId:plan.id});}}
    finally{if(request.isCurrent())setPlanActionBusyId(null);request.release();}
  };
  const openPlanPicker=()=>{setPendingActionId(null);setInitialPlanTimingChoice(null);setSwitchPlanId(activeSharedPlan?.source==='date'?null:activeSharedPlan?.id??null);setShowPlans(true);};
  const dismissPlanInteractionTray=()=>{const planId=activeSharedPlan?.id;if(!planId)return;setDismissedInteractionPlanId(planId);setShowInteractions(false);const userId=session?.user.id;if(userId)void hidePlanInteractionTray(userId,planId);};
  const requestEndPlan=(plan:SharedPlan)=>{if(!planActionAvailability(plan).canEnd)return;setPlanEndTarget(plan);setError('');};
  const confirmEndPlan=async()=>{const plan=planEndTarget;if(!plan)return;const request=chatScope.start('plan-mutation');if(!request)return;setPlanActionBusyId(plan.id);setError('');try{await endPlanExperience(plan.id,character.id,interactionScene?.id);if(!request.isCurrent())return;setPlanEndTarget(null);setFocusPlanId(null);setFocusDismissed(true);setInteractionScene(null);setInteractionCandidates([]);setMovementCandidates([]);await refresh();if(request.isCurrent()&&Platform.OS!=='web')void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);}catch(caught){if(request.isCurrent())setError(caught instanceof Error?caught.message:'The plan could not be ended.');}finally{if(request.isCurrent())setPlanActionBusyId(null);request.release();}};
  const stageManualInput=(value:string)=>{autoDialogueRequest.current?.abort();autoDialogueRequest.current=null;setAutoDialogueBusy(false);setAutoDialogue(null);setInput(value);currentInput.current=value;setTimeout(()=>composerInput.current?.focus(),20);};
  const changeComposerInput=(value:string)=>{if(autoDialogueRequest.current){autoDialogueRequest.current.abort();autoDialogueRequest.current=null;setAutoDialogueBusy(false);}if(!value.trim())setAutoDialogue(null);setInput(value);currentInput.current=value;};
  const clearAutoDialogue=()=>{autoDialogueRequest.current?.abort();autoDialogueRequest.current=null;setAutoDialogueBusy(false);setAutoDialogue(null);setInput('');currentInput.current='';setTimeout(()=>composerInput.current?.focus(),20);};
  const openAutoDialogueOptions=()=>setShowAutoDialogueOptions(true);
  const requestAutoDialogue=async(preference:AutoDialoguePreference='natural')=>{
    if(!latestAssistantMessage||replyPending||autoDialogueBusy||pendingImage)return;
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
      if(caught instanceof ApiError&&caught.code==='CANONICAL_CHOICE_REQUIRED'){
        await refresh({force:true}).catch(()=>undefined);
        setError(caught.message);
        jumpToLatest();
        return;
      }
      if(caught instanceof ApiError&&caught.code==='STALE_SUGGESTION'){setError(caught.message);return;}
      const fallback=prompts[0];
      if(fallback){const suggestion:AutoDialogueSuggestion={suggestionId:`client-${Date.now()}`,text:fallback,source:'client_fallback',intent:'curious',preference,anchorMessageId:anchorId,expiresAt:new Date(Date.now()+2*60_000).toISOString()};setAutoDialogue(suggestion);setInput(fallback);currentInput.current=fallback;setTimeout(()=>composerInput.current?.focus(),20);}
      else setError(caught instanceof Error?caught.message:'A reply suggestion could not be generated.');
    }finally{if(autoDialogueRequest.current===controller){autoDialogueRequest.current=null;setAutoDialogueBusy(false);}}
  };
  const acceptOffer=async(offer:MediaOffer,paymentMethod:'credits'|'daily_included'='credits')=>{
    const request=chatScope.start('photo-offer-action');
    if(!request)return;
    const offerText=typeof offer.preview_metadata?.requestText==='string'?offer.preview_metadata.requestText:'';
    if(Platform.OS!=='web'&&photoRequestRestriction({requestText:offerText,requestedContentLevel:offer.content_level as "standard"|"romance"|"suggestive"|"mature"|"explicit",adultPipelineAuthorized:false})) {
      setBlockedPhoto({text:offerText,message:PHOTO_REQUEST_BLOCKED_MESSAGE});setError('');request.release();return;
    }
    setMediaOfferBusy(offer.id);
    // A tap is immediately visible, but `accepted` is reserved for the
    // authoritative server response that also owns the media job. Treating a
    // client-only tap as accepted can strand the card in a false generating
    // state when the request never reaches the server.
    setMediaOffers((current)=>current.map((item)=>item.id===offer.id?queueServerPhotoOfferAcceptance(item):item));
    const acceptanceRequestId=createClientRequestId();
    try{
      const result=await withPhotoRequestTimeout(manageMedia<{state:'accepted'|'needs_credits'|'daily_unavailable'|'expired';offer:MediaOffer;media?:GeneratedMedia;creditBalance:number;required?:number;dailyPhotoAllowanceRemaining?:number}>({action:'accept_offer',offerId:offer.id,requestId:acceptanceRequestId,paymentMethod}));
      if(!request.isCurrent())return;
      if(result.state==='daily_unavailable'){
        setMediaOffers((current)=>current.map((item)=>item.id===offer.id?{...result.offer,status:'pending',preview_metadata:{...result.offer.preview_metadata,dailyPhotoAllowanceRemaining:0}}:item.source==='user_request'&&item.status==='pending'?{...item,preview_metadata:{...item.preview_metadata,dailyPhotoAllowanceRemaining:0}}:item));
        Alert.alert('Included photos used','You have used today’s included photos. You can still create this one with Credits.');return;
      }
      if(result.state==='needs_credits'){
        setMediaOffers((current)=>current.map((item)=>item.id===offer.id?{...result.offer,status:'pending'}:item));
        Alert.alert('More credits needed',`You need ${result.required??offer.credit_cost} credits for this photo. Current balance: ${result.creditBalance}.`,[{text:'Not now',style:'cancel'},{text:'Buy Credits',onPress:()=>navigateChatSurface(creditsSubscriptionHref)}]);return;
      }
      if(result.state==='expired'){setMediaOffers((current)=>current.filter((item)=>item.id!==offer.id));setError('That photo moment has passed.');return;}
      const dailyRemaining=Math.max(0,Number(result.dailyPhotoAllowanceRemaining??result.offer.preview_metadata?.dailyPhotoAllowanceRemaining??0));
      setMediaOffers((current)=>current.map((item)=>item.id===offer.id?{...result.offer,preview_metadata:{...result.offer.preview_metadata,dailyPhotoAllowanceRemaining:dailyRemaining}}:paymentMethod==='daily_included'&&item.source==='user_request'&&item.status==='pending'?{...item,preview_metadata:{...item.preview_metadata,dailyPhotoAllowanceRemaining:dailyRemaining}}:item));
      if(result.media){upsertMedia(result.media);setReconcilingMediaId(result.media.id);}
    }catch(caught){
      if(!request.isCurrent())return;
      if(caught instanceof ApiError&&caught.code===PHOTO_CONTENT_BLOCKED){setMediaOffers((current)=>current.filter((item)=>item.id!==offer.id));setBlockedPhoto({text:offerText,message:caught.message});setError('');return;}
      // An interrupted response may still have accepted, charged, and queued
      // the request. Reconcile the server-owned offer/media link before making
      // the card actionable again so a successful request cannot remain on
      // "Starting…" or be submitted twice.
      const recovered=await waitForPhotoOfferStatus({loadStatus:()=>loadPhotoOfferStatus(offer.id)});
      if(!request.isCurrent())return;
      if(recovered){
        setMediaOffers((current)=>current.map((item)=>item.id===offer.id?recovered.offer:item));
        if(recovered.media){upsertMedia(recovered.media);if(!mediaReconciliationComplete(recovered.media))setReconcilingMediaId(recovered.media.id);}
        if(recovered.offer.status==='accepted'&&recovered.media){setError('');return;}
        if(recovered.offer.status==='failed'){setError(recovered.offer.failure_reason_safe??recovered.media?.failure_reason_safe??'The photo could not be created.');return;}
      }
      setMediaOffers((current)=>current.map((item)=>item.id===offer.id?offer:item));
      setError(caught instanceof Error?caught.message:'The photo could not be prepared.');
      try{const offers=await fetchPendingMediaOffers(character.id,conversation.id);if(request.isCurrent())setMediaOffers(offers);}catch{/* Keep the visible offer for a later refresh. */}
    }finally{if(request.isCurrent())setMediaOfferBusy(null);request.release();}
  };
  const declineOffer=async(offer:MediaOffer)=>{
    const request=chatScope.start('photo-offer-action');
    if(!request)return;
    setMediaOfferBusy(offer.id);setMediaOffers((current)=>current.filter((item)=>item.id!==offer.id));
    try{
      const result=await manageMedia<{offer:MediaOffer;removedMediaId:string|null}>({action:'dismiss_offer',offerId:offer.id});
      if(!request.isCurrent())return;
      if(result.removedMediaId)removeMedia(result.removedMediaId);
      if(offer.status==='pending'&&result.offer.status==='declined'&&offer.source==='user_request'&&typeof offer.message_id==='string')
        setDeclinedPhotoReply({offer,dismissed:result.offer,queuedAt:Date.now()});
    }
    catch(caught){if(request.isCurrent()){setMediaOffers((current)=>current.some((item)=>item.id===offer.id)?current:[offer,...current]);setError(caught instanceof Error?caught.message:'The offer could not be dismissed.');}}
    finally{if(request.isCurrent())setMediaOfferBusy(null);request.release();}
  };
  const dispatchOptimisticPhotoDecision=(requestId:string,offer:MediaOffer,decision:QueuedPhotoOfferDecision)=>{
    if(decision.requestId!==requestId||queuedPhotoOfferDecisionRef.current?.requestId!==requestId||optimisticPhotoRequestRef.current?.requestId!==requestId||optimisticPhotoDecisionDispatched.current.has(requestId))return false;
    optimisticPhotoDecisionDispatched.current.add(requestId);
    if(optimisticPhotoRequestRef.current?.requestId===requestId){
      optimisticPhotoRequestRef.current=null;
      setAwaitingPhotoOffer(false);
      setOptimisticPhotoRequest(null);
    }
    if(queuedPhotoOfferDecisionRef.current?.requestId===requestId)queuedPhotoOfferDecisionRef.current=null;
    if(decision.action==='decline')void declineOffer(offer);
    else void acceptOffer(offer,decision.paymentMethod??'credits');
    return true;
  };
  resolveOptimisticPhotoOfferRef.current=(offers)=>{
    const request=optimisticPhotoRequestRef.current;
    if(!request)return;
    const offer=matchingServerPhotoOffer(offers,request);
    if(!offer)return;
    const decision=queuedPhotoOfferDecisionRef.current;
    if(decision?.requestId===request.requestId){dispatchOptimisticPhotoDecision(request.requestId,offer,decision);return;}
    optimisticPhotoRequestRef.current=null;
    setAwaitingPhotoOffer(false);
    setOptimisticPhotoRequest(null);
  };
  const decideOptimisticPhotoOffer=(action:'accept'|'decline',paymentMethod?:'credits'|'daily_included')=>{
    const request=optimisticPhotoRequestRef.current;
    if(!request)return;
    const decision:QueuedPhotoOfferDecision={requestId:request.requestId,action,paymentMethod};
    queuedPhotoOfferDecisionRef.current=decision;
    // The authoritative offer may already be in state even though the
    // optimistic card is still visible. Consume it from this user gesture so
    // Accept/Decline cannot wait forever for an unrelated future update.
    const readyOffer=matchingServerPhotoOffer(mediaOffers,request);
    if(readyOffer){
      dispatchOptimisticPhotoDecision(request.requestId,readyOffer,decision);
      return;
    }
    if(action==='decline'){
      setAwaitingPhotoOffer(false);
      setOptimisticPhotoRequest(null);
    }else setOptimisticPhotoRequest((current)=>current&&current.requestId===request.requestId
        ? queueOptimisticPhotoOfferAcceptance(current)
        : current);
    if(optimisticPhotoDecisionInFlight.current.has(request.requestId))return;
    optimisticPhotoDecisionInFlight.current.add(request.requestId);
    void waitForMatchingServerPhotoOffer({
      request,
      loadOffers:()=>fetchPendingMediaOffers(request.offer.character_instance_id,String(request.offer.conversation_id)),
    }).then(({offer,offers})=>{
      if(offers.length)setMediaOffers(offers);
      if(offer){dispatchOptimisticPhotoDecision(request.requestId,offer,decision);return;}
      if(queuedPhotoOfferDecisionRef.current?.requestId===request.requestId){
        queuedPhotoOfferDecisionRef.current=null;
        setOptimisticPhotoRequest((current)=>current?.requestId===request.requestId
          ? {...current,offer:{...current.offer,preview_metadata:{...current.offer.preview_metadata,acceptQueued:false}}}
          : current);
        setError(action==='decline'?'The photo request could not be dismissed. Tap the close button again.':'The photo confirmation has not been confirmed. Check the existing request before trying again.');
      }
    }).catch((caught)=>{
      if(queuedPhotoOfferDecisionRef.current?.requestId!==request.requestId)return;
      queuedPhotoOfferDecisionRef.current=null;
      setOptimisticPhotoRequest((current)=>current?.requestId===request.requestId
        ? {...current,offer:{...current.offer,preview_metadata:{...current.offer.preview_metadata,acceptQueued:false}}}
        : current);
      setError(caught instanceof Error?caught.message:'The photo could not be started. Tap again to retry.');
    }).finally(()=>optimisticPhotoDecisionInFlight.current.delete(request.requestId));
  };
  const retryGeneratedMedia=async(mediaId:string)=>{
    if(mediaRetryInFlight.current.has(mediaId))return;
    mediaRetryInFlight.current.add(mediaId);setMediaRetryBusyId(mediaId);setError('');
    try{const result=await manageMedia<{media:GeneratedMedia}>({action:'retry',mediaId});upsertMedia(result.media);setReconcilingMediaId(result.media.id);}
    catch(caught){setError(caught instanceof Error?caught.message:'The photo could not be retried.');}
    finally{mediaRetryInFlight.current.delete(mediaId);setMediaRetryBusyId((current)=>current===mediaId?null:current);}
  };
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

  const send = async (retryText?: string,retryRequestId?:string,retryMessageId?:string,messageAction?:DirectMessageAction,preserveComposer=false,messagePresentation?:OneTapSelfieMessagePresentation) => {
    const draft = retryMessageId&&retryText==='[Photo]'&&pendingImage ? '' : retryText ?? input;
    if (draft.length > MESSAGE_CHARACTER_LIMIT) { setError(messageCharacterLimitError()); return; }
    const text = draft.trim(); if ((!text&&!pendingImage) || replyPending || sendInFlightRef.current) return;
    if(!messageAction&&Platform.OS!=='web'&&shouldShowPhotoGenerationPending(text)&&photoRequestRestriction({requestText:text,adultPipelineAuthorized:false})) {
      setBlockedPhoto({text,message:PHOTO_REQUEST_BLOCKED_MESSAGE});setError('');return;
    }
    setBlockedPhoto(null);
    if(!retryMessageId&&dailyMessageExhausted&&messageAction?.messageAction!=='respond_to_declined_photo'){setError('You’ve used today’s free messages.');return;}
    if(connectionPhase!=='online')setShowSendConnectionNotice(true);
    if(!online){setError('You’re offline. Your draft is saved and ready when you reconnect.');return;}
    const attempt=await authorizeReply(chatScope,()=>contextPricing.authorize({conversationId:conversation.id,characterInstanceId:character.id,message:text,focusPlanId:focusPlanId??undefined,...(messageAction?{messageAction:messageAction.messageAction,anchorMessageId:messageAction.anchorMessageId}:{})}));
    if(!attempt)return;
    const {authorization:contextAuthorization,request}=attempt;
    if(isSceneReplyPending()){request.release();return;}
    const isCurrent=chatScope.capture();
    sendInFlightRef.current=true;
    const sentAutoDialogue=!retryText&&!messageAction?autoDialogue:null;
    const retrySource=retryMessageId?messages.find((message)=>message.id===retryMessageId):undefined;
    const effectiveMessagePresentation=messagePresentation??(retrySource?.provider_metadata?.messagePresentation===ONE_TAP_SELFIE_MESSAGE_PRESENTATION?ONE_TAP_SELFIE_MESSAGE_PRESENTATION:undefined);
    const retryAttachments=retrySource?.attachments??retrySource?.together_conversation_attachments??[];
    const retryAttachmentIds=retryAttachments.map((attachment)=>attachment.id).filter(Boolean);
    keepPinnedToBottom.current=true;
    autoDialogueRequest.current?.abort();autoDialogueRequest.current=null;setAutoDialogue(null);setAutoDialogueBusy(false);if(!preserveComposer)currentInput.current='';
    const before = useTogether.getState().snapshot;
    const expectsPhotoOffer=!messageAction&&shouldShowPhotoGenerationPending(text);
    const selectedImage=messageAction?null:pendingImage;if(!preserveComposer)setInput(''); setError(''); setSending(true); setStream(''); setFeedback(null);
    let preparedAttachmentId:string|undefined;let sentAttachment:ConversationAttachment|undefined;let sceneActionId:string|undefined;
    const clientRequestId=retryRequestId??createClientRequestId();
    activeSendRequest.current=clientRequestId;
    let primaryComplete=false;
    if(expectsPhotoOffer){
      const knownDailyRemaining=mediaOffers
        .filter((offer)=>offer.source==='user_request')
        .map((offer)=>Number(offer.preview_metadata?.dailyPhotoAllowanceRemaining))
        .find((value)=>Number.isFinite(value));
      const request=createOptimisticPhotoRequest({requestId:clientRequestId,conversationId:conversation.id,characterInstanceId:character.id,continuityId:character.continuity_id,characterName:character.together_character_templates.name,subscriptionTier:snapshot.entitlements?.tier,lastKnownDailyRemaining:knownDailyRemaining});
      optimisticPhotoRequestRef.current=request;
      queuedPhotoOfferDecisionRef.current=null;
      setOptimisticPhotoRequest(request);
      setAwaitingPhotoOffer(true);
    }
    if(bottomPinReleaseTimer.current)clearTimeout(bottomPinReleaseTimer.current);
    activeBottomPinRequest.current=clientRequestId;
    forcePinnedUntil.current=Date.now()+1_200;
    const optimistic: Message = { id: retryMessageId??`local-${Date.now()}`, conversation_id: conversation.id, role: 'user', content: text||'[Photo]', client_request_id:clientRequestId,delivery_status: 'pending', created_at: retrySource?.created_at??new Date().toISOString(),provider_metadata:retrySource?.provider_metadata??(messageAction?{uiHidden:true,messageAction:messageAction.messageAction,anchorMessageId:messageAction.anchorMessageId}:effectiveMessagePresentation?{uiHidden:true,messagePresentation:effectiveMessagePresentation}:undefined),attachments:selectedImage?[pendingImageAttachment(selectedImage,conversation.id)]:retryAttachments };
    beginPendingDialogue({conversationId:conversation.id,characterInstanceId:character.id,clientRequestId,startedAt:new Date().toISOString(),showTyping:!expectsPhotoOffer});
    setMessages((current) => retryMessageId?current.map((item)=>item.id===retryMessageId?optimistic:item):[...current, optimistic]);
    settleSentMessageAtBottom(clientRequestId);
    try {
      if(selectedImage){
        const attachment=await uploadConversationImage({image:selectedImage,conversationId:conversation.id,characterInstanceId:character.id,text,isCurrent,onPhase:setPhotoUploadPhase,onPrepared:(id)=>{preparedAttachmentId=id;}});
        if(!attachment)return;
        sentAttachment=attachment;
      }
      // A clear free-text action is matched only against the server's current
      // scene candidates, then executed before the dialogue context is built.
      // This gives the normal companion response the real scene change to
      // react to, while questions and vague ideas remain ordinary chat.
      if(isCoPresent&&!messageAction&&!contextAuthorization.contextQuoteId&&!contextAuthorization.contextCostAuthorization){
        try{
          const sceneResult=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[];intentMatch?:InteractionCandidate;characterProposal?:CharacterInteractionProposal}>({action:'resolve',characterInstanceId:character.id,conversationId:conversation.id,intentText:text});
          if(!isCurrent())return;
          markInteractionSceneHydrated(sceneResult.scene);setInteractionScene(sceneResult.scene?.id?sceneResult.scene:null);
          setInteractionCandidates(sceneResult.interactions??[]);
          setMovementCandidates(sceneResult.destinations??[]);
          setCharacterProposal(sceneResult.characterProposal??null);
          if(sceneResult.intentMatch){const sceneAction=await executeInteraction(sceneResult.intentMatch,'defer_to_current_message');sceneActionId=sceneAction?.id;}
        }catch{/* The sent message is still valid if the scene changed. */}
      }
      if(!isCurrent())return;
      const result = await sendDialogue({ ...contextAuthorization, conversationId: conversation.id, characterInstanceId: character.id, message: text,attachmentIds:preparedAttachmentId?[preparedAttachmentId]:retryAttachmentIds, clientRequestId,focusPlanId:focusPlanId??undefined,...(sceneActionId?{sceneActionId}:{}),...(messageAction?{messageAction:messageAction.messageAction,anchorMessageId:messageAction.anchorMessageId}:{}),...(effectiveMessagePresentation?{messagePresentation:effectiveMessagePresentation}:{}),...(sentAutoDialogue?{autoDialogueSuggestionId:sentAutoDialogue.suggestionId,autoDialogueSuggestionSource:sentAutoDialogue.source,autoDialogueSuggestionEdited:text!==sentAutoDialogue.text.trim(),autoDialogueSuggestionIntent:sentAutoDialogue.intent,autoDialogueSuggestionPreference:sentAutoDialogue.preference}:{}) }, (token) => {if(!isCurrent()||activeSendRequest.current!==clientRequestId)return;if(activeBottomPinRequest.current===clientRequestId)forcePinnedUntil.current=Date.now()+1_200;setStream((current) => current + token);}, {
        onPrimary:(message)=>{
          if(!isCurrent()||activeSendRequest.current!==clientRequestId)return;
          primaryComplete=true;
          seamlessCompletionIds.current.add(message.id);
          setMessages(current=>reconcileMessages(current,[{...optimistic,delivery_status:'complete',attachments:sentAttachment?[sentAttachment]:optimistic.attachments},message]));
          cleanupNormalizedImage(selectedImage?.uri);setPendingImage(null);setPhotoUploadPhase('idle');setStream('');
          request.release();sendInFlightRef.current=false;setSending(false);finishPendingDialogue(conversation.id,clientRequestId);
          settleSentMessageAtBottom(clientRequestId);
        },
        onMessage:(message)=>{if(isCurrent()&&activeSendRequest.current===clientRequestId)setMessages(current=>reconcileMessages(current,[message]));},
      });
      if(!isCurrent()||activeSendRequest.current!==clientRequestId)return;
      seamlessCompletionIds.current.add(result.message.id);
      if(!primaryComplete){cleanupNormalizedImage(selectedImage?.uri);setPendingImage(null);setPhotoUploadPhase('idle');}setStream(''); setMessages((current) => reconcileMessages(current,[{...optimistic,delivery_status:'complete',attachments:sentAttachment?[sentAttachment]:optimistic.attachments},result.message,...(result.additionalMessages??[])]));settleSentMessageAtBottom(clientRequestId);
      void markConversationRead(conversation.id).catch(()=>undefined);
      if(result.generatedMedia){upsertMedia(result.generatedMedia);setReconcilingMediaId(result.generatedMedia.id);}
      if(result.mediaOffer){
        setMediaOffers((current)=>[result.mediaOffer!,...current.filter((item)=>item.id!==result.mediaOffer!.id)]);
        // The response already contains the canonical offer. Resolve the
        // temporary card in this turn instead of waiting for a React effect or
        // realtime event, either of which can be lost during a fast rerender.
        resolveOptimisticPhotoOfferRef.current([result.mediaOffer]);
      }
      if(result.photoRequestError){optimisticPhotoRequestRef.current=null;queuedPhotoOfferDecisionRef.current=null;setAwaitingPhotoOffer(false);setOptimisticPhotoRequest(null);setError(result.photoRequestError.message);if(result.photoRequestError.code===PHOTO_CONTENT_BLOCKED){setBlockedPhoto({text:draft,message:result.photoRequestError.message});setError('');}}
      // The dialogue response already owns the canonical offer. A second
      // eventually-consistent list read can be empty and must not erase it.
      if(expectsPhotoOffer&&!result.photoRequestError&&!result.mediaOffer){
        try{const offers=await fetchPendingMediaOffers(character.id,conversation.id);if(!isCurrent())return;setMediaOffers(offers);resolveOptimisticPhotoOfferRef.current(offers);if(!matchingServerPhotoOffer(offers,{requestId:clientRequestId,startedAt:optimistic.created_at,offer:{character_instance_id:character.id,conversation_id:conversation.id}})){optimisticPhotoRequestRef.current=null;queuedPhotoOfferDecisionRef.current=null;setAwaitingPhotoOffer(false);setOptimisticPhotoRequest(null);setError('The photo confirmation did not appear. Please try the request again.');}}
        catch(caught){if(isCurrent()&&!isTransientMediaFetchFailure(caught))setError('The photo confirmation could not be loaded. Please try again.');}
      }
      if(!isCurrent())return;
      if(result.delta)applyServerDelta(result.delta);
      if(!retryMessageId&&messageAction?.messageAction!=='respond_to_declined_photo')consumeDailyMessageAllowance();
      if(!preserveComposer&&!currentInput.current.trim())await clearStoredDraft();
      if(!isCurrent())return;
      showNewStoryFeedback(before, useTogether.getState().snapshot, character.id, character.together_character_templates.name, setFeedback);
    } catch (caught) {
      if(!isCurrent()||activeSendRequest.current!==clientRequestId||primaryComplete)return;
      if(expectsPhotoOffer){optimisticPhotoRequestRef.current=null;queuedPhotoOfferDecisionRef.current=null;setAwaitingPhotoOffer(false);setOptimisticPhotoRequest(null);}
      if(caught instanceof ApiError&&caught.code===PHOTO_CONTENT_BLOCKED){setBlockedPhoto({text:draft,message:caught.message});setError('');setStream('');setInput(draft);currentInput.current=draft;setMessages((current)=>current.filter((item)=>item.id!==optimistic.id));return;}
      const recovered=dialogueFailureMayHavePersisted(caught)?await recoverInterruptedDialogue(conversation.id,character.id,optimistic,clientRequestId,expectsPhotoOffer):false;
      if(!isCurrent())return;
      if(recovered){if(!retryMessageId&&messageAction?.messageAction!=='respond_to_declined_photo')consumeDailyMessageAllowance();cleanupNormalizedImage(selectedImage?.uri);setPendingImage(null);setPhotoUploadPhase('idle');setStream('');setError('');if(!preserveComposer)await clearStoredDraft();return;}
      if(preparedAttachmentId)void removePendingAttachment(preparedAttachmentId).catch(()=>undefined);
      if(selectedImage&&caught instanceof ApiError&&caught.code==='PROVIDER_CONTENT_BLOCKED'){
        setPhotoUploadPhase('blocked');setStream('');setError(caught.message);
        setMessages((current)=>current.filter((item)=>item.id!==optimistic.id));
        if(!preserveComposer){setInput(draft);currentInput.current=draft;}
        return;
      }
      if(selectedImage)setPhotoUploadPhase('failed');
      setStream(''); setError(caught instanceof Error ? caught.message : 'The reply was interrupted.');
      if(!messageAction&&!preserveComposer&&!effectiveMessagePresentation){setInput(draft);currentInput.current=draft;}
      if(caught instanceof ApiError&&caught.code==='CONVERSATION_ARCHIVED')await refresh();
      if(!isCurrent())return;
      if(caught instanceof ApiError&&caught.code==='PLAN_LIMIT_REACHED'){exhaustDailyMessageAllowance();if(expectsPhotoOffer)setShowPhotoPaywall(true);}
      setMessages((current) => current.map((item) => item.id === optimistic.id ? { ...item, delivery_status: 'failed' } : item));
    } finally {
      request.release();
      finishPendingDialogue(conversation.id,clientRequestId);
      if(isCurrent()&&activeSendRequest.current===clientRequestId){sendInFlightRef.current=false;setSending(false);}
      if(isCurrent()&&activeSendRequest.current===clientRequestId&&expectsPhotoOffer&&!optimisticPhotoRequestRef.current)setAwaitingPhotoOffer(false);
      if(isCurrent()&&activeBottomPinRequest.current===clientRequestId){
        forcePinnedUntil.current=Date.now()+1_000;
        bottomPinReleaseTimer.current=setTimeout(()=>{if(activeBottomPinRequest.current!==clientRequestId)return;scrollToLatest(false);activeBottomPinRequest.current=null;forcePinnedUntil.current=Date.now()+500;},1_200);
      }
    }
  };
  replayPersistedDialogueRef.current=(message)=>{
    if(!message.client_request_id)return;
    const messagePresentation=message.provider_metadata?.messagePresentation===ONE_TAP_SELFIE_MESSAGE_PRESENTATION?ONE_TAP_SELFIE_MESSAGE_PRESENTATION:undefined;
    const photoDecline=message.provider_metadata?.messageAction==='respond_to_declined_photo'&&typeof message.provider_metadata.anchorMessageId==='string'
      ? {messageAction:'respond_to_declined_photo' as const,anchorMessageId:message.provider_metadata.anchorMessageId} : undefined;
    void send(declinedPhotoReplayText(message,messages),message.client_request_id,message.id,photoDecline,true,messagePresentation);
  };

  const openCreatedPlan=async(result:PlanMutationResult|undefined,timing:PlanTimingSelection,isCurrent:()=>boolean)=>{
    if(timing.choice!=='now'||!result?.commitment.id)return;
    if(!isCurrent())return;
    if(result.kind==='date'){navigateChatSurface(`/date/${result.commitment.id}`);return;}
    try{const experience=result.experience??await joinCommitment(result.commitment.id,character.id);if(isCurrent())applyStartedPlan(experience,result.commitment.id);}
    catch(caught){if(isCurrent())setError(`The plan was saved, but it could not start yet: ${caught instanceof Error?caught.message:'try again from its plan card.'}`);}
  };
  useEffect(()=>{
    if(!declinedPhotoReply)return;
    const {offer,dismissed,queuedAt}=declinedPhotoReply;
    const anchor=declinedPhotoReplyAnchor(offer,dismissed,messages);
    if(!anchor){
      if(messages.some((message)=>message.id===offer.message_id)||Date.now()-queuedAt>10_000)setDeclinedPhotoReply(null);
      else{const timer=setTimeout(()=>setDeclinedPhotoReply(null),Math.max(1,10_000-(Date.now()-queuedAt)));return()=>clearTimeout(timer);}
      return;
    }
    if(replyPending||sendInFlightRef.current)return;
    const originalMessage=messages.find((message)=>message.role==='user'&&
      message.client_request_id===offer.preview_metadata?.clientRequestId&&message.provider_metadata?.uiHidden!==true);
    const requestText=originalMessage?.content??'';
    if(!requestText.trim()){setDeclinedPhotoReply(null);return;}
    setDeclinedPhotoReply(null);
    void send(requestText,undefined,undefined,{messageAction:'respond_to_declined_photo',anchorMessageId:anchor},true);
  },[declinedPhotoReply,messages,replyPending,setDeclinedPhotoReply]);
  const plan = async (option:PlanOption,timing:PlanTimingSelection) => {
    const request=chatScope.start('plan-mutation');
    if(!request)return;
    setPlanning(true); setError('');
    try {
      const timingInput=timing.choice==='custom'?{timingChoice:'custom' as const,startsAt:timing.startsAt}:{timingChoice:timing.choice};
      if(switchPlanId){if(timing.choice!=='now')throw new Error('Choose Switch Now to replace the active plan.');const result=await switchPlanExperience<PlanMutationResult>({currentPlanId:switchPlanId,characterInstanceId:character.id,activityKey:option.activityKey,locationId:option.locationId,sourceConversationId:conversation.id,sceneId:interactionScene?.id,requestId:planRequestIdRef.current});if(!request.isCurrent())return;planRequestIdRef.current=createClientRequestId();setSwitchPlanId(null);setFocusPlanId(null);setFocusDismissed(true);setInteractionScene(null);setInteractionCandidates([]);setMovementCandidates([]);router.setParams({plan:undefined,location:undefined,world:undefined,activity:undefined,switchPlanId:undefined});setShowPlans(false);if(result.experience)applyStartedPlan(result.experience,result.commitment.id);void refresh();}
      else if(pendingActionId){const result=await confirmConversationAction<ConversationActionMutation>(pendingActionId,{activityKey:option.activityKey,locationId:option.locationId,...timingInput});if(!request.isCurrent())return;removeConversationAction(pendingActionId);setPendingActionId(null);setInitialPlanTimingChoice(null);setShowPlans(false);await openCreatedPlan(result.result,timing,request.isCurrent);if(request.isCurrent())void refresh();}
      else{const result=await createSharedPlan<PlanMutationResult>({activityKey:option.activityKey,locationId:option.locationId,characterInstanceId:character.id,...timingInput,requestId:planRequestIdRef.current,source:params.location?'location':'manual_planner',sourceConversationId:conversation.id});if(!request.isCurrent())return;planRequestIdRef.current=createClientRequestId();setInitialPlanTimingChoice(null);setShowPlans(false);await openCreatedPlan(result,timing,request.isCurrent);if(request.isCurrent())void refresh();}
      if(request.isCurrent()&&Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    catch (caught) { if(request.isCurrent())setError(caught instanceof Error ? caught.message : 'The plan could not be saved.'); }
    finally { if(request.isCurrent())setPlanning(false);request.release(); }
  };
  const confirmPlanSuggestion=async(action:ConversationAction,planId?:string)=>{
    const proposed=typeof action.payload.proposedStartsAt==='string'?action.payload.proposedStartsAt:null;
    const validProposed=Boolean(proposed&&new Date(proposed).getTime()>=Date.now()+10*60000);
    const direct=['plan_cancel','cancel_plan'].includes(action.candidate_type)||validProposed||Boolean(planId);
    if(!direct){setPendingActionId(action.id);setSwitchPlanId(null);setShowPlans(true);return;}
    const request=chatScope.start('plan-mutation');
    if(!request)return;
    setPlanning(true);
    try{
      await confirmConversationAction(action.id,{planId,startsAt:validProposed?proposed??undefined:undefined});
      if(!request.isCurrent())return;
      removeConversationAction(action.id);
      void refresh().catch(()=>undefined);
    }catch(caught){if(request.isCurrent())setError(caught instanceof Error?caught.message:'That action could not be completed.');}
    finally{if(request.isCurrent())setPlanning(false);request.release();}
  };
  const dismissPlanSuggestion=async(action:ConversationAction)=>{
    const request=chatScope.start('plan-mutation');
    if(!request)return;
    removeConversationAction(action.id);
    try{await dismissConversationAction(action.id);}
    catch(caught){if(request.isCurrent()){upsertConversationAction(action);setError(caught instanceof Error?caught.message:'That suggestion could not be dismissed.');}}
    finally{request.release();}
  };
  const undoMemory = async () => { if (!feedback?.id) return; await mutateMemory({ action:'forget', memoryId:feedback.id }); await refresh(); setFeedback(null); };
  const applySceneDelta = (scene:SceneSession|null|undefined) => {
    if(!scene?.id)return;
    upsertSceneSession(scene);
    updateCompanion({...character,current_location_id:scene.location_id,current_activity:sceneActivityLabel(scene),current_interruptibility:'open',current_presence_source:'scene'});
  };
  const executeInteraction = async (candidate:InteractionCandidate,reactionMode:'generate'|'defer_to_current_message'='generate') => {
    if(interactionLoading||(reactionMode==='generate'&&replyPending))return;
    const previousCandidates=interactionCandidates,previousProposal=characterProposal;
    let action:SceneAction|undefined;
    setInteractionLoading(true);setError('');setShowInteractions(false);setCharacterProposal(null);
    setInteractionCandidates((current)=>current.filter((item)=>item.interactionKey!==candidate.interactionKey));
    if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try{
      const result=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[];action?:SceneAction;characterProposal?:CharacterInteractionProposal}>({action:'execute',characterInstanceId:character.id,conversationId:conversation.id,sceneId:interactionScene?.id,interactionKey:candidate.interactionKey,requestId:createClientRequestId()});
      markInteractionSceneHydrated(result.scene);setInteractionScene(result.scene?.id?result.scene:null);applySceneDelta(result.scene);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);setCharacterProposal(result.characterProposal??null);
      action=result.action;
      if(reactionMode==='generate'&&action?.id)setPendingSceneAction({...sceneActionTimelineEntryFromAction(action,candidate.label),createdAt:action.created_at});
    }catch(caught){
      setInteractionCandidates(previousCandidates);setCharacterProposal(previousProposal);setPendingSceneAction(null);setShowInteractions(true);
      setError(caught instanceof Error?caught.message:'That option is no longer available.');return undefined;
    }finally{setInteractionLoading(false);}
    if(reactionMode==='generate'&&action?.id)await generateSceneReaction(action.id);
    return action;
  };
  const isSceneReplyPending=()=>!proposalScopeActive.current||replyPendingRef.current||sendInFlightRef.current||Boolean(useTogether.getState().pendingDialogues[conversation.id]);
  const generateSceneReaction=async(actionId:string)=>{if(isSceneReplyPending())return;const clientRequestId=createClientRequestId();beginPendingDialogue({conversationId:conversation.id,characterInstanceId:character.id,clientRequestId,startedAt:new Date().toISOString(),showTyping:true});setSending(true);setStream('');setError('');try{const reaction=await sendSceneReaction({conversationId:conversation.id,characterInstanceId:character.id,sceneActionId:actionId,clientRequestId},(token)=>setStream((current)=>current+token),()=>setStream(''));setStream('');setMessages((current)=>current.some((message)=>message.id===reaction.message.id)?current:[...current,reaction.message]);setPendingSceneAction((current)=>current?.id===actionId?null:current);}catch(caught){setStream('');setError(`${caught instanceof Error?caught.message:'The activity was saved, but the reply was interrupted.'} Tap to retry.`);}finally{finishPendingDialogue(conversation.id,clientRequestId);setSending(false);}};
  const acceptCharacterProposal=async()=>{
    const proposal=characterProposal;
    if(!proposal||interactionLoading||!proposalDecisions.begin(proposal.actionId))return;
    // The choice should feel local and immediate. Server confirmation and the
    // optional companion reaction continue after the card leaves the timeline.
    setCharacterProposal(null);setInteractionLoading(true);setError('');
    let saved=false;
    let reactionActionId:string|undefined;
    if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try{
      const result=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[];action?:SceneAction;characterProposal?:CharacterInteractionProposal}>({action:'accept_proposal',characterInstanceId:character.id,conversationId:conversation.id,sceneId:interactionScene?.id,proposalActionId:proposal.actionId,requestId:createClientRequestId()});
      saved=true;
      if(!proposalScopeActive.current)return;
      markInteractionSceneHydrated(result.scene);
      setInteractionScene(result.scene?.id?result.scene:null);applySceneDelta(result.scene);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);
      setCharacterProposal(result.characterProposal?.actionId===proposal.actionId?null:result.characterProposal??null);
      if(result.action?.id){
        reactionActionId=result.action.id;
        setPendingSceneAction({...sceneActionTimelineEntryFromAction(result.action,proposal.label),createdAt:result.action.created_at});
      }
    }catch(caught){
      if(!proposalScopeActive.current)return;
      setError(caught instanceof Error?caught.message:'That suggestion is no longer available.');
      if(!saved)setCharacterProposal((current)=>current??proposal);
    }finally{proposalDecisions.finish(proposal.actionId,saved);if(proposalScopeActive.current)setInteractionLoading(false);}
    // Reply generation must not keep the proposal controls busy. Never replace
    // an existing stream, including one that started while the choice was saved.
    if(reactionActionId){const actionId=reactionActionId;await reactToSavedProposal(isSceneReplyPending,()=>generateSceneReaction(actionId));}
  };
  const dismissCharacterProposal=async()=>{
    const proposal=characterProposal;
    if(!proposal||interactionLoading||!proposalDecisions.begin(proposal.actionId))return;
    // Dismiss optimistically; a slow network should never hold a declined card
    // on screen. A later scene refresh will reconcile server state if needed.
    setCharacterProposal(null);setInteractionLoading(true);setError('');
    let saved=false;
    if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try{
      const result=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[]}>({action:'dismiss_proposal',characterInstanceId:character.id,conversationId:conversation.id,sceneId:interactionScene?.id,proposalActionId:proposal.actionId});
      saved=true;
      if(!proposalScopeActive.current)return;
      markInteractionSceneHydrated(result.scene);
      setInteractionScene(result.scene?.id?result.scene:null);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);
    }catch(caught){if(proposalScopeActive.current){setError(caught instanceof Error?caught.message:'That suggestion could not be dismissed.');setCharacterProposal((current)=>current??proposal);}}
    finally{proposalDecisions.finish(proposal.actionId,saved);if(proposalScopeActive.current)setInteractionLoading(false);}
  };
  const moveScene = async (candidate:InteractionCandidate) => {
    const destinationId=typeof candidate.effects.destinationLocationId==='string'?candidate.effects.destinationLocationId:null;if(!destinationId)return;
    if(interactionLoading)return;setInteractionLoading(true);setError('');
    try{const result=await manageInteraction<{scene:SceneSession;interactions:InteractionCandidate[];destinations:InteractionCandidate[]}>({action:'move',characterInstanceId:character.id,conversationId:conversation.id,sceneId:interactionScene?.id,destinationLocationId:destinationId,requestId:createClientRequestId()});markInteractionSceneHydrated(result.scene);setInteractionScene(result.scene?.id?result.scene:null);applySceneDelta(result.scene);setInteractionCandidates(result.interactions??[]);setMovementCandidates(result.destinations??[]);setCharacterProposal(null);setShowInteractions(false);if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);}catch(caught){setError(caught instanceof Error?caught.message:'That place is no longer available right now.');}finally{setInteractionLoading(false);}
  };
  const addSceneParticipant=async(person:SharedSceneCharacter)=>{
    const sceneId=sharedSceneRoster?.scene?.id;if(!sceneId)return;
    setInteractionLoading(true);setError('');
    try{await manageSharedScene({action:'join',sceneId,characterInstanceId:person.id});const roster=await manageSharedScene<SharedSceneRoster>({action:'available',conversationId:conversation.id});setSharedSceneRoster(roster);}
    catch(caught){setError(caught instanceof Error?caught.message:`${person.together_character_templates.name} is no longer here.`);}
    finally{setInteractionLoading(false);}
  };
  const resolveMilestone = async (action:RelationshipMilestone['choices'][number]['id']) => { if(!milestone||resolvingMilestone)return;setResolvingMilestone(true);setError('');try{const result=await resolveRelationshipMilestone(milestone.id,action);setSnapshot(result.snapshot);if(milestone.kind==='first_date_invitation'&&action==='accept')setFeedback({kind:'moment',title:`${milestone.title} unlocked`,body:'Your shared experience is ready in Dates.'});}catch(caught){setError(caught instanceof Error?caught.message:'That choice could not be saved.');}finally{setResolvingMilestone(false);} };
  const startNewConversation=()=>{setShowConversationMenu(false);setShowFreshChat(true);};
  const toggleMessageSaved=async(message:Message)=>{
    if(message.id.startsWith('local-'))return;
    const favorite=!isMessageFavorite(message),previous=message.user_metadata;
    setMessages((current)=>current.map((item)=>item.id===message.id?{...item,user_metadata:{...(item.user_metadata??{}),favorite}}:item));
    try{const updated=await setMessageFavorite(conversation.id,message.id,favorite);setMessages((current)=>current.map((item)=>item.id===message.id?{...item,...updated}:item));}
    catch(caught){setMessages((current)=>current.map((item)=>item.id===message.id?{...item,user_metadata:previous}:item));setError(caught instanceof Error?caught.message:'That message could not be saved.');}
  };
  const deleteConversation=()=>confirmAction({title:'Delete this conversation?',message:`It will disappear from Messages and conversation history, but you can restore the text from Settings → Archived Chats for 30 days.\n\nUploaded photos are removed immediately and cannot be restored. ${character.together_character_templates.name} will still remember separately saved memories, and your relationship and Moments remain.`,confirmLabel:'Delete conversation',destructive:true,onConfirm:async()=>{try{const archived=await manageConversation<Snapshot['conversations'][number]>({action:'delete',conversationId:conversation.id});setMessages([]);setShowConversationMenu(false);await refresh();const latest=useTogether.getState().snapshot;if(latest)useTogether.getState().setCoreState({conversations:latest.conversations.map((item)=>item.id===archived.id?archived:item)});openMessagesInbox();}catch(caught){setError(caught instanceof Error?caught.message:'The conversation could not be archived.');}}});

  const toggleFavorite=async()=>{if(favoriteBusy)return;const previous=snapshot.favoriteCharacterTemplateIds??[],next=isFavorite?previous.filter((id)=>id!==character.character_template_id):[...new Set([...previous,character.character_template_id])];setFavoriteBusy(true);setCoreState({favoriteCharacterTemplateIds:next});try{const result=await setCharacterFavorite(character.character_template_id,!isFavorite,'chat_menu');setCoreState({favoriteCharacterTemplateIds:result.favoriteCharacterTemplateIds});}catch(caught){setCoreState({favoriteCharacterTemplateIds:previous});setError(caught instanceof Error?caught.message:'That favorite could not be saved.');}finally{setFavoriteBusy(false);}};
  const togglePinned=async()=>{if(pinBusy)return;setPinBusy(true);try{upsertConversation(await setConversationPinned(conversation.id,!isConversationPinned(conversation)));}catch(caught){setError(caught instanceof Error?caught.message:'That chat could not be pinned.');}finally{setPinBusy(false);}};
  const desktopChat=width>=920,messageTypography=chatMessageTypography(conversation,{desktop:desktopChat}),bubbleColors=resolveChatBubbleColors(conversation);
  const photoSharingEntitled=snapshot.entitlements?.entitlement_keys?.includes('photo_sharing')===true;
  const choosePhoto=async(source:'camera'|'library')=>{if(!photoSharingEntitled){setShowPhotoRequests(false);setShowPhotoPaywall(true);return;}try{if(Platform.OS!=='web'){const permission=source==='camera'?await ImagePicker.requestCameraPermissionsAsync():await ImagePicker.requestMediaLibraryPermissionsAsync();if(!permission.granted){setError(source==='camera'?'Camera access is needed to take a photo.':'Photo access is needed to choose a photo.');return;}}const options=userImagePickerOptions(source),result=source==='camera'?await ImagePicker.launchCameraAsync(options):await ImagePicker.launchImageLibraryAsync(options);setShowPhotoRequests(false);if(result.canceled||!result.assets[0])return;const asset=result.assets[0],normalized=await normalizeUserImage({uri:asset.uri,width:asset.width,height:asset.height,fileSize:asset.fileSize,fileName:asset.fileName},.88);cleanupNormalizedImage(pendingImage?.uri);setPendingImage({...normalized,requestId:createClientRequestId()});setPhotoUploadPhase('idle');setError('');composerInput.current?.focus();}catch(caught){setShowPhotoRequests(false);setError(caught instanceof Error?caught.message:'That photo could not be opened.');}};
  const requestSharePhoto=(source:'camera'|'library')=>handlePhotoSharingTap(photoSharingEntitled,{openPicker:()=>void choosePhoto(source),openPaywall:()=>{setShowPhotoRequests(false);setShowPhotoPaywall(true);}});
  const clearPendingImage=()=>{cleanupNormalizedImage(pendingImage?.uri);setPendingImage(null);setPhotoUploadPhase('idle');setError('');};
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
      navigateChatSurface(newGroupPrefillHref({currentParticipantIds:[currentCharacter.id],invitedCharacterId:invited.id,worldId:world.id}));
    }catch(caught){
      setCharacterPreview(null);
      setError(caught instanceof Error?caught.message:`${person.name} could not be invited right now.`);
    }
  };

  return <ChatKeyboardFrame style={styles.screen}>
    <View style={[styles.shell,{minHeight:0},desktopChat&&styles.shellDesktop]}>
      {showLeft ? <ChatConversationRail snapshot={snapshot} activeConversationId={conversation.id} /> : null}
      <View style={[styles.conversation,{minHeight:0},width<720&&styles.conversationWithLocation,Platform.OS==='web'&&width<720&&{paddingBottom:floatingComposerHeight}]}>
        {width<720?<View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.mobileLocationBackground}>
          <Image source={mobileLocationBackground} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" transition={180}/>
          <View style={styles.mobileLocationShade}/>
          <View style={styles.mobileLocationTopShade}/>
          <View style={styles.mobileLocationBottomShade}/>
        </View>:null}
        <ChatAmbientGlow compact={width < 720} />
        {width<720?<MobileChatMediaHeader
          key={conversation.id}
          name={character.together_character_templates.name}
          subtitle={location.trim().toLowerCase()==='home'?'At home':`At ${location}`}
          portraitSource={portraitSource}
          mediaSource={latestHeaderMedia?.signed_url?{uri:latestHeaderMedia.signed_url}:portraitSource}
          hasMedia={Boolean(latestHeaderMedia)}
          onBack={openMessagesInbox}
          onProfile={()=>navigateChatSurface(`/character/${slug}`)}
          onPhoto={()=>{setMediaRequestMode('photo');setShowPhotoRequests(true);}}
          onCall={()=>navigateChatSurface(`/call?character=${character.id}&conversation=${conversation.id}`)}
          onPlace={activePlace?()=>setShowPlaceInfo(true):undefined}
          placeName={activePlace?.name}
          onMenu={()=>setShowConversationMenu((value)=>!value)}
          mediaCount={chatGalleryItems.length}
          onMedia={openChatGallery}
          onFeaturedMedia={latestHeaderMedia?()=>navigateChatSurface(mediaViewerHref(latestHeaderMedia.id,subscriptionReturnTo)):undefined}
        />:<ChatHeader character={character} location={location} mediaCount={chatGalleryItems.length} onBack={openMessagesInbox} onMedia={openChatGallery} onCall={()=>navigateChatSurface(`/call?character=${character.id}&conversation=${conversation.id}`)} onMenu={()=>setShowConversationMenu((value)=>!value)} />}
        <ConnectionBanner sendFailed={messages.some((item)=>item.delivery_status==='failed')} sendScoped={showSendConnectionNotice}/>
        {!showRight&&width>=720?<MobileChatContextCard identityKey={conversation.id} name={character.together_character_templates.name} location={chatContext.scene.location} activity={chatContext.scene.activity} next={chatContext.nextCommitment?{title:chatContext.nextCommitment.title,detail:new Date(chatContext.nextCommitment.startsAt).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'}),onPress:chatContext.nextCommitment.kind==='plan'?()=>navigateChatSurface(`/plan/${chatContext.nextCommitment!.id}`):undefined}:null} memoryCount={snapshot.memoryCounts?.[character.id]??snapshot.memories.filter((item)=>item.character_instance_id===character.id).length} memoryLocked={snapshot.entitlements?.entitlement_keys?.includes('memory_inspector')!==true} onMemory={()=>navigateChatSurface(`/memories?character=${slug}`)} onPlan={activeSharedPlan?undefined:openPlanPicker}/>:null}
        {showFreshChat && session?.user.id ? <FreshChatConfirmation key={`${session.user.id}:${conversation.id}`} userId={session.user.id} characterInstanceId={character.id} conversationId={conversation.id} name={character.together_character_templates.name} onClose={()=>setShowFreshChat(false)} onComplete={()=>{setShowFreshChat(false);void refresh();}} /> : null}
        {showConversationMenu ? <ConversationOverflowMenu
          scheduleControl={<SchedulePauseControl character={character} conversation={conversation} compact/>}
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
          onDetails={()=>{setShowConversationMenu(false);navigateChatSurface(`/character/${slug}`);}}
          onMemory={()=>{setShowConversationMenu(false);navigateChatSurface(`/memories?character=${slug}`);}}
          onBlueprint={canPreviewCharacterBlueprint(session?.user.id)?()=>{setShowConversationMenu(false);navigateChatSurface(`/memories?character=${slug}&blueprint=1`);}:undefined}
          onHistory={()=>{setShowConversationMenu(false);navigateChatSurface(`/conversations/${character.id}`);}}
          onCreatePlan={()=>{openPlanPicker();setShowConversationMenu(false);}}
          onChangePlan={()=>{if(activeSharedPlan)openPlanPicker();setShowConversationMenu(false);}}
          onEndPlan={()=>{setShowConversationMenu(false);if(activeSharedPlan)requestEndPlan(activeSharedPlan);}}
          onSettings={()=>{setShowConversationMenu(false);setShowChatSettings(true);}}
          onFresh={startNewConversation}
          onAdvanced={()=>{setShowConversationMenu(false);navigateChatSurface(`/conversation-controls?character=${encodeURIComponent(character.id)}`);}}
          onDelete={deleteConversation}
        /> : null}
        <ChatSettingsModal visible={showChatSettings} conversation={conversation} character={character} onClose={()=>setShowChatSettings(false)} />
        <ChatMediaGalleryModal visible={showChatMedia} items={chatGalleryItems} generatedMedia={galleryGeneratedMedia} companionName={character.together_character_templates.name} returnTo={subscriptionReturnTo} loading={galleryLoading} error={galleryError} onRetry={()=>void loadChatGallery()} onClose={()=>setShowChatMedia(false)}/>
        <ChatPlaceInfoModal
          visible={showPlaceInfo&&Boolean(activePlace)}
          name={activePlace?.name??location}
          worldName={activePlaceWorld?.name}
          category={activePlace?.category}
          description={activePlace?.canonical_lore?.summary??activePlace?.description??chatContext.scene.summary}
          activity={chatContext.scene.activity}
          activities={activePlace?.possible_activities??[]}
          source={mobileLocationBackground}
          onClose={()=>setShowPlaceInfo(false)}
          onOpen={activePlaceHref?()=>{setShowPlaceInfo(false);navigateChatSurface(activePlaceHref);}:undefined}
        />
        <CharacterProfilePreviewModal companion={characterPreview} onClose={()=>setCharacterPreview(null)} onViewProfile={(person)=>{setCharacterPreview(null);navigateChatSurface(`/character/${person.slug}`);}} onInviteToGroup={invitePreviewToGroup} />
        <VoiceNotePurchaseModal visible={Boolean(voiceNotePrompt)} name={voiceNotePrompt?.name??character.together_character_templates.name} creditCost={voiceNotePrompt?.creditCost??0} creditBalance={voiceNotePrompt?.creditBalance??0} shortened={voiceNotePrompt?.shortened} busy={voiceNotePromptBusy} onClose={()=>finishVoiceNotePrompt(null)} onConfirm={(hideFuture)=>finishVoiceNotePrompt({hideFuture})} onBuyCredits={()=>{finishVoiceNotePrompt(null);navigateChatSurface(creditsSubscriptionHref);}}/>
        <MediaRequestModal visible={showPhotoRequests} mode={mediaRequestMode} character={character} conversationId={conversation.id} onPhotoRequest={(request,options)=>{setShowPhotoRequests(false);void send(request,undefined,undefined,undefined,false,options?.messagePresentation);}} photoSharingEntitled={photoSharingEntitled} onShareLibrary={()=>void requestSharePhoto('library')} onTakePhoto={Platform.OS==='web'?undefined:()=>void requestSharePhoto('camera')} onPhotoSharingUpgrade={()=>{setShowPhotoRequests(false);setShowPhotoPaywall(true);}} onVideoCreated={(media)=>{upsertMedia(media);setReconcilingMediaId(media.id);setShowPhotoRequests(false);navigateChatSurface(mediaViewerHref(media.id,subscriptionReturnTo));}} onBuyCredits={()=>{setShowPhotoRequests(false);navigateChatSurface(creditsSubscriptionHref);}} onClose={()=>setShowPhotoRequests(false)}/>
        <PhotoSharingPaywallModal visible={showPhotoPaywall} onClose={()=>setShowPhotoPaywall(false)} onUpgrade={()=>{setShowPhotoPaywall(false);navigateChatSurface(photoSharingSubscriptionHref);}}/>
        <AutoDialogueOptionsModal visible={showAutoDialogueOptions} name={character.together_character_templates.name} hasSuggestion={Boolean(autoDialogue)} onChoose={(preference)=>void requestAutoDialogue(preference)} onClose={()=>setShowAutoDialogueOptions(false)}/>
        <PlanDetailsModal visible={Boolean(planModal)} planId={planModal?.planId??null} confirmCancel={planModal?.confirmCancel} onStarted={applyStartedPlan} onClose={()=>setPlanModal(null)}/>
        <EndPlanConfirmation visible={Boolean(planEndTarget)} plan={planEndTarget} busy={Boolean(planEndTarget&&planActionBusyId===planEndTarget.id)} onClose={()=>{if(!planActionBusyId)setPlanEndTarget(null);}} onConfirm={()=>void confirmEndPlan()}/>
        {showPlans ? <ScrollView style={styles.planScroll} contentContainerStyle={styles.planScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <PlanSelection snapshot={snapshot} character={character} scopedLocationId={resolveScopedLocation(snapshot,params.location,params.world,pendingActions.find((item)=>item.id===pendingActionId),params.repeatPlanId)} currentLocationId={chatContext.scene.locationId} initialActivityKey={params.activity} repeatPlanId={params.repeatPlanId} proposal={pendingActions.find((item)=>item.id===pendingActionId)} initialTimingChoice={switchPlanId?'now':initialPlanTimingChoice??undefined} mode={switchPlanId?'switch':'create'} currentPlan={switchPlanId?(snapshot.sharedPlans??[]).find((item)=>item.id===switchPlanId)??null:null} interests={[...(snapshot.profile?.interests??[]),...snapshot.memories.filter((item)=>item.character_instance_id===character.id&&item.memory_type==='preference').map((item)=>item.canonical_text)]} busy={planning} error={error} onPlan={(option,timing) => void plan(option,timing)} onClose={() => {setShowPlans(false);setPendingActionId(null);setSwitchPlanId(null);setInitialPlanTimingChoice(null);router.setParams({plan:undefined,location:undefined,world:undefined,activity:undefined,switchPlanId:undefined});}} />
        </ScrollView> : <VirtualizedConversationList
          timelineKey={conversation.id}
          ready={conversationReady}
          listRef={scroll}
          latestScrollerRef={latestConversationScroller}
          style={[styles.messageScroll,{minHeight:0}]}
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
          {!conversationReady?(historyLoadFailed?<ConversationHistoryFailure onRetry={()=>{setError('');history.retry();}}/>:<ConversationTimelineSkeleton label={`Loading conversation with ${character.together_character_templates.name}`}/>):null}
          {conversationReady&&(loadingOlder?<Text style={styles.olderLoading}>Loading earlier messages…</Text>:!hasMore&&visibleMessages.length?<Text style={styles.historyStart}>Beginning of this conversation</Text>:null)}
          {conversationReady?<SceneCard character={character} context={chatContext} snapshot={snapshot} roster={sharedSceneRoster} />:null}
          {conversationReady&&isCoPresent&&sharedSceneRoster?.availableCharacters.length?<SharedSceneInvite people={sharedSceneRoster.availableCharacters} busy={interactionLoading} onJoin={(person)=>void addSceneParticipant(person)}/>:null}
          {conversationReady&&visibleMessages.length===0?<EmptyConversation character={character} prompts={prompts} onPrompt={stageManualInput} />:null}
          {conversationReady&&mergeChatTimeline(visibleMessages,pendingActions,(snapshot.conversationEvents??[]).filter((event)=>event.conversation_id===conversation.id&&shouldShowPlanTimelineEvent(event)),unreadWindow.current.lastReadAt,unreadWindow.current.openedAt,seamlessCompletionIds.current,pendingSceneAction).map((item,index,timeline)=>item.kind==='separator'?<Text key={item.key} style={[styles.day,item.label==='NEW'&&{color:colors.rose}]}>{item.label}</Text>:item.kind==='scene_action'?<SceneActionDivider key={`scene-action-${item.value.id}`} event={item.value} companionName={character.together_character_templates.name}/>:item.kind==='message'?<MessageBubble canBranch={conversationReady&&canOfferChatBranch({conversationKind:conversation.kind,isBranch:Boolean(branchSourceLifeId),latestAssistantMessageId:latestAssistantMessage?.id??null,candidateMessageId:item.value.id,candidateIsPrefix:Boolean(item.value.provider_metadata?.branchPrefix),replyPending,pendingImage:Boolean(pendingImage),branching})} branchLocked={!subscriberCanBranch} onBranch={()=>branchFromLatest(item.value)} canSpice={messageRewrite.available(item.value)&&!item.value.provider_metadata?.branchPrefix} onSpice={()=>messageRewrite.spice(item.value)} onRestore={()=>messageRewrite.restore(item.value)} key={item.value.id} desktop={desktopChat} online={online} message={item.value} character={character} mentionCharacters={mentionCharacters} onCharacterMention={setCharacterPreview} media={generatedMedia.filter((media)=>media.message_id===item.value.id)} photoOffer={photoOfferForMessage(mediaOffers,item.value.id)} photoPreviewSource={mediaOfferPreviewSource} photoOfferBusy={mediaOfferActionBusy(mediaOfferBusy,photoOfferForMessage(mediaOffers,item.value.id),mediaRetryBusyId)} grouped={index>0&&timeline[index-1]?.kind==='message'&&shouldGroupChatMessages((timeline[index-1] as {kind:'message';value:Message}).value,item.value)} textStyle={messageTypography} bubbleColors={bubbleColors} reactionNames={sharedSceneReactionNames} voiceVisible={snapshot.profile?.multimodal_preferences?.companionVoiceNotes!==false} voiceEnabled={snapshot.experienceCapabilities?.voiceNotes!==false} memoryManualControl={snapshot.entitlements?.entitlement_keys?.includes('memory_manual_control')===true} favorite={isMessageFavorite(item.value)} canContinue={canContinueMessage(item.value,visibleMessages)&&!replyPending&&!pendingImage} onFavorite={()=>toggleMessageSaved(item.value)} onContinue={()=>send('Continue.',undefined,undefined,{messageAction:'continue',anchorMessageId:item.value.id})} onSuggest={()=>requestAutoDialogue()} onPlan={openPlanPicker} onPhoto={()=>setShowPhotoRequests(true)} seamlessCompletion={seamlessCompletionIds.current.has(item.value.id)} activeVoiceNoteId={activeVoiceNoteId} onVoiceActivate={setActiveVoiceNoteId} onVoiceRequest={requestVoiceWithConfirmation} onRemember={async(messageId)=>{try{await rememberMessage(messageId,character.id);await refresh();setMemorySavedNotice({id:Date.now(),name:character.together_character_templates.name});}catch(caught){Alert.alert('Could not remember that',caught instanceof Error?caught.message:'Please try again.');}}} onDeletePhoto={deleteSharedPhoto} onPhotoOfferAccept={(offer,paymentMethod)=>void acceptOffer(offer,paymentMethod)} onPhotoOfferDecline={(offer)=>void declineOffer(offer)} onMediaRetry={retryGeneratedMedia} onFailedRetry={item.value.delivery_status==='failed'?()=>void send(item.value.content,item.value.client_request_id??undefined,item.value.id):undefined} onFailedEdit={item.value.delivery_status==='failed'?()=>{setMessages((current)=>current.filter((message)=>message.id!==item.value.id));stageManualInput(item.value.content);setError('');}:undefined} onFailedDiscard={item.value.delivery_status==='failed'?()=>{setMessages((current)=>current.filter((message)=>message.id!==item.value.id));if(currentInput.current.trim()===item.value.content.trim()){setInput('');currentInput.current='';}setError('');}:undefined}/>:item.kind==='voice_call'?<VoiceCallEventRow key={item.value.id} value={item.value}/>:item.kind==='action'?<ConversationActionCard key={item.value.id} action={item.value} scope={chatScope} busy={planning} onConfirm={(planId)=>void confirmPlanSuggestion(item.value,planId)} onChange={()=>{setPendingActionId(item.value.id);setSwitchPlanId(null);setShowPlans(true);}} onDismiss={()=>void dismissPlanSuggestion(item.value)}/>:isPlanLifecycleDividerEvent(item.value)?<PlanLifecycleDivider key={item.value.id} event={item.value} companionName={character.together_character_templates.name}/>:<PlanTimelineCard key={item.value.id} event={item.value} plan={(snapshot.sharedPlans??[]).find((plan)=>plan.id===item.value.entity_id)} locationName={snapshot.locations.find((location)=>location.id===(snapshot.sharedPlans??[]).find((plan)=>plan.id===item.value.entity_id)?.location_id)?.name} busy={planActionBusyId===item.value.entity_id||planning} onOpen={(plan)=>setPlanModal({planId:plan.id})} onStart={(plan)=>void startTimelinePlan(plan)} onEnd={requestEndPlan} onCancel={(plan)=>setPlanModal({planId:plan.id,confirmCancel:true})}/>) }
          {conversationReady?orphanMediaOffers.map((offer)=><ChatPhotoRequestCard key={offer.id} offer={offer} media={generatedMedia.find((item)=>item.id===offer.generated_media_id)} previewSource={mediaOfferPreviewSource} busy={mediaOfferActionBusy(mediaOfferBusy,offer,mediaRetryBusyId)} onAccept={(paymentMethod)=>void acceptOffer(offer,paymentMethod)} onDecline={()=>void declineOffer(offer)} onBuyCredits={()=>navigateChatSurface(creditsSubscriptionHref)} onRetry={offer.generated_media_id?()=>void retryGeneratedMedia(String(offer.generated_media_id)):undefined}/>):null}
          {conversationReady&&awaitingPhotoOffer&&optimisticPhotoRequest?<ChatPhotoRequestCard offer={optimisticPhotoRequest.offer} previewSource={mediaOfferPreviewSource} preparing busy={false} onAccept={(paymentMethod)=>decideOptimisticPhotoOffer('accept',paymentMethod)} onDecline={()=>decideOptimisticPhotoOffer('decline')} onBuyCredits={()=>navigateChatSurface(creditsSubscriptionHref)}/>:null}
          {conversationReady&&stream ? <StreamingBubble desktop={desktopChat} character={character} content={stream} textStyle={messageTypography} bubbleColor={bubbleColors.companion} reserveVoiceControl={snapshot.profile?.multimodal_preferences?.companionVoiceNotes!==false} /> : null}
          {conversationReady&&replyPending && !stream && !awaitingPhotoOffer && pendingDialogue?.showTyping!==false ? <ChatTypingIndicator name={character.together_character_templates.name} /> : null}
          {conversationReady&&milestone ? <RelationshipMomentCard milestone={milestone} busy={resolvingMilestone} onChoose={(action)=>void resolveMilestone(action)} /> : null}
          {conversationReady&&characterProposal&&!proposalDecisions.isHidden(characterProposal.actionId)?<CharacterProposalCard name={character.together_character_templates.name} proposal={characterProposal} busy={interactionLoading} onAccept={()=>void acceptCharacterProposal()} onDismiss={()=>void dismissCharacterProposal()}/>:null}
          {conversationReady&&feedback ? <StoryFeedback feedback={feedback} onView={() => navigateChatSurface(feedback.kind === 'memory' ? '/memories' : feedback.kind==='plan'? '/dates':'/moments')} onUndo={feedback.kind === 'memory' ? () => void undoMemory() : undefined} onDismiss={() => setFeedback(null)} /> : null}
          {blockedPhoto ? <View accessibilityRole="alert" style={styles.retry}><Text style={styles.retryText}>{blockedPhoto.message}</Text><View style={{flexDirection:'row',gap:24,paddingTop:12}}><Pressable accessibilityRole="button" onPress={()=>{setInput(blockedPhoto.text);currentInput.current=blockedPhoto.text;setBlockedPhoto(null);composerInput.current?.focus();}}><Text style={styles.retryText}>Edit request</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>setBlockedPhoto(null)}><Text style={styles.retryText}>Dismiss</Text></Pressable></View></View> : null}
          {error&&!blockedPhoto&&!historyLoadFailed ? <ChatRecoveryNotice error={error} onDismiss={()=>setError('')} onRetry={photoUploadPhase==='blocked'?undefined:pendingSceneAction ? ()=>void generateSceneReaction(pendingSceneAction.id) : visibleMessages.some(item=>item.delivery_status==='failed') ? ()=>{const failed=[...visibleMessages].reverse().find(item=>item.delivery_status==='failed');if(failed)void send(failed.content,failed.client_request_id??undefined,failed.id);} : undefined} /> : null}
        </VirtualizedConversationList>}
        <JumpToLatestButton visible={!showPlans&&showJumpToLatest} bottom={width<720?floatingComposerHeight+12:92} onPress={jumpToLatest}/>
        {showInteractions?<InteractionTray name={character.together_character_templates.name} location={location} loading={interactionLoading||replyPending} interactions={interactionCandidates} destinations={movementCandidates} onInteraction={(candidate)=>void executeInteraction(candidate)} onMove={(candidate)=>void moveScene(candidate)} onClose={()=>setShowInteractions(false)} />:isCoPresent&&interactionCandidates.length&&shouldShowPlanInteractionTray({activePlanId:activeSharedPlan?.id,dismissedPlanId:dismissedInteractionPlanId,preferenceReady:interactionTrayPreferenceReady})?<ContextualInteractionTray loading={interactionLoading||replyPending} interactions={interactionCandidates.slice(0,3)} onOpen={()=>setShowInteractions(true)} onInteraction={(candidate)=>void executeInteraction(candidate)} onDismiss={activeSharedPlan?dismissPlanInteractionTray:undefined} />:null}
        {conversation?<><ScenarioConversationBanner conversationId={conversation.id} scope={snapshot.activeContinuity?.id??''}/>{conversation.metadata?.worldPulseOccurrenceId?<WorldPulseConversationBanner conversationId={conversation.id} continuityId={snapshot.activeContinuity?.id??''}/>:null}</>:null}
        {branchSourceLifeId&&branchSourceConversationId&&snapshot.continuities?.some((life)=>life.id===branchSourceLifeId)?<Pressable accessibilityRole="button" accessibilityLabel="Return to original conversation" disabled={branching} onPress={()=>void returnToOriginal()} style={{marginHorizontal:18,marginBottom:8,paddingVertical:10,paddingHorizontal:14,borderRadius:16,borderWidth:1,borderColor:'rgba(193,125,231,.42)',backgroundColor:'rgba(33,21,41,.88)',flexDirection:'row',alignItems:'center',gap:8}}><GitBranch size={16} color={colors.rose}/><Text style={{color:colors.text,flex:1,fontSize:13,fontWeight:'600'}}>Alternate path · Return to original</Text><ChevronRight size={15} color={colors.textSecondary}/></Pressable>:null}
        {alternatePaths.length?<Pressable accessibilityRole="button" accessibilityLabel={alternatePaths.length===1?'Open alternate path':`View ${alternatePaths.length} alternate paths`} disabled={branching} onPress={()=>{const only=alternatePaths.length===1?alternatePaths[0]:null;const chatId=only&&typeof only.metadata?.branchConversationId==='string'?only.metadata.branchConversationId:null;if(only&&chatId)void openAlternatePath(only.id,chatId);else navigateChatSurface('/personas');}} style={{marginHorizontal:18,marginBottom:8,paddingVertical:9,paddingHorizontal:14,borderRadius:15,borderWidth:1,borderColor:'rgba(193,125,231,.32)',backgroundColor:'rgba(33,21,41,.78)',flexDirection:'row',alignItems:'center',gap:8}}><GitBranch size={15} color={colors.rose}/><Text style={{color:colors.text,flex:1,fontSize:12,fontWeight:'600'}}>{alternatePaths.length===1?'Open alternate path':`View ${alternatePaths.length} alternate paths`}</Text><ChevronRight size={15} color={colors.textSecondary}/></Pressable>:null}
        {!activeSharedPlan&&joinableSharedPlan?<PlanJoinBar plan={joinableSharedPlan} locationName={snapshot.locations.find((item)=>item.id===joinableSharedPlan.location_id)?.name} busy={planActionBusyId===joinableSharedPlan.id||planning} onJoin={()=>void startTimelinePlan(joinableSharedPlan)} onDetails={()=>setPlanModal({planId:joinableSharedPlan.id})}/>:null}
        {focusPlanId&&focusPlanId!==activeSharedPlan?.id?<PlanFocusChip plan={(snapshot.sharedPlans??[]).find((item)=>item.id===focusPlanId)} onOpen={(id)=>navigateChatSurface(`/plan/${id}`)} onClose={()=>{setFocusPlanId(null);setFocusDismissed(true);}}/>:null}
        {memorySavedNotice?<MemorySavedToast key={memorySavedNotice.id} name={memorySavedNotice.name} onDismiss={()=>setMemorySavedNotice(null)}/>:null}
        <ContextCostConfirmation pricing={contextPricing}/><DailyMessageAllowanceNotice allowance={snapshot.dailyMessageAllowance} onUpgrade={()=>navigateChatSurface(subscriptionHref({intent:'plans',returnTo:subscriptionReturnTo}))}/><Composer compact={width<720} desktop={desktopChat} inputRef={composerInput} conversationId={conversation.id} character={character} input={input} onChangeInput={changeComposerInput} onDictation={(text)=>stageManualInput(mergeDictationTranscript(currentInput.current,text))} onDictationError={setError} onDictationStart={()=>setActiveVoiceNoteId(null)} pendingImage={pendingImage} photoUploadPhase={photoUploadPhase} onAddPhoto={()=>void requestSharePhoto('library')} onRemovePhoto={clearPendingImage} sending={replyPending||!conversationReady||contextPricing.blocked||dailyMessageExhausted} onSend={() => void send()} onMoment={(mode)=>{setMediaRequestMode(mode);setShowPhotoRequests(true);}} autoDialogue={autoDialogue} autoDialogueBusy={autoDialogueBusy} canSuggest={Boolean(conversationReady&&latestAssistantMessage&&!replyPending&&!pendingImage)} onSuggest={()=>void requestAutoDialogue()} onSuggestOptions={openAutoDialogueOptions} onClearSuggestion={clearAutoDialogue} onFocus={onMobileComposerFocus} onLayout={(event)=>{if(Platform.OS==='web'&&width<720){const next=Math.ceil(event.nativeEvent.layout.height);setFloatingComposerHeight((current)=>current===next?current:next);if(document.activeElement?.id==='chat-message-composer')pinLatestForMobileKeyboard();}const requestId=activeBottomPinRequest.current;if(requestId)settleSentMessageAtBottom(requestId);}} />
      </View>
      {showRight ? <ContextRail snapshot={snapshot} character={character} context={chatContext} activePlan={activeSharedPlan} onPrompt={stageManualInput} onPlan={openPlanPicker} /> : null}
    </View>
  </ChatKeyboardFrame>;
}

function ContextRail({snapshot,character,context,activePlan,onPrompt,onPlan}:{snapshot:Snapshot;character:CharacterInstance;context:ClientConversationContext;activePlan:SharedPlan|null;onPrompt:(value:string)=>void;onPlan:()=>void}) {
  const memories=snapshot.memories.filter((item)=>item.character_instance_id===character.id).slice(0,3),memoryInspector=snapshot.entitlements?.entitlement_keys?.includes('memory_inspector')===true,memoryCount=snapshot.memoryCounts?.[character.id]??memories.length;
  const locationId=context.scene.locationId??character.current_location_id,location=snapshot.locations.find((item)=>item.id===locationId),world=location?worldForLocation(snapshot,location.id):undefined;
  const characterRouteKey=character.together_character_templates.public_handle??character.together_character_templates.slug??character.id;
  const locationHref=location?conversationLocationHref(location.slug,{worldSlug:world?.slug,character:characterRouteKey}):null;
  const placeSource=sceneVisualSource(snapshot,character,context),category=location?.category?.replace(/[_-]+/g,' ');
  const placeHero=<View style={styles.contextPlaceHero}><Image source={placeSource} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center"/><View style={styles.contextPlaceShade}/><View style={styles.contextPlaceCopy}><Text style={styles.contextPlaceKicker}>{[world?.name,category].filter(Boolean).join(' · ').toUpperCase()}</Text><Text style={styles.contextPlaceName}>{context.scene.location}</Text><Text numberOfLines={2} style={styles.contextPlaceActivity}>{context.scene.activity}</Text>{locationHref?<View style={styles.contextPlaceAction}><MapPin size={13} color="#fff"/><Text style={styles.contextPlaceActionText}>View place</Text></View>:null}</View></View>;
  return <ScrollView style={styles.rightRail} contentContainerStyle={styles.rightContent}>{locationHref?<Pressable accessibilityRole="link" accessibilityLabel={`Open ${context.scene.location}`} onPress={()=>navigateChatSurface(locationHref)} style={({pressed})=>[styles.contextPlaceLink,pressed&&styles.contextLocationLinkPressed]}>{placeHero}</Pressable>:placeHero}{context.nextCommitment?<ContextSection title="NEXT TOGETHER"><Pressable onPress={()=>context.nextCommitment?.kind==='plan'&&navigateChatSurface(`/plan/${context.nextCommitment.id}`)}><ContextLine icon={<CalendarDays size={15} color={colors.rose}/>} title={context.nextCommitment.title} body={`${new Date(context.nextCommitment.startsAt).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'})}${context.nextCommitment.location?` · ${context.nextCommitment.location}`:''}`}/></Pressable></ContextSection>:null}{context.story?<ContextSection title="CURRENT STORY"><ContextLine icon={<Sparkles size={15} color={colors.violet}/>} title={context.story.title} body={context.story.chapter}/></ContextSection>:null}{context.thread?<Pressable onPress={()=>onPrompt(context.thread!.prompt)} style={styles.threadCard}><CalendarDays size={16} color={colors.rose}/><View style={{flex:1}}><Text style={[styles.threadTitle,styles.desktopThreadTitle]}>FOLLOW UP</Text><Text style={[styles.contextCopy,styles.desktopContextCopy]}>{context.thread.label}</Text></View><ChevronRight size={16} color={colors.muted}/></Pressable>:null}<ContextSection title={`WHAT ${character.together_character_templates.name.toUpperCase()} REMEMBERS`}>{memoryInspector?(memories.length?memories.map((memory)=><Pressable key={memory.id} onPress={()=>navigateChatSurface(`/memories?character=${character.together_character_templates.slug}`)} style={styles.memoryLine}><Brain size={14} color={memory.pinned?colors.rose:colors.violet}/><Text style={[styles.contextCopy,styles.desktopContextCopy]} numberOfLines={2}>{presentMemoryText(memory.canonical_text,character.together_character_templates.name)}</Text></Pressable>):<Text style={[styles.contextMuted,styles.desktopContextCopy]}>Meaningful details will collect here.</Text>):<Pressable onPress={()=>navigateChatSurface(`/memories?character=${character.together_character_templates.slug}`)} style={styles.memoryLine}><LockKeyhole size={14} color={colors.violet}/><Text style={[styles.contextCopy,styles.desktopContextCopy]}>{memoryCount} saved {memoryCount===1?'detail':'details'} · Kivelle+</Text></Pressable>}</ContextSection>{!activePlan?<Pressable onPress={onPlan} style={styles.planButton}><CalendarDays size={17} color="#fff"/><Text style={[styles.planButtonText,styles.desktopContextButtonText]}>Plan something</Text></Pressable>:null}<Pressable onPress={()=>navigateChatSurface(`/memories?character=${character.together_character_templates.slug}`)} style={styles.secondaryButton}>{memoryInspector?<Brain size={17} color={colors.rose}/>:<LockKeyhole size={17} color={colors.rose}/>}<Text style={[styles.secondaryButtonText,styles.desktopContextButtonText]}>{memoryInspector?'Memory Center':'Memory Center · Kivelle+'}</Text></Pressable></ScrollView>;
}

function sceneVisualSource(snapshot:Snapshot,character:CharacterInstance,context:ClientConversationContext):ImageSource{
  const location=snapshot.locations.find((item)=>item.id&&(context.scene.locationId??character.current_location_id)===item.id);
  const world=location?worldForLocation(snapshot,location.id):characterResidentWorld(snapshot,character);
  return locationImageSource(world?.slug,location,{sceneMediaUrl:context.scene.mediaUrl});
}

function SceneCard({character,context,snapshot,roster}:{character:CharacterInstance;context:ClientConversationContext;snapshot:Snapshot;roster:SharedSceneRoster|null}) { const source=sceneVisualSource(snapshot,character,context);const participantCharacters=(roster?.participants??[]).map((participant)=>participant.together_character_instances).filter((person):person is SharedSceneCharacter=>Boolean(person)).filter((person,index,all)=>all.findIndex((item)=>item.id===person.id)===index);const people=participantCharacters.length?participantCharacters:[{id:character.id,together_character_templates:{name:character.together_character_templates.name,slug:character.together_character_templates.slug}}];const peopleLabel=people.length>1?people.map((person)=>person.together_character_templates.name).join(' · '):`${character.together_character_templates.name} · ${character.current_mood}`;return <View style={[styles.scene,context.interactionMode==='co_present'&&{borderColor:colors.rose}]}><Image source={source} style={StyleSheet.absoluteFill} contentFit="cover"/><View style={styles.sceneShade}><View style={styles.sceneTop}><Text style={styles.sceneKicker}>{context.interactionMode==='co_present'?'TOGETHER NOW':`${character.together_character_templates.name.toUpperCase()} RIGHT NOW`}</Text><Text style={styles.sceneTime}>{context.scene.localTime}</Text></View><Text style={styles.sceneTitle}>{context.scene.location}</Text><Text style={styles.sceneCopy}>{context.scene.summary}</Text><View style={styles.scenePeople}><View style={styles.sceneAvatarStack}>{people.slice(0,3).map((person,index)=><View key={person.id} style={[styles.sceneStackedAvatar,index>0&&styles.sceneStackedAvatarOverlap]}><CharacterAvatar slug={person.together_character_templates.slug} name={person.together_character_templates.name} size={28}/></View>)}</View><Text style={styles.scenePeopleText}>{peopleLabel}</Text></View></View></View>; }

function SharedSceneInvite({people,busy,onJoin}:{people:SharedSceneCharacter[];busy:boolean;onJoin:(person:SharedSceneCharacter)=>void}){return <View style={styles.sharedSceneInvite}><View style={{flex:1,minWidth:0}}><Text style={styles.sharedSceneInviteKicker}>ALSO HERE</Text><Text numberOfLines={2} style={styles.sharedSceneInviteText}>{people.map((person)=>person.together_character_templates.name).join(' and ')} {people.length===1?'is':'are'} nearby.</Text></View>{people.slice(0,2).map((person)=><Pressable key={person.id} disabled={busy} accessibilityLabel={`Invite ${person.together_character_templates.name} into this scene`} onPress={()=>onJoin(person)} style={[styles.sharedSceneInviteButton,busy&&styles.sendDisabled]}><Text style={styles.sharedSceneInviteButtonText}>Join {person.together_character_templates.name}</Text></Pressable>)}</View>}
function sceneActivityLabel(scene:SceneSession){const key=String(scene.state?.currentActivityKey??scene.activity_key??'together').replace(/[_-]+/g,' ').trim();return key&&key!=='together'?key.replace(/^./,(character)=>character.toUpperCase()):'Spending time together';}

function ConversationActionCard({action,scope,busy,onConfirm,onChange,onDismiss}:{action:ConversationAction;scope:ChatRequestScope;busy:boolean;onConfirm:(planId?:string)=>void;onChange:()=>void;onDismiss:()=>void}){
  if(action.payload.trigger==='assistant_location_mention')return <LocationMentionPlanCard action={action} scope={scope} busy={busy} onDismiss={onDismiss}/>;
  const cancel=['plan_cancel','cancel_plan'].includes(action.candidate_type),reschedule=['plan_reschedule','reschedule_plan'].includes(action.candidate_type),options=Array.isArray(action.payload.options)?action.payload.options as Array<Record<string,unknown>>:[];
  const title=String(action.payload.proposedTitle??action.payload.title??(cancel?'Cancel this plan?':reschedule?'Change this plan?':'Make this a real plan?')),rawStarts=action.payload.proposedStartsAt??action.payload.startsAt,starts=rawStarts&&new Date(String(rawStarts)).getTime()>=Date.now()+10*60000?rawStarts:null,locationLabel=action.payload.proposedLocation?String(action.payload.proposedLocation):action.payload.location?String(action.payload.location):'';
  const detail=starts?`${new Date(String(starts)).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}${locationLabel?` · ${locationLabel}`:''}`:'Choose the time before anything is saved.';
  return <View style={styles.actionCard}><View style={styles.actionIcon}><CalendarDays size={18} color={colors.rose}/></View><View style={{flex:1}}><Text style={styles.actionKicker}>{cancel?'CANCEL PLAN':reschedule?'CHANGE PLAN':'MAKE A PLAN'}</Text><Text style={styles.actionTitle}>{options.length?'Which plan?':title}</Text>{options.length?options.map((option)=><Pressable key={String(option.planId)} disabled={busy} onPress={()=>onConfirm(String(option.planId))} style={styles.planTarget}><Text style={styles.planOptionTitle}>{String(option.title)}</Text><Text style={styles.contextMuted}>{new Date(String(option.startsAt)).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'})} · {String(option.location??'City Life')}</Text></Pressable>):<Text style={styles.contextMuted}>{detail}</Text>}{!options.length?<View style={styles.actionButtons}><Pressable disabled={busy} onPress={()=>onConfirm()} style={styles.actionPrimary}><Text style={styles.actionPrimaryText}>{busy?'Working…':cancel?'Cancel plan':starts?(reschedule?'Save change':'Save plan'):'Choose time'}</Text></Pressable>{!cancel?<Pressable disabled={busy} onPress={onChange} style={styles.actionSecondary}><Text style={styles.actionSecondaryText}>Change</Text></Pressable>:null}<Pressable disabled={busy} onPress={onDismiss} style={styles.actionSecondary}><Text style={styles.actionSecondaryText}>Not now</Text></Pressable></View>:null}</View></View>;
}

function LocationMentionPlanCard({action,scope,busy,onDismiss}:{action:ConversationAction;scope:ChatRequestScope;busy:boolean;onDismiss:()=>void}){
  const defaults=defaultPlanTimeFields();
  const[customOpen,setCustomOpen]=useState(false),[dateValue,setDateValue]=useState(defaults.date),[timeValue,setTimeValue]=useState(defaults.time),[saving,setSaving]=useState(false),[localError,setLocalError]=useState('');
  const{refresh,removeConversationAction,snapshot}=useTogether();
  const location=String(action.payload.location??'that place'),locationSlug=typeof action.payload.locationSlug==='string'?action.payload.locationSlug:undefined,worldSlug=typeof action.payload.worldSlug==='string'?action.payload.worldSlug:undefined,disabled=busy||saving;
  const save=async(timingChoice:'now'|'in_one_hour'|'custom',startsAt?:string)=>{
    const request=scope.start('plan-mutation');
    if(!request)return;
    setSaving(true);setLocalError('');
    try{
      const result=await confirmConversationAction<ConversationActionMutation>(action.id,{timingChoice,...(startsAt?{startsAt}:{})});
      if(!request.isCurrent())return;
      removeConversationAction(action.id);
      if(timingChoice==='now'&&result.result?.kind==='date'&&result.result.commitment.id)navigateChatSurface(`/date/${result.result.commitment.id}`);
      void refresh().catch(()=>undefined);
      if(Platform.OS!=='web')void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }catch(caught){if(request.isCurrent())setLocalError(caught instanceof Error?caught.message:'That plan could not be saved.');}
    finally{if(request.isCurrent())setSaving(false);request.release();}
  };
  const saveCustom=()=>{const value=parseCustomPlanTime(dateValue,timeValue);if(!value||value.getTime()<Date.now()+10*60000){setLocalError('Choose a time at least 10 minutes from now.');return;}void save('custom',value.toISOString());};
  return <View style={styles.locationPlanCard}>
    <View style={styles.locationPlanHero}><Image source={locationImageSource(worldSlug,snapshot?.locations.find((place)=>place.id===action.payload.locationId)??{slug:locationSlug??''})} style={StyleSheet.absoluteFill} contentFit="cover"/><View style={styles.locationPlanShade}/><View style={styles.locationPlanHeroContent}><View style={styles.locationPlanKickerRow}><Text style={styles.locationPlanKicker}>PLAN A DATE</Text><Pressable accessibilityLabel="Dismiss date suggestion" disabled={disabled} onPress={onDismiss} style={styles.locationPlanClose}><X size={16} color="#fff"/></Pressable></View><Text style={styles.locationPlanTitle}>Go to {location} together?</Text><Text style={styles.locationPlanCopy}>Choose when you want to make it happen.</Text></View></View>
    <View style={styles.locationPlanBody}><View style={styles.locationPlanQuickRow}><Pressable disabled={disabled} onPress={()=>void save('now')} style={styles.locationPlanPrimary}><Text style={styles.locationPlanPrimaryText}>{saving?'SAVING…':'NOW'}</Text></Pressable><Pressable disabled={disabled} onPress={()=>void save('in_one_hour')} style={styles.locationPlanSecondary}><Text style={styles.locationPlanSecondaryText}>IN 1 HOUR</Text></Pressable></View><Pressable disabled={disabled} accessibilityState={{expanded:customOpen}} onPress={()=>{setCustomOpen((value)=>!value);setLocalError('');}} style={styles.locationPlanCustom}><CalendarDays size={15} color={colors.rose}/><Text style={styles.locationPlanCustomText}>PICK ANOTHER TIME</Text><ChevronRight size={15} color={colors.muted} style={customOpen?{transform:[{rotate:'90deg'}]}:undefined}/></Pressable>{customOpen?<View style={styles.locationPlanFields}><DateTimeFields date={dateValue} time={timeValue} onDateChange={setDateValue} onTimeChange={setTimeValue}/><Pressable disabled={disabled} onPress={saveCustom} style={styles.locationPlanPrimary}><Text style={styles.locationPlanPrimaryText}>{saving?'SAVING…':'SAVE DATE'}</Text></Pressable></View>:null}{localError?<Text style={styles.locationPlanError}>{localError}</Text>:null}</View>
  </View>;
}

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
function Composer({compact,desktop,inputRef,conversationId,character,input,onChangeInput,onDictation,onDictationError,onDictationStart,pendingImage,photoUploadPhase,onAddPhoto,onRemovePhoto,sending,onSend,onMoment,autoDialogue,autoDialogueBusy,canSuggest,onSuggest,onSuggestOptions,onClearSuggestion,onFocus,onLayout}:{compact:boolean;desktop:boolean;inputRef:{current:TextInput|null};conversationId:string;character:CharacterInstance;input:string;onChangeInput:(value:string)=>void;onDictation:(text:string)=>void;onDictationError:(message:string)=>void;onDictationStart:()=>void;pendingImage:PendingImage|null;photoUploadPhase:PhotoUploadPhase;onAddPhoto:()=>void;onRemovePhoto:()=>void;sending:boolean;onSend:()=>void;onMoment:(mode:MediaMomentMode)=>void;autoDialogue:AutoDialogueSuggestion|null;autoDialogueBusy:boolean;canSuggest:boolean;onSuggest:()=>void;onSuggestOptions:()=>void;onClearSuggestion:()=>void;onFocus?:()=>void;onLayout?:(event:LayoutChangeEvent)=>void}) {
  const insets=useSafeAreaInsets();
  const [composerFocused,setComposerFocused]=useState(false);
  const dictation=useChatDictation({conversationId,characterInstanceId:character.id,disabled:sending||autoDialogueBusy,onBeforeStart:onDictationStart,onTranscript:onDictation,onError:onDictationError});
  const dictationBusy=dictation.phase!=='idle',overLimit=input.length>MESSAGE_CHARACTER_LIMIT,suggestMode=!input.trim()&&!pendingImage,actionDisabled=sending||autoDialogueBusy||dictationBusy||overLimit||Boolean(pendingImage&&photoUploadPhase==='blocked')||(suggestMode&&!canSuggest),autoDialogueEdited=Boolean(autoDialogue&&input!==autoDialogue.text);
  const counter=<MessageCharacterCounter value={input}/>;
  return <ChatComposerFrame owner="direct" floating={compact} bottomInset={insets.bottom} onLayout={onLayout} style={styles.composerWrap}>
    {pendingImage?<PhotoAttachmentPreview image={pendingImage} phase={photoUploadPhase} sending={sending} onReplace={onAddPhoto} onRemove={onRemovePhoto}/>:null}
    {compact?counter:null}
    <View style={[styles.composer,styles.composerAligned]}><View style={[styles.composerInputShell,styles.composerInputShellAligned,autoDialogue&&!autoDialogueEdited&&styles.composerInputSuggested,composerFocused&&styles.composerInputFocused,compact&&styles.composerInputFloating]}><MomentQuickMenuButton name={character.together_character_templates.name} onSelect={onMoment} disabled={sending||autoDialogueBusy||dictationBusy}/><TextInput nativeID="chat-message-composer" accessibilityLabel={`Message ${character.together_character_templates.name}`} ref={inputRef} value={input} onChangeText={onChangeInput} onFocus={()=>{setComposerFocused(true);onFocus?.();}} onBlur={()=>setComposerFocused(false)} onKeyPress={(event)=>{const nativeEvent=event.nativeEvent as typeof event.nativeEvent&{shiftKey?:boolean;isComposing?:boolean},intent={platform:Platform.OS,key:nativeEvent.key,shiftKey:nativeEvent.shiftKey,isComposing:nativeEvent.isComposing,hasContent:Boolean(input.trim()||pendingImage),disabled:actionDisabled};if(!shouldConsumeComposerEnter(intent))return;event.preventDefault();if(shouldSendComposerOnEnter(intent))onSend();}} editable={!autoDialogueBusy&&!dictationBusy} placeholder={dictation.phase==='recording'?'Listening…':dictation.phase==='transcribing'?'Turning voice into text…':autoDialogueBusy?'Thinking of what you might say…':compact?'Message…':`Message ${character.together_character_templates.name}…`} placeholderTextColor={colors.dimmed} multiline style={[styles.input,styles.inputFitted,styles.embeddedInput,styles.embeddedInputAligned,styles.composerTextInput,desktop&&styles.composerTextInputDesktop]} textAlignVertical="top"/>{autoDialogue&&!autoDialogueEdited?<View style={[styles.autoDialogueInline,styles.autoDialogueInlineAligned]}><Pressable accessibilityRole="button" accessibilityLabel={`Adjust suggested ${autoDialogueIntentLabel(autoDialogue.intent).toLowerCase()} reply`} onPress={onSuggestOptions} style={styles.autoDialogueInlineAction}><Sparkles size={14} color="#D4BEFF"/></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Clear suggested reply" onPress={onClearSuggestion} style={styles.autoDialogueInlineAction}><X size={14} color={colors.muted}/></Pressable></View>:null}<DictationButton phase={dictation.phase} elapsedMs={dictation.elapsedMs} disabled={sending||autoDialogueBusy} onPress={()=>void dictation.toggle()}/></View><Pressable accessibilityRole="button" accessibilityLabel={suggestMode?'Suggest a reply. Hold for reply options.':'Send message'} onPress={suggestMode?onSuggest:onSend} onLongPress={suggestMode&&canSuggest?onSuggestOptions:undefined} delayLongPress={350} disabled={actionDisabled} style={[styles.send,suggestMode&&styles.suggestButton,actionDisabled&&styles.sendDisabled]}>{autoDialogueBusy?<ActivityIndicator color="#fff" size="small"/>:suggestMode?<Sparkles color="#fff" size={19}/>:<Send color="#fff" size={19}/>}</Pressable></View>
    {!compact?counter:null}
  </ChatComposerFrame>;
}

function PhotoAttachmentPreview({image,phase,sending,onReplace,onRemove}:{image:PendingImage;phase:PhotoUploadPhase;sending:boolean;onReplace:()=>void;onRemove:()=>void}){const state=photoUploadPresentation(phase);return <View accessibilityLiveRegion="polite" accessibilityLabel={`Selected photo. ${state.label}${state.retry?'. Send again to retry.':''}`} style={styles.attachmentPreview}><Image source={{uri:image.uri}} style={styles.attachmentPreviewImage} contentFit="contain"/><View style={{flex:1,minWidth:0}}><Text style={styles.attachmentPreviewTitle}>{state.label}</Text><Text style={styles.attachmentPreviewMeta}>{image.fileName??'Selected image'} · {Math.max(1,Math.round(image.byteSize/1024))} KB</Text>{phase==='blocked'?<Text style={{color:colors.danger,fontSize:11,lineHeight:15,marginTop:4}}>Remove or replace this photo to keep chatting.</Text>:null}{state.busy?<View accessibilityRole="progressbar" accessibilityValue={{min:0,max:100,now:Math.round(state.progress*100)}} style={styles.attachmentProgressTrack}><View style={[styles.attachmentProgressFill,{width:`${Math.round(state.progress*100)}%`}]}/></View>:null}<View style={styles.attachmentPreviewActions}><Pressable accessibilityRole="button" accessibilityLabel="Replace selected photo" disabled={sending} onPress={onReplace} style={styles.attachmentTextButton}><Text style={styles.attachmentReplace}>Replace</Text></Pressable>{state.retry?<Text style={styles.attachmentRetry}>Tap Send to retry</Text>:null}</View></View>{sending?<ActivityIndicator color={colors.rose}/>:<Pressable accessibilityRole="button" accessibilityLabel="Remove selected photo" onPress={onRemove} style={styles.attachmentRemove}><X size={16} color={colors.text}/></Pressable>}</View>;}

function autoDialogueIntentLabel(intent:AutoDialogueSuggestion['intent']):string{return({answer:'Answer',repair:'Repair',support:'Supportive',celebrate:'Celebrate',flirt:'Romantic',follow_up:'Follow-up',coordinate_plan:'Plans',advance_scene:'Scene',close_scene:'Wrap-up',engage_group:'Group',curious:'Curious'} satisfies Record<AutoDialogueSuggestion['intent'],string>)[intent];}

function DictationButton({phase,elapsedMs,disabled,onPress}:{phase:ChatDictationPhase;elapsedMs:number;disabled:boolean;onPress:()=>void}){
  const pulse=useRef(new Animated.Value(0)).current;
  useEffect(()=>{if(phase!=='recording'){pulse.stopAnimation();pulse.setValue(0);return;}const loop=Animated.loop(Animated.sequence([Animated.timing(pulse,{toValue:1,duration:650,useNativeDriver:Platform.OS!=='web'}),Animated.timing(pulse,{toValue:0,duration:650,useNativeDriver:Platform.OS!=='web'})]));loop.start();return()=>loop.stop();},[phase,pulse]);
  const seconds=Math.max(0,Math.floor(elapsedMs/1000)),label=phase==='recording'?`Stop voice-to-text recording. ${Math.floor(seconds/60)} minutes ${seconds%60} seconds.`:phase==='transcribing'?'Turning voice into text.':'Start voice-to-text.',buttonDisabled=phase==='transcribing'||(phase==='idle'&&disabled);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled:buttonDisabled,busy:phase==='transcribing'}} disabled={buttonDisabled} onPress={onPress} style={[styles.dictationButton,phase==='recording'&&styles.dictationRecording,buttonDisabled&&styles.sendDisabled]}>
    {phase==='recording'?<Animated.View pointerEvents="none" style={[styles.dictationPulse,{opacity:pulse.interpolate({inputRange:[0,1],outputRange:[.18,.52]}),transform:[{scale:pulse.interpolate({inputRange:[0,1],outputRange:[.82,1.12]})}]}]}/>:null}
    {phase==='transcribing'?<ActivityIndicator color="#D9C7FF" size="small"/>:phase==='recording'?<Square size={13} color="#fff" fill="#fff"/>:<Mic size={20} color="#D9C7FF" strokeWidth={1.9}/>}
  </Pressable>;
}

function ContextualInteractionTray({interactions,loading,onOpen,onInteraction,onDismiss}:{interactions:InteractionCandidate[];loading:boolean;onOpen:()=>void;onInteraction:(candidate:InteractionCandidate)=>void;onDismiss?:()=>void}) { return <View style={styles.contextualTray}><View style={styles.contextualTrayHeader}><Text style={styles.actionKicker}>THINGS TO DO</Text><View style={styles.contextualTrayHeaderActions}><Pressable accessibilityRole="button" accessibilityLabel="See all things to do" hitSlop={8} onPress={onOpen}><Text style={styles.contextualMore}>More</Text></Pressable>{onDismiss?<Pressable accessibilityRole="button" accessibilityLabel="Hide things to do for this plan" hitSlop={6} onPress={onDismiss} style={styles.contextualDismiss}><X size={17} color={colors.muted}/></Pressable>:null}</View></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contextualTrayActions}>{interactions.map((candidate)=><Pressable key={candidate.id} disabled={loading} accessibilityLabel={candidate.label} onPress={()=>onInteraction(candidate)} style={[styles.contextualAction,loading&&styles.sendDisabled]}><Wand2 size={13} color={colors.rose}/><Text style={styles.contextualActionText}>{candidate.label}</Text></Pressable>)}</ScrollView></View>; }
function InteractionTray({name,location,interactions,destinations,loading,onInteraction,onMove,onClose}:{name:string;location:string;interactions:InteractionCandidate[];destinations:InteractionCandidate[];loading:boolean;onInteraction:(candidate:InteractionCandidate)=>void;onMove:(candidate:InteractionCandidate)=>void;onClose:()=>void}) { return <View style={styles.interactionTray}><View style={styles.planHeader}><View style={{flex:1,minWidth:0}}><Text style={styles.planTitle}>TOGETHER AT {location.toUpperCase()}</Text><Text style={styles.contextMuted}>Choose something that fits what you and {name} are doing right now.</Text></View><Pressable accessibilityLabel="Close actions" onPress={onClose}><Text style={styles.closeText}>Close</Text></Pressable></View><Text style={styles.interactionSectionTitle}>TOGETHER</Text><View style={styles.interactionOptions}>{interactions.map((candidate)=><Pressable key={candidate.id} disabled={loading} accessibilityLabel={candidate.label} onPress={()=>onInteraction(candidate)} style={[styles.interactionOption,loading&&styles.sendDisabled]}><Wand2 size={15} color={colors.rose}/><View style={{flex:1,minWidth:0}}><Text style={styles.interactionOptionTitle}>{candidate.label}</Text>{candidate.durationMinutes?<Text style={styles.interactionOptionMeta}>About {candidate.durationMinutes} min</Text>:null}</View><ChevronRight size={16} color={colors.muted}/></Pressable>)}</View>{destinations.length?<><Text style={styles.interactionSectionTitle}>AROUND HERE</Text><View style={styles.interactionOptions}>{destinations.map((candidate)=><Pressable key={candidate.id} disabled={loading} accessibilityLabel={candidate.label} onPress={()=>onMove(candidate)} style={[styles.interactionOption,loading&&styles.sendDisabled]}><MapPin size={15} color={colors.warm}/><View style={{flex:1,minWidth:0}}><Text style={styles.interactionOptionTitle}>{candidate.label}</Text><Text style={styles.interactionOptionMeta}>Walk there together</Text></View><ChevronRight size={16} color={colors.muted}/></Pressable>)}</View></>:null}</View>; }
function CharacterProposalCard({name,proposal,busy,onAccept,onDismiss}:{name:string;proposal:CharacterInteractionProposal;busy:boolean;onAccept:()=>void;onDismiss:()=>void}){return <View accessibilityLabel={`${name} suggests ${proposal.label}`} style={styles.characterProposal}><View style={styles.characterProposalIcon}><Sparkles size={17} color={colors.rose}/></View><View style={{flex:1,minWidth:0}}><Text style={styles.characterProposalKicker}>{proposalHeading(proposal,name)}</Text><Text style={styles.characterProposalTitle}>{proposal.label}</Text></View><Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} onPress={onDismiss} style={styles.proposalSecondary}><Text style={styles.proposalSecondaryText}>Not now</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} onPress={onAccept} style={styles.proposalPrimary}><Text style={styles.proposalPrimaryText}>Do it</Text></Pressable></View>}

function pendingImageAttachment(image:PendingImage,conversationId:string):ConversationAttachment{return{id:`local-attachment-${Date.now()}`,user_id:'local',continuity_id:'local',conversation_id:conversationId,kind:'image',source:'user',storage_path:'',mime_type:image.mimeType,byte_size:image.byteSize,width:image.width,height:image.height,upload_status:'pending',analysis_status:'pending',analysis_metadata:{},metadata:{requestId:image.requestId},signed_url:image.uri,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};}
function PlanLifecycleDivider({event,companionName}:{event:ConversationEvent;companionName:string}){const label=planLifecycleDividerLabel(event,companionName);if(!label)return null;return <View accessibilityRole="text" accessibilityLabel={label} style={styles.planLifecycleDivider}><View style={styles.planLifecycleLine}/><Text style={styles.planLifecycleText}>{label}</Text><View style={styles.planLifecycleLine}/></View>;}
function SceneActionDivider({event,companionName}:{event:SceneActionTimelineEntry;companionName:string}){const label=sceneActionDividerLabel(event,companionName);return <View accessibilityRole="text" accessibilityLabel={label} style={styles.planLifecycleDivider}><View style={styles.planLifecycleLine}/><Text style={styles.planLifecycleText}>{label}</Text><View style={styles.planLifecycleLine}/></View>;}
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
function ContextSection({title,children}:{title:string;children:React.ReactNode}) { return <View style={{gap:9}}><Text style={[styles.railKicker,styles.desktopRailKicker]}>{title}</Text>{children}</View>; }
function ContextLine({icon,title,body,actionable=false}:{icon:React.ReactNode;title:string;body:string;actionable?:boolean}) { return <View style={styles.contextLine}>{icon}<View style={{flex:1}}><Text style={[styles.contextLineTitle,styles.desktopContextLineTitle]}>{title}</Text><Text style={[styles.contextCopy,styles.desktopContextCopy]}>{body}</Text></View>{actionable?<ChevronRight size={15} color={colors.muted}/>:null}</View>; }

function showNewStoryFeedback(before:Snapshot|null,after:Snapshot|null,characterId:string,name:string,set:(value:Feedback|null)=>void){if(!after)return;const previousMemories=new Set(before?.memories.map((item)=>item.id)??[]);const memory=after.memories.find((item)=>item.character_instance_id===characterId&&!previousMemories.has(item.id));if(memory){set({kind:'memory',title:`${name} remembered that`,body:presentMemoryText(memory.canonical_text,name),id:memory.id});return;}const previousMoments=new Set(before?.moments.map((item)=>item.id)??[]);const moment=after.moments.find((item)=>(item.character_instance_id===characterId||item.participant_instance_ids.includes(characterId))&&!previousMoments.has(item.id));if(moment)set({kind:'moment',title:'A new Moment',body:moment.summary,id:moment.id});}
