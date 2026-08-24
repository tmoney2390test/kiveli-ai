import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { isChatNearBottom } from "../src/lib/chatScroll";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Link, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  Archive,
  Brain,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  MapPin,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Send,
  Sparkles,
  Square,
  Star,
  Upload,
  UserMinus,
  Volume2,
  X,
} from "lucide-react-native";
import { currentGroupPlan, groupPlanBlockingParticipantRemoval, shouldGroupChatMessages } from "@together/domain/src/group-chat";
import {
  MESSAGE_CHARACTER_LIMIT,
  messageCharacterLimitError,
} from "@together/domain/src/message-limits";
import {
  CharacterAvatar,
  ChatPhotoRequestCard,
  ConnectionBanner,
  EmptyState,
  FrostedSurface,
  MediaTile,
  MessageCharacterCounter,
  resolveCharacterPortraitSource,
  VoiceNotePurchaseModal,
} from "../src/components";
import { GroupChatSettingsModal } from "../src/components/GroupChatSettingsModal";
import { PlanSelection } from "../src/components/PlanSelection";
import {
  confirmUserImage,
  confirmConversationAction,
  createSharedPlan,
  dismissConversationAction,
  type GroupDialogueEvent,
  manageConversation,
  manageGroup,
  manageMedia,
  managePlan,
  prepareUserImage,
  quoteVoiceNote,
  refreshVoiceNote,
  reportMessage,
  requestVoiceNote,
  sendGroupDialogue,
  type VoiceNoteQuote,
} from "../src/lib/api";
import { locationHeroAsset } from "../src/assets";
import { endPlanExperience, getPlanExperience, joinCommitment, switchPlanExperience } from "../src/lib/commitments";
import { activePlanForGroup, collapsePlanTimelineEvents, conversationPlanMenuItems, isPlanLifecycleDividerEvent, joinablePlanForGroup, planActionAvailability, planLifecycleDividerLabel, shouldShowPlanTimelineEvent } from "../src/lib/planActions";
import type { PlanOption, PlanTimingSelection } from "../src/lib/plans";
import { createClientRequestId } from "../src/lib/requestId";
import { reconcileMessages } from "../src/lib/messageReconciliation";
import { MESSAGES_INBOX_HREF } from "../src/lib/messageInbox";
import { chatMessageTypography } from "../src/lib/chatSettings";
import { applyGroupDetailDelta, mergeGroupMedia, prependGroupTimelinePage } from "../src/lib/groupDetailReconciliation";
import { confirmAction } from "../src/lib/dialogs";
import {
  cleanupNormalizedImage,
  type NormalizedUserImage,
  normalizeUserImage,
} from "../src/lib/imageUploads";
import { groupAddCandidates } from "../src/lib/groupWorld";
import {
  groupMediaNeedsRefresh,
  groupTimelineDayLabel,
} from "../src/lib/groupChatPresentation";
import { mergeDictationTranscript } from "../src/lib/dictation";
import { privateStoredImageSource } from "../src/lib/mediaImageSource";
import { presentMemoryText } from "../src/lib/memoryPresentation";
import { mediaWithoutActivePhotoOffer, photoMediaForOffer, visibleChatPhotoMedia } from "../src/lib/photoRequestPresentation";
import { characterResidentWorld } from "../src/lib/place";
import { placeHoursStatus } from "../src/lib/placeHours";
import { supabase } from "../src/lib/supabase";
import {
  hideVoiceNoteConfirmation,
  isVoiceNoteConfirmationHidden,
} from "../src/lib/voiceNoteConfirmation";
import { useTogether } from "../src/store/useTogether";
import { useAuth } from "../src/hooks/useAuth";
import { useNetworkStatus } from "../src/providers/NetworkStatusProvider";
import { usePersistentMessageDraft } from "../src/hooks/usePersistentMessageDraft";
import {
  type ChatDictationPhase,
  useChatDictation,
} from "../src/hooks/useChatDictation";
import { colors, radius, typography } from "../src/theme";
import type {
  GeneratedMedia,
  ConversationAction,
  ConversationEvent,
  GroupDetail,
  GroupDetailDelta,
  GroupTimelinePage,
  GroupParticipant,
  Location,
  MediaOffer,
  Message,
  MessageReaction,
  SharedPlan,
  Snapshot,
} from "../src/types";

export default function GroupChatScreen() {
  const params = useLocalSearchParams<{
      id?: string;
      details?: string;
      plan?: string;
      location?: string;
      activity?: string;
    }>(),
    { width } = useWindowDimensions(),
    snapshot = useTogether((state) => state.snapshot),
    refresh = useTogether((state) => state.refresh),
    upsertConversation = useTogether((state) => state.upsertConversation);
  const{session}=useAuth(),{online}=useNetworkStatus();
  const [detail, setDetail] = useState<GroupDetail | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [input, setInput] = useState(""),
    [pendingImage, setPendingImage] = useState<NormalizedUserImage | null>(
      null,
    ),
    [activeVoiceId, setActiveVoiceId] = useState<string | null>(null),
    [mediaOfferBusy, setMediaOfferBusy] = useState<string | null>(null),
    [typing, setTyping] = useState<Array<{ id: string; name: string }>>([]),
    [replyTo, setReplyTo] = useState<Message | null>(null),
    [manualSpeaker, setManualSpeaker] = useState<string | null>(null),
    [showPhotoMenu, setShowPhotoMenu] = useState(false),
    [photoSubjects, setPhotoSubjects] = useState<string[]>([]),
    [photoRequestBusy, setPhotoRequestBusy] = useState(false),
    [showDetails, setShowDetails] = useState(params.details === "1"),
    [showGroupMenu, setShowGroupMenu] = useState(false),
    [showChatSettings, setShowChatSettings] = useState(false),
    [favoriteBusy, setFavoriteBusy] = useState(false),
    [contextParticipantId, setContextParticipantId] = useState<string | null>(
      null,
    ),
    [showPlans, setShowPlans] = useState(false),
    [switchPlanId, setSwitchPlanId] = useState<string | null>(null),
    [pendingGroupActionId, setPendingGroupActionId] = useState<string | null>(null),
    [planActionBusyId, setPlanActionBusyId] = useState<string | null>(null),
    [sending, setSending] = useState(false),
    [olderLoading,setOlderLoading]=useState(false),
    [busy, setBusy] = useState(false);
  const clearStoredDraft=usePersistentMessageDraft({userId:session?.user.id,conversationId:params.id,kind:"group",value:input,setValue:setInput});
  const abortRef = useRef<AbortController | null>(null),
    lastSendRef = useRef<{ text: string; startedAt: number } | null>(null),
    planRequestIdRef = useRef(createClientRequestId()),
    freshRequestIdRef = useRef(createClientRequestId()),
    mediaRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    deltaRefreshRunning=useRef(false),
    deltaRefreshQueued=useRef(false),
    detailRef=useRef<GroupDetail|null>(null),
    scrollRef = useRef<ScrollView | null>(null),
    contentHeightRef=useRef(0),
    prependHeightRef=useRef<number|null>(null),
    bottomAlignedConversation = useRef<string | null>(null),
    keepPinnedToBottom = useRef(true);
  const loadedGroupRef = useRef<string | null>(null);
  const planLaunchHandledRef = useRef<string | null>(null);
  useEffect(()=>{detailRef.current=detail;},[detail]);
  const refreshGroupDelta=useCallback(async function refreshGroupDeltaTask(){
    const current=detailRef.current;if(!params.id||!current?.syncedAt)return;
    if(deltaRefreshRunning.current){deltaRefreshQueued.current=true;return;}
    deltaRefreshRunning.current=true;
    try{const delta=await manageGroup<GroupDetailDelta>({action:"changes",conversationId:params.id,since:current.syncedAt});setDetail((value)=>value?applyGroupDetailDelta(value,delta):value);}
    catch{/* The next realtime event, poll, or focus load safely retries. */}
    finally{deltaRefreshRunning.current=false;if(deltaRefreshQueued.current){deltaRefreshQueued.current=false;void refreshGroupDeltaTask();}}
  },[params.id]);
  useFocusEffect(useCallback(() => {
    if (!params.id) return;
    const conversationId=params.id,initial=loadedGroupRef.current!==conversationId;
    let cancelled=false;
    if(initial)setLoading(true);
    bottomAlignedConversation.current = null;
    keepPinnedToBottom.current = true;
    const request=initial
      ? manageGroup<GroupDetail>({action:"detail",conversationId}).then((next)=>{if(cancelled)return;loadedGroupRef.current=conversationId;setDetail(next);})
      : refreshGroupDelta();
    void request.then(()=>{if(!cancelled)setError("");}).catch((caught)=>{if(!cancelled)setError(caught instanceof Error?caught.message:"This group could not be loaded.");}).finally(()=>{if(!cancelled&&initial)setLoading(false);});
    return () => {
      cancelled=true;
      abortRef.current?.abort();
      if (mediaRefreshTimer.current) clearTimeout(mediaRefreshTimer.current);
    };
  }, [params.id,refreshGroupDelta]));
  useEffect(() => {
    if (!params.id) return;
    const refreshDetail = () => {
      if (mediaRefreshTimer.current) clearTimeout(mediaRefreshTimer.current);
      mediaRefreshTimer.current = setTimeout(() => {
        void refreshGroupDelta();
      }, 140);
    };
    const channel = supabase.channel(`group-media:${params.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "together_generated_media",
        filter: `conversation_id=eq.${params.id}`,
      }, refreshDetail)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "together_media_offers",
        filter: `conversation_id=eq.${params.id}`,
      }, refreshDetail)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "together_messages",
        filter: `conversation_id=eq.${params.id}`,
      }, refreshDetail)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "together_message_reactions",
        filter: `conversation_id=eq.${params.id}`,
      }, refreshDetail)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "together_conversation_actions",
        filter: `conversation_id=eq.${params.id}`,
      }, refreshDetail)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "together_conversation_events",
        filter: `conversation_id=eq.${params.id}`,
      }, refreshDetail)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "together_shared_plans",
        filter: `source_conversation_id=eq.${params.id}`,
      }, refreshDetail)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "together_plan_participant_responses",
      }, refreshDetail)
      .subscribe();
    return () => {
      if (mediaRefreshTimer.current) clearTimeout(mediaRefreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [params.id,refreshGroupDelta]);
  const mediaNeedsRefresh = groupMediaNeedsRefresh(
    detail?.generatedMedia ?? [],
    detail?.mediaOffers ?? [],
  );
  useEffect(() => {
    if (!params.id || !mediaNeedsRefresh) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt=0;
    const poll = () => {
      timer = setTimeout(() => {
        const ids=(detailRef.current?.generatedMedia??[]).filter((item)=>item.status==='queued'||item.status==='generating'||(item.status==='ready'&&!item.signed_url)).map((item)=>item.id).slice(0,20);
        if(!ids.length)return;
        void manageMedia<{media:GeneratedMedia[]}>({action:'batch_status',mediaIds:ids}).then((next) => {
          if (!cancelled) setDetail((current)=>current?mergeGroupMedia(current,next.media):current);
        }).catch(() => undefined).finally(() => {
          if (!cancelled){attempt+=1;poll();}
        });
      }, Math.min(10_000,2_000+attempt*1_500));
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [mediaNeedsRefresh, params.id]);
  useEffect(() => {
    if (!params.id || bottomAlignedConversation.current !== params.id ||
      !keepPinnedToBottom.current) return;
    const timer = setTimeout(() => {
      if (keepPinnedToBottom.current) {
        scrollRef.current?.scrollToEnd({ animated: true });
      }
    }, 30);
    return () => clearTimeout(timer);
  }, [detail?.messages.length, params.id, typing.length]);
  const participantById = useMemo(
    () =>
      new Map(
        (detail?.participants ?? []).map((
          participant,
        ) => [participant.character_instance_id, participant]),
      ),
    [detail?.participants],
  );
  const mentionQuery = /(?:^|\s)@([\p{L}\p{N}_-]*)$/u.exec(input)?.[1]
    ?.toLocaleLowerCase();
  const mentionOptions = mentionQuery === undefined
    ? []
    : (detail?.participants ?? []).filter((participant) =>
      participant.together_character_instances.together_character_templates.name
        .toLocaleLowerCase().startsWith(mentionQuery)
    ).slice(0, 5);
  const groupPlans = detail?.sharedPlans ?? [];
  const activeGroupPlan = detail ? activePlanForGroup(groupPlans, detail.conversation.id) : null;
  const joinableGroupPlan = detail ? joinablePlanForGroup(groupPlans, detail.conversation.id) : null;
  const waitingGroupPlan = detail
    ? groupPlans.filter((plan) =>
      plan.source_conversation_id === detail.conversation.id &&
      plan.status === "scheduled" &&
      Boolean(plan.attendance?.user && !plan.attendance.user.left_at) &&
      Number.isFinite(new Date(plan.starts_at ?? "").getTime()) &&
      new Date(plan.starts_at ?? "").getTime() > Date.now()
    ).sort((left, right) =>
      new Date(left.starts_at ?? 0).getTime() - new Date(right.starts_at ?? 0).getTime()
    )[0] ?? null
    : null;
  const anchorParticipant = detail?.participants.find((participant) =>
    participant.character_instance_id === detail.conversation.character_instance_id
  ) ?? detail?.participants[0];
  const groupPlanLabel = groupCompanionLabel(detail?.participants ?? []);
  const groupFavorite = detail?.conversation.metadata?.favorite === true,
    contextParticipant = detail?.participants.find((participant) =>
      participant.character_instance_id === contextParticipantId
    ) ?? detail?.participants[0],
    messageTypography = chatMessageTypography(detail?.conversation),
    showRightRail = width >= 920;
  useEffect(() => {
    if (!detail?.participants.length) {
      setContextParticipantId(null);
      return;
    }
    if (!contextParticipantId || !detail.participants.some((participant) =>
      participant.character_instance_id === contextParticipantId
    )) {
      setContextParticipantId(detail.participants[0]!.character_instance_id);
    }
  }, [contextParticipantId, detail?.participants]);
  const scopedPlannerLocation = snapshot?.locations.find((location) =>
    location.slug === params.location &&
    (!detail?.conversation.group_world_id ||
      location.world_id === detail.conversation.group_world_id)
  );
  useEffect(() => {
    if (!detail || !anchorParticipant || params.plan !== "1") return;
    const launchKey = `${detail.conversation.id}:${params.location ?? "any"}:${params.activity ?? "any"}`;
    if (planLaunchHandledRef.current === launchKey) return;
    planLaunchHandledRef.current = launchKey;
    setPendingGroupActionId(null);
    setSwitchPlanId(null);
    setShowPlans(true);
  }, [anchorParticipant, detail, params.activity, params.location, params.plan]);
  useEffect(() => {
    if (params.plan !== "1") planLaunchHandledRef.current = null;
  }, [params.plan]);
  const groupPlanReconciliationKey = groupPlans
    .filter((plan) =>
      ((plan.status === "scheduled" || plan.status === "active") &&
        Boolean(plan.ends_at) && Boolean(plan.attendance?.user)) ||
      (plan.status === "completed" &&
        (plan.participant_instance_ids?.length ?? 1) > 1 &&
        !((plan.metadata?.groupPlanExperience as Record<string, unknown> | undefined)?.finalizedAt))
    )
    .map((plan) => `${plan.id}:${plan.ends_at}:${plan.character_instance_id}`)
    .sort()
    .join("|");
  const groupPlanStartKey = groupPlans
    .filter((plan) =>
      Boolean(plan.attendance?.user && !plan.attendance.user.left_at) &&
      Boolean(plan.starts_at) &&
      (plan.status === "scheduled" ||
        (plan.status === "active" && !plan.attendance?.character))
    )
    .map((plan) => `${plan.id}:${plan.status}:${plan.starts_at}:${Boolean(plan.attendance?.character)}`)
    .sort()
    .join("|");
  useEffect(() => {
    if (!params.id || !groupPlanStartKey) return;
    const candidates = groupPlans.filter((plan) =>
      Boolean(plan.attendance?.user && !plan.attendance.user.left_at) &&
      Boolean(plan.starts_at) &&
      (plan.status === "scheduled" ||
        (plan.status === "active" && !plan.attendance?.character))
    );
    const nextStart = Math.min(...candidates.map((plan) =>
      new Date(plan.starts_at!).getTime()
    ));
    if (!Number.isFinite(nextStart)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const activate = async () => {
      const due = candidates.filter((plan) =>
        new Date(plan.starts_at!).getTime() <= Date.now()
      );
      if (!due.length) return;
      try {
        await Promise.all(due.map((plan) =>
          joinCommitment(
            plan.id,
            plan.character_instance_id,
            `group-start:${plan.id}`,
          )
        ));
        if (cancelled) return;
        if (!cancelled) await refreshGroupDelta();
      } catch {
        if (!cancelled) timer = setTimeout(() => void activate(), 5_000);
      }
    };
    const delay = Math.max(0, nextStart - Date.now()) + 250;
    timer = setTimeout(() => void activate(), delay);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [groupPlanStartKey, params.id,refreshGroupDelta]);
  useEffect(() => {
    if (!params.id || !groupPlanReconciliationKey) return;
    const candidates = groupPlans.filter((plan) =>
      (((plan.status === "scheduled" || plan.status === "active") &&
        Boolean(plan.ends_at) && Boolean(plan.attendance?.user)) ||
        (plan.status === "completed" &&
          (plan.participant_instance_ids?.length ?? 1) > 1 &&
          !((plan.metadata?.groupPlanExperience as Record<string, unknown> | undefined)?.finalizedAt))) &&
      Boolean(plan.ends_at)
    );
    const nextEnd = Math.min(...candidates.map((plan) => new Date(plan.ends_at!).getTime()));
    if (!Number.isFinite(nextEnd)) return;
    let cancelled = false;
    const reconcile = async () => {
      const elapsed = candidates.filter((plan) =>
        new Date(plan.ends_at!).getTime() <= Date.now()
      );
      if (!elapsed.length) return;
      try {
        await Promise.all(elapsed.map((plan) =>
          getPlanExperience(plan.id, plan.character_instance_id)
        ));
        if (cancelled) return;
        if (!cancelled) await refreshGroupDelta();
      } catch {
        // Realtime or the next focus refresh will retry. The server operation is
        // idempotent, so a transient network failure cannot duplicate history.
      }
    };
    const delay = Math.max(0, nextEnd - Date.now()) + 750;
    const timer = setTimeout(() => void reconcile(), delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [groupPlanReconciliationKey, params.id,refreshGroupDelta]);
  const groupTimeline = useMemo(() => {
    if (!detail) return [] as Array<{kind:"message";value:Message}|{kind:"action";value:ConversationAction}|{kind:"event";value:ConversationEvent}>;
    const events = collapsePlanTimelineEvents((detail.conversationEvents ?? []).filter((event) => event.entity_type === "shared_plan" && shouldShowPlanTimelineEvent(event)));
    return [
      ...detail.messages.map((value) => ({ kind: "message" as const, value })),
      ...(activeGroupPlan ? [] : (detail.conversationActions ?? []).filter((value) => value.status === "pending").map((value) => ({ kind: "action" as const, value }))),
      ...events.map((value) => ({ kind: "event" as const, value })),
    ].sort((left, right) => {
      const delta = new Date(left.value.created_at).getTime() - new Date(right.value.created_at).getTime();
      if (delta) return delta;
      return left.kind === "event" ? 1 : -1;
    });
  }, [activeGroupPlan, detail]);
  const appendMessage = (message: Message) =>
    setDetail((current) =>
      current
        ? {
          ...current,
          messages: reconcileMessages(current.messages,[message]),
          conversation: {
            ...current.conversation,
            last_message_at: message.created_at,
            last_message_preview: message.content,
            last_message_role: message.role,
          },
        }
        : current
    );
  const handleEvent = (event: GroupDialogueEvent) => {
    if (event.type === "turn_started" && event.sourceMessage) {
      appendMessage(event.sourceMessage);
    }
    if (event.type === "speaker_typing") {
      setTyping((current) =>
        current.some((item) => item.id === event.characterInstanceId)
          ? current
          : [...current, {
            id: event.characterInstanceId,
            name: event.speakerName,
          }]
      );
    }
    if (event.type === "message_completed") {
      appendMessage(event.message);
      setTyping((current) =>
        current.filter((item) =>
          item.id !== event.message.speaker_character_instance_id
        )
      );
    }
    if (event.type === "media_offer_created") {
      setDetail((current) =>
        current &&
          !current.mediaOffers.some((offer) => offer.id === event.offer.id)
          ? { ...current, mediaOffers: [...current.mediaOffers, event.offer] }
          : current
      );
    }
    if (event.type === "reaction_added") {
      setDetail((current) =>
        current &&
          !current.reactions.some((reaction) =>
            reaction.id === event.reaction.id
          )
          ? { ...current, reactions: [...current.reactions, event.reaction] }
          : current
      );
    }
    if (event.type === "turn_yielded" || event.type === "turn_cancelled") {
      setTyping([]);
    }
  };
  const send = async (text = input, letThemTalk = false,retryRequestId?:string,retryMessageId?:string) => {
    const message = text.trim();
    if (!detail || !message) return;
    if (message.length > MESSAGE_CHARACTER_LIMIT) {
      setError(messageCharacterLimitError());
      return;
    }
    if(!online){setError("You’re offline. Your draft is saved and ready when you reconnect.");return;}
    const previousSend=lastSendRef.current;
    if(previousSend?.text===message&&Date.now()-previousSend.startedAt<750)return;
    lastSendRef.current={text:message,startedAt:Date.now()};
    abortRef.current?.abort();
    keepPinnedToBottom.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    if (!letThemTalk) setInput("");
    setSending(true);
    setError("");
    const mentions = detail.participants.filter((participant) =>
      new RegExp(
        `(?:^|\\s)@?${
          escapeRegExp(
            participant.together_character_instances
              .together_character_templates.name.split(" ")[0] ?? "",
          )
        }(?:$|[\\s,.!?])`,
        "iu",
      ).test(message)
    ).map((participant) => participant.character_instance_id);
    const reply = replyTo;
    const clientRequestId=retryRequestId??createClientRequestId();
    const optimistic:Message={id:retryMessageId??`local-${Date.now()}`,conversation_id:detail.conversation.id,role:"user",content:message,client_request_id:clientRequestId,delivery_status:"pending",created_at:new Date().toISOString(),attachments:[]};
    setDetail((current)=>current?{...current,messages:retryMessageId?current.messages.map((item)=>item.id===retryMessageId?optimistic:item):[...current.messages,optimistic]}:current);
    setReplyTo(null);
    try {
      await sendGroupDialogue(
        {
          conversationId: detail.conversation.id,
          message,
          clientRequestId,
          mentionedCharacterInstanceIds: mentions,
          replyToMessageId: reply?.id,
          manualSpeakerInstanceId:
            detail.settings.responseMode === "choose_speaker"
              ? manualSpeaker ?? undefined
              : undefined,
          letThemTalk,
        },
        handleEvent,
        controller.signal,
      );
      if(!letThemTalk)await clearStoredDraft();
    } catch (caught) {
      if ((caught as Error)?.name !== "AbortError") {
        setError(
          caught instanceof Error
            ? caught.message
            : "The group could not reply.",
        );
        if(!letThemTalk)setInput(message);
        setDetail((current)=>current?{...current,messages:current.messages.map((item)=>item.id===optimistic.id?{...item,delivery_status:"failed"}:item)}:current);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setTyping([]);
        setSending(false);
      }
    }
  };
  const sendPrepared = async () => {
    const message = input.trim(), selectedImage = pendingImage;
    if (!detail || (!message && !selectedImage)) return;
    if (message.length > MESSAGE_CHARACTER_LIMIT) {
      setError(messageCharacterLimitError());
      return;
    }
    if(!online){setError("You’re offline. Your draft is saved and ready when you reconnect.");return;}
    const submissionKey=`${message}\u0000${selectedImage?.uri??""}`;
    const previousSend=lastSendRef.current;
    if(previousSend?.text===submissionKey&&Date.now()-previousSend.startedAt<750)return;
    lastSendRef.current={text:submissionKey,startedAt:Date.now()};
    abortRef.current?.abort();
    keepPinnedToBottom.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setInput("");
    setSending(true);
    setError("");
    const mentions = mentionedParticipants(message, detail.participants),
      reply = replyTo;
    const clientRequestId=createClientRequestId(),optimistic:Message={id:`local-${Date.now()}`,conversation_id:detail.conversation.id,role:"user",content:message||"[Photo]",client_request_id:clientRequestId,delivery_status:"pending",created_at:new Date().toISOString(),attachments:[]};
    setDetail((current)=>current?{...current,messages:[...current.messages,optimistic]}:current);
    setReplyTo(null);
    try {
      let attachmentId: string | undefined;
      if (selectedImage) {
        const anchor = detail.conversation.character_instance_id ??
          detail.participants[0]?.character_instance_id;
        if (!anchor) throw new Error("This group has no available companion.");
        const prepared = await prepareUserImage({
          conversationId: detail.conversation.id,
          characterInstanceId: anchor,
          mimeType: selectedImage.mimeType,
          byteSize: selectedImage.byteSize,
          width: selectedImage.width,
          height: selectedImage.height,
          requestId: crypto.randomUUID(),
        });
        const blob = await fetch(selectedImage.uri).then((response) =>
          response.blob()
        );
        const { error: uploadError } = await supabase.storage.from(
          prepared.upload.bucket,
        ).upload(prepared.upload.path, blob, {
          contentType: selectedImage.mimeType,
          upsert: false,
        });
        if (uploadError) throw new Error("That photo could not be uploaded.");
        attachmentId =
          (await confirmUserImage(prepared.attachment.id)).attachment.id;
      }
      await sendGroupDialogue(
        {
          conversationId: detail.conversation.id,
          message,
          attachmentIds: attachmentId ? [attachmentId] : [],
          clientRequestId,
          mentionedCharacterInstanceIds: mentions,
          replyToMessageId: reply?.id,
          manualSpeakerInstanceId:
            detail.settings.responseMode === "choose_speaker"
              ? manualSpeaker ?? undefined
              : undefined,
        },
        handleEvent,
        controller.signal,
      );
      if (selectedImage) {
        cleanupNormalizedImage(selectedImage.uri);
        setPendingImage(null);
      }
      await clearStoredDraft();
    } catch (caught) {
      if ((caught as Error)?.name !== "AbortError") {
        setError(
          caught instanceof Error
            ? caught.message
            : "The group could not reply.",
        );
        setInput(message);
        setDetail((current)=>current?{...current,messages:current.messages.map((item)=>item.id===optimistic.id?{...item,delivery_status:"failed"}:item)}:current);
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setTyping([]);
        setSending(false);
      }
    }
  };
  const choosePhoto = async () => {
    try {
      const permission = await ImagePicker
        .requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Photo access is needed to choose a photo.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
        allowsMultipleSelection: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0],
        normalized = await normalizeUserImage({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
          fileSize: asset.fileSize,
          fileName: asset.fileName,
        }, .88);
      cleanupNormalizedImage(pendingImage?.uri);
      setPendingImage(normalized);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "That photo could not be opened.",
      );
    }
  };
  const openPhotoMenu = () => {
    if (!detail) return;
    const preferred = manualSpeaker &&
        detail.participants.some((item) =>
          item.character_instance_id === manualSpeaker
        )
      ? manualSpeaker
      : detail.participants[0]?.character_instance_id;
    setPhotoSubjects(preferred ? [preferred] : []);
    setShowPhotoMenu(true);
  };
  const togglePhotoSubject = (characterInstanceId: string) => {
    setPhotoSubjects((current) =>
      current.includes(characterInstanceId)
        ? current.filter((id) => id !== characterInstanceId)
        : current.length < 2
        ? [...current, characterInstanceId]
        : [current[1]!, characterInstanceId]
    );
  };
  const requestGroupPhoto = async () => {
    if (!detail || !photoSubjects.length || photoRequestBusy) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhotoRequestBusy(true);
    setError("");
    const selected = photoSubjects.map((id) =>
      detail.participants.find((item) => item.character_instance_id === id)
    ).filter(Boolean) as GroupParticipant[];
    const names = selected.map((participant) =>
      participant.together_character_instances.together_character_templates.name
        .split(" ")[0]
    );
    const message = names.length > 1
      ? `${names.join(" and ")}, send me a photo together.`
      : `${names[0]}, send me a photo.`;
    setShowPhotoMenu(false);
    try {
      await sendGroupDialogue(
        {
          conversationId: detail.conversation.id,
          message,
          clientRequestId: crypto.randomUUID(),
          mentionedCharacterInstanceIds: photoSubjects,
          photoSubjectCharacterInstanceIds: photoSubjects,
          manualSpeakerInstanceId: photoSubjects[0],
        },
        handleEvent,
        controller.signal,
      );
    } catch (caught) {
      if ((caught as Error)?.name !== "AbortError") {
        setError(
          caught instanceof Error
            ? caught.message
            : "The photo request could not be prepared.",
        );
      }
    } finally {
      setPhotoRequestBusy(false);
      if (abortRef.current === controller) {
        abortRef.current = null;
        setTyping([]);
      }
    }
  };
  const acceptMediaOffer = async (offer: MediaOffer) => {
    setMediaOfferBusy(offer.id);
    try {
      const result = await manageMedia<
        {
          state: "accepted" | "needs_credits" | "expired";
          offer: MediaOffer;
          media?: GeneratedMedia;
          creditBalance: number;
          required?: number;
        }
      >({
        action: "accept_offer",
        offerId: offer.id,
        requestId: crypto.randomUUID(),
      });
      if (result.state === "needs_credits") {
        setError(
          `This photo needs ${
            result.required ?? offer.credit_cost
          } Kivelle Credits. You have ${result.creditBalance}.`,
        );
        return;
      }
      setDetail((current) =>
        current
          ? {
            ...current,
            mediaOffers: (current.mediaOffers ?? []).map((item) =>
              item.id === offer.id ? result.offer : item
            ),
            generatedMedia: result.media
              ? [
                ...(current.generatedMedia ?? []).filter((item) =>
                  item.id !== result.media!.id
                ),
                result.media,
              ]
              : current.generatedMedia,
          }
          : current
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The photo could not be prepared.",
      );
    } finally {
      setMediaOfferBusy(null);
    }
  };
  const declineMediaOffer = async (offer: MediaOffer) => {
    setMediaOfferBusy(offer.id);
    try {
      await manageMedia({ action: "decline_offer", offerId: offer.id });
      setDetail((current) =>
        current
          ? {
            ...current,
            mediaOffers: (current.mediaOffers ?? []).filter((item) =>
              item.id !== offer.id
            ),
          }
          : current
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The photo offer could not be dismissed.",
      );
    } finally {
      setMediaOfferBusy(null);
    }
  };
  const retryGeneratedMedia = async (media: GeneratedMedia) => {
    setMediaOfferBusy(media.id);
    try {
      const result = await manageMedia<{ media: GeneratedMedia }>({
        action: "retry",
        mediaId: media.id,
      });
      setDetail((current) =>
        current
          ? {
            ...current,
            generatedMedia: (current.generatedMedia ?? []).map((item) =>
              item.id === media.id ? result.media : item
            ),
            mediaOffers: (current.mediaOffers ?? []).map((item) =>
              item.generated_media_id === media.id
                ? { ...item, status: "accepted", failure_reason_safe: null }
                : item
            ),
          }
          : current
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The photo could not be retried.",
      );
    } finally {
      setMediaOfferBusy(null);
    }
  };
  const reloadGroup = async () => {
    if (!detail) return;
    await refreshGroupDelta();
  };
  const loadOlderMessages = async () => {
    const current = detailRef.current;
    if (!current || olderLoading || !current.hasMoreMessages || !current.messages.length) return;
    const oldestMessage = current.messages[0];
    if (!oldestMessage) return;
    setOlderLoading(true);
    prependHeightRef.current = contentHeightRef.current;
    try {
      const page = await manageGroup<GroupTimelinePage>({
        action: "messages",
        conversationId: current.conversation.id,
        before: oldestMessage.created_at,
        limit: 50,
      });
      setDetail((value) => value ? prependGroupTimelinePage(value, page) : value);
    } catch (caught) {
      prependHeightRef.current = null;
      setError(caught instanceof Error ? caught.message : "Earlier messages could not be loaded.");
    } finally {
      setOlderLoading(false);
    }
  };
  const openGroupPlanner = (change = false) => {
    if (!detail || !anchorParticipant) return;
    setShowGroupMenu(false);
    setPendingGroupActionId(null);
    setSwitchPlanId(change ? activeGroupPlan?.id ?? null : null);
    setShowPlans(true);
  };
  const openGroupSuggestionPlanner = (action: ConversationAction) => {
    setPendingGroupActionId(action.id);
    setSwitchPlanId(null);
    setShowPlans(true);
  };
  const acceptGroupPlanSuggestion = async (
    action: ConversationAction,
    timingChoice: "now" | "in_one_hour",
  ) => {
    if (planActionBusyId) return;
    setPlanActionBusyId(action.id);
    setError("");
    try {
      await confirmConversationAction(action.id, { timingChoice });
      await reloadGroup();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The group plan could not be saved.");
    } finally {
      setPlanActionBusyId(null);
    }
  };
  const dismissGroupPlanSuggestion = async (action: ConversationAction) => {
    setDetail((current) => current ? {
      ...current,
      conversationActions: current.conversationActions.filter((item) => item.id !== action.id),
    } : current);
    try {
      await dismissConversationAction(action.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That suggestion could not be dismissed.");
      await reloadGroup().catch(() => undefined);
    }
  };
  const saveGroupPlan = async (option: PlanOption, timing: PlanTimingSelection) => {
    if (!detail || !anchorParticipant || busy) return;
    setBusy(true);
    setError("");
    try {
      if (switchPlanId) {
        if (timing.choice !== "now") throw new Error("Choose Switch Now to replace the active group plan.");
        const currentPlan = groupPlans.find((plan) => plan.id === switchPlanId);
        if (!currentPlan) throw new Error("That group plan is no longer active.");
        await switchPlanExperience({
          currentPlanId: switchPlanId,
          characterInstanceId: currentPlan.character_instance_id,
          activityKey: option.activityKey,
          locationId: option.locationId,
          sourceConversationId: detail.conversation.id,
          requestId: planRequestIdRef.current,
        });
      } else if (pendingGroupActionId) {
        await confirmConversationAction(pendingGroupActionId, {
          activityKey: option.activityKey,
          locationId: option.locationId,
          ...(timing.choice === "custom"
            ? { timingChoice: "custom" as const, startsAt: timing.startsAt }
            : { timingChoice: timing.choice }),
        });
      } else {
        await createSharedPlan({
          activityKey: option.activityKey,
          locationId: option.locationId,
          characterInstanceId: anchorParticipant.character_instance_id,
          ...(timing.choice === "custom"
            ? { timingChoice: "custom" as const, startsAt: timing.startsAt }
            : { timingChoice: timing.choice }),
          requestId: planRequestIdRef.current,
          source: "manual_planner",
          sourceConversationId: detail.conversation.id,
        });
      }
      planRequestIdRef.current = createClientRequestId();
      setShowPlans(false);
      setSwitchPlanId(null);
      setPendingGroupActionId(null);
      router.setParams({ plan: undefined, location: undefined, activity: undefined });
      await reloadGroup();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The group plan could not be saved.");
    } finally {
      setBusy(false);
    }
  };
  const startGroupPlan = async (plan: SharedPlan) => {
    if (!detail || planActionBusyId) return;
    setPlanActionBusyId(plan.id);
    setError("");
    try {
      await joinCommitment(plan.id, plan.character_instance_id);
      await reloadGroup();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The group plan could not be started.");
    } finally {
      setPlanActionBusyId(null);
    }
  };
  const requestEndGroupPlan = (plan: SharedPlan) => confirmAction({
    title: "End this group plan?",
    message: `This closes the shared scene with ${groupPlanLabel} and saves what happened for everyone.`,
    confirmLabel: "End plan",
    onConfirm: async () => {
      setPlanActionBusyId(plan.id);
      setError("");
      try {
        await endPlanExperience(plan.id, plan.character_instance_id);
        setShowGroupMenu(false);
        await reloadGroup();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The group plan could not be ended.");
      } finally {
        setPlanActionBusyId(null);
      }
    },
  });
  const cancelGroupPlan = (plan: SharedPlan) => confirmAction({
    title: "Cancel this group plan?",
    message: `Cancel ${plan.title} for the whole group?`,
    confirmLabel: "Cancel plan",
    onConfirm: async () => {
      setPlanActionBusyId(plan.id);
      try {
        await managePlan({ action: "cancel", planId: plan.id, conversationId: detail?.conversation.id });
        await reloadGroup();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "The group plan could not be cancelled.");
      } finally {
        setPlanActionBusyId(null);
      }
    },
  });
  const toggleGroupFavorite = async () => {
    if (!detail || favoriteBusy) return;
    const previous = detail,
      favorite = !groupFavorite;
    setFavoriteBusy(true);
    setDetail({
      ...detail,
      conversation: {
        ...detail.conversation,
        metadata: { ...(detail.conversation.metadata ?? {}), favorite },
      },
    });
    try {
      const next = await manageGroup<GroupDetail>({
        action: "set_favorite",
        conversationId: detail.conversation.id,
        favorite,
      });
      setDetail(next);
      upsertConversation(next.conversation);
    } catch (caught) {
      setDetail(previous);
      setError(
        caught instanceof Error
          ? caught.message
          : "That favorite could not be saved.",
      );
    } finally {
      setFavoriteBusy(false);
    }
  };
  const startFreshGroupChat = () => {
    if (!detail) return;
    confirmAction({
      title: "Start a fresh group chat?",
      message:
        "This creates a clean transcript with the same companions. Their relationships, memories, and any current group plan will continue.",
      confirmLabel: "Start fresh chat",
      onConfirm: async () => {
        setBusy(true);
        try {
          const next = await manageGroup<GroupDetail>({
            action: "fresh",
            conversationId: detail.conversation.id,
            requestId: freshRequestIdRef.current,
          });
          freshRequestIdRef.current = createClientRequestId();
          setShowGroupMenu(false);
          loadedGroupRef.current = next.conversation.id;
          setDetail(next);
          upsertConversation(next.conversation);
          await refresh();
          router.replace(`/group-chat?id=${next.conversation.id}` as never);
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : "A fresh group chat could not be started.",
          );
        } finally {
          setBusy(false);
        }
      },
    });
  };
  const deleteGroupConversation = () => {
    if (!detail) return;
    confirmAction({
      title: "Delete this conversation?",
      message:
        "It will disappear from Messages, but can be restored from Settings → Archived Chats for 30 days. Companion memories, relationships, Moments, and shared photos remain.",
      confirmLabel: "Delete conversation",
      destructive: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          await manageConversation({
            action: "delete",
            conversationId: detail.conversation.id,
          });
          setShowGroupMenu(false);
          await refresh();
          router.replace(MESSAGES_INBOX_HREF as never);
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : "The conversation could not be deleted.",
          );
        } finally {
          setBusy(false);
        }
      },
    });
  };
  const selectMention = (participant: GroupParticipant) => {
    const first =
      participant.together_character_instances.together_character_templates.name
        .split(" ")[0];
    setInput((value) => value.replace(/@[^\s@]*$/, `@${first} `));
  };
  if (!params.id) {
    return (
      <EmptyState
        title="Group unavailable"
        body="Open a group from Messages."
      />
    );
  }
  if (loading && !detail) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.rose} />
      </View>
    );
  }
  if (!detail) {
    return (
      <View style={styles.center}>
        <EmptyState
          title="Group unavailable"
          body={error || "This conversation is no longer available."}
        />
      </View>
    );
  }
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.shell}>
        <View style={styles.conversation}>
      <GroupAmbientGlow compact={width < 720} />
      <GroupHeader
        detail={detail}
        worldName={snapshot?.worlds.find((world) =>
          world.id === detail.conversation.group_world_id
        )?.name}
        onDetails={() => setShowGroupMenu((value) => !value)}
      />
      <ConnectionBanner sendFailed={detail.messages.some((message)=>message.delivery_status==="failed")}/>
      {showGroupMenu ? <GroupConversationMenu
        title={detail.conversation.title ?? "Group"}
        hasActivePlan={Boolean(activeGroupPlan)}
        favorite={groupFavorite}
        favoriteBusy={favoriteBusy}
        onClose={() => setShowGroupMenu(false)}
        onDetails={() => { setShowGroupMenu(false); setShowDetails(true); }}
        onCreatePlan={() => openGroupPlanner(false)}
        onChangePlan={() => openGroupPlanner(true)}
        onEndPlan={() => activeGroupPlan && requestEndGroupPlan(activeGroupPlan)}
        onFavorite={() => void toggleGroupFavorite()}
        onSettings={() => {
          setShowGroupMenu(false);
          setShowChatSettings(true);
        }}
        onFresh={startFreshGroupChat}
        onDelete={deleteGroupConversation}
      /> : null}
      <Modal animationType="fade" transparent visible={showPlans} onRequestClose={() => setShowPlans(false)}>
        <View style={styles.plannerModalRoot}>
          <ScrollView style={styles.plannerModalScroll} contentContainerStyle={styles.plannerModalContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {snapshot && anchorParticipant ? <PlanSelection
              snapshot={snapshot}
              character={anchorParticipant.together_character_instances}
              scopedLocationId={scopedPlannerLocation?.id}
              currentLocationId={null}
              initialActivityKey={params.activity}
              mode={switchPlanId ? "switch" : "create"}
              currentPlan={switchPlanId ? groupPlans.find((plan) => plan.id === switchPlanId) ?? null : null}
              proposal={pendingGroupActionId ? detail.conversationActions.find((action) => action.id === pendingGroupActionId) : undefined}
              initialTimingChoice={switchPlanId ? "now" : undefined}
              interests={[...(snapshot.profile?.interests ?? []), ...detail.participants.flatMap((participant) => participant.together_character_instances.together_character_versions.interests ?? [])]}
              companionLabel={groupPlanLabel}
              pluralCompanions
              participants={detail.participants.map((participant) => participant.together_character_instances)}
              plannerWorldId={detail.conversation.group_world_id}
              plannerConversationId={detail.conversation.id}
              busy={busy}
              error={error}
              onPlan={(option, timing) => void saveGroupPlan(option, timing)}
              onClose={() => { if (!busy) { setShowPlans(false); setSwitchPlanId(null); setPendingGroupActionId(null); router.setParams({plan:undefined,location:undefined,activity:undefined}); } }}
            /> : null}
          </ScrollView>
        </View>
      </Modal>
      <ScrollView
        ref={scrollRef}
        style={styles.timeline}
        contentContainerStyle={styles.timelineContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(event) => {
          const native = event.nativeEvent;
          keepPinnedToBottom.current = isChatNearBottom({
            contentHeight: native.contentSize.height,
            viewportHeight: native.layoutMeasurement.height,
            offsetY: native.contentOffset.y,
          });
        }}
        onLayout={() => {
          if (params.id && keepPinnedToBottom.current &&
            bottomAlignedConversation.current === params.id) {
            setTimeout(() =>
              scrollRef.current?.scrollToEnd({ animated: false }), 0);
          }
        }}
        onContentSizeChange={(_, height) => {
          if (!params.id) return;
          const previousHeight = prependHeightRef.current;
          contentHeightRef.current = height;
          if (previousHeight !== null) {
            prependHeightRef.current = null;
            scrollRef.current?.scrollTo({ y: Math.max(0, height - previousHeight), animated: false });
            return;
          }
          if (bottomAlignedConversation.current !== params.id) {
            keepPinnedToBottom.current = true;
            scrollRef.current?.scrollToEnd({ animated: false });
            bottomAlignedConversation.current = params.id;
            return;
          }
          if (keepPinnedToBottom.current) {
            scrollRef.current?.scrollToEnd({ animated: false });
          }
        }}
      >
        {detail.hasMoreMessages ? <Pressable
          accessibilityRole="button"
          accessibilityLabel="Load earlier group messages"
          disabled={olderLoading}
          onPress={() => void loadOlderMessages()}
          style={({ pressed }) => [styles.earlierButton, pressed && styles.pressed]}
        >
          <Text style={styles.earlierText}>{olderLoading ? "Loading earlier messages…" : "Load earlier messages"}</Text>
        </Pressable> : null}
        {groupTimeline.map((item, index) => {
          const previous = groupTimeline[index - 1],
            dayLabel = groupTimelineDayLabel(item.value.created_at, previous?.value.created_at);
          if (item.kind === "event") {
            const plan = groupPlans.find((candidate) => candidate.id === item.value.entity_id);
            return <Fragment key={item.value.id}>
              {dayLabel ? <Text style={styles.day}>{dayLabel}</Text> : null}
              <GroupPlanTimelineEvent
                event={item.value}
                plan={plan}
                participants={detail.participants}
                groupLabel={groupPlanLabel}
                busy={planActionBusyId === plan?.id}
                onOpen={(value) => router.push(`/plan/${value.id}` as never)}
                onStart={(value) => void startGroupPlan(value)}
                onEnd={requestEndGroupPlan}
                onCancel={cancelGroupPlan}
              />
            </Fragment>;
          }
          if (item.kind === "action") {
            return <Fragment key={item.value.id}>
              {dayLabel ? <Text style={styles.day}>{dayLabel}</Text> : null}
              <GroupLocationPlanSuggestion
                action={item.value}
                participants={detail.participants}
                locationRecord={snapshot?.locations.find((location) => location.id === item.value.payload.locationId)}
                busy={planActionBusyId === item.value.id}
                onAccept={(timing) => void acceptGroupPlanSuggestion(item.value, timing)}
                onChange={() => openGroupSuggestionPlanner(item.value)}
                onDismiss={() => void dismissGroupPlanSuggestion(item.value)}
              />
            </Fragment>;
          }
          const message = item.value,
            grouped = Boolean(
              previous?.kind === "message" && !dayLabel &&
                shouldGroupChatMessages(previous.value, message),
            );
          const participant = message.role === "assistant"
              ? participantById.get(
                String(
                  message.speaker_character_instance_id ??
                    message.character_instance_id,
                ),
              )
              : undefined,
            offer = (detail.mediaOffers ?? []).find((item) =>
              item.message_id === message.id &&
              !["declined", "expired"].includes(item.status)
            );
          return (
            <Fragment key={message.id}>
              {dayLabel ? <Text style={styles.day}>{dayLabel}</Text> : null}
              <GroupBubble
                message={message}
                participant={participant}
                grouped={grouped}
                reactions={detail.reactions.filter((reaction) =>
                  reaction.message_id === message.id
                )}
                participants={participantById}
                media={(detail.generatedMedia ?? []).filter((item) =>
                  item.message_id === message.id
                )}
                offer={offer}
                offerBusy={mediaOfferBusy === offer?.id}
                activeVoiceId={activeVoiceId}
                onVoiceActive={setActiveVoiceId}
                onOfferAccept={(item) => void acceptMediaOffer(item)}
                onOfferDecline={(item) => void declineMediaOffer(item)}
                onMediaRetry={(item) => void retryGeneratedMedia(item)}
                onReply={() => setReplyTo(message)}
                voiceVisible={snapshot?.profile?.multimodal_preferences
                  ?.companionVoiceNotes !== false}
                voiceEnabled={snapshot?.experienceCapabilities?.voiceNotes !==
                  false}
                onRetry={message.delivery_status==="failed"&&message.content!=="[Photo]"?()=>void send(message.content,false,message.client_request_id??undefined,message.id):undefined}
                textStyle={messageTypography}
              />
            </Fragment>
          );
        })}
        {(detail.mediaOffers ?? []).filter((offer) =>
          offer.status === "pending" && !offer.message_id
        ).map((offer) => (
          <ChatPhotoRequestCard
            key={offer.id}
            offer={offer}
            media={photoMediaForOffer(detail.generatedMedia ?? [],offer.generated_media_id)}
            busy={mediaOfferBusy === offer.id}
            onAccept={() => void acceptMediaOffer(offer)}
            onDecline={() => void declineMediaOffer(offer)}
            onBuyCredits={() => router.push("/subscription")}
            readyContentFit="contain"
          />
        ))}
        {typing.length ? <TypingIndicator people={typing} /> : null}
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {mentionOptions.length
        ? (
          <FrostedSurface intensity={92} style={styles.mentions}>
            {mentionOptions.map((participant) => (
              <Pressable
                key={participant.id}
                onPress={() => selectMention(participant)}
                style={styles.mentionRow}
              >
                <CharacterAvatarForParticipant
                  participant={participant}
                  size={34}
                />
                <Text style={styles.mentionName}>
                  @{participant.together_character_instances
                    .together_character_templates.name.split(" ")[0]}
                </Text>
              </Pressable>
            ))}
          </FrostedSurface>
        )
        : null}
      {detail.settings.responseMode === "choose_speaker"
        ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.speakerPicker}
          >
            {detail.participants.map((participant) => {
              const selected =
                manualSpeaker === participant.character_instance_id;
              return (
                <Pressable
                  key={participant.id}
                  onPress={() =>
                    setManualSpeaker(participant.character_instance_id)}
                  style={[
                    styles.speakerChip,
                    selected && styles.speakerChipActive,
                  ]}
                >
                  <CharacterAvatarForParticipant
                    participant={participant}
                    size={26}
                  />
                  <Text
                    style={[
                      styles.speakerChipText,
                      selected && { color: colors.text },
                    ]}
                  >
                    {participant.together_character_instances
                      .together_character_templates.name.split(" ")[0]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )
        : null}
      {replyTo
        ? (
          <View style={styles.replyPreview}>
            <View style={{ flex: 1 }}>
              <Text style={styles.replyLabel}>
                Replying to {replyTo.role === "assistant"
                  ? participantById.get(
                    String(
                      replyTo.speaker_character_instance_id ??
                        replyTo.character_instance_id,
                    ),
                  )?.together_character_instances.together_character_templates
                    .name.split(" ")[0]
                  : "your message"}
              </Text>
              <Text numberOfLines={1} style={styles.replyText}>
                {replyTo.content}
              </Text>
            </View>
            <Pressable onPress={() => setReplyTo(null)}>
              <X size={18} color={colors.muted} />
            </Pressable>
          </View>
        )
        : null}
      {pendingImage
        ? (
          <View style={styles.attachmentPreview}>
            <Image
              source={{ uri: pendingImage.uri }}
              style={styles.attachmentPreviewImage}
              contentFit="cover"
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.attachmentPreviewTitle}>
                Photo ready to share
              </Text>
              <Text style={styles.attachmentPreviewMeta}>
                {Math.max(1, Math.round(pendingImage.byteSize / 1024))} KB
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Remove selected photo"
              onPress={() => {
                cleanupNormalizedImage(pendingImage.uri);
                setPendingImage(null);
              }}
              style={styles.iconButton}
            >
              <X size={17} color={colors.text} />
            </Pressable>
          </View>
        )
        : null}
      {activeGroupPlan ? <GroupActivePlanBar
        plan={activeGroupPlan}
        participantCount={activeGroupPlan.participant_instance_ids?.length ?? detail.participants.length}
        locationName={activeGroupPlan.together_locations?.name ?? snapshot?.locations.find((location) => location.id === activeGroupPlan.location_id)?.name}
        busy={planActionBusyId === activeGroupPlan.id || busy}
        onDetails={() => router.push(`/plan/${activeGroupPlan.id}` as never)}
        onChange={() => openGroupPlanner(true)}
        onEnd={() => requestEndGroupPlan(activeGroupPlan)}
      /> : waitingGroupPlan ? <GroupPlanWaitingBar
        plan={waitingGroupPlan}
        locationName={waitingGroupPlan.together_locations?.name ?? snapshot?.locations.find((location) => location.id === waitingGroupPlan.location_id)?.name}
        onDetails={() => router.push(`/plan/${waitingGroupPlan.id}` as never)}
      /> : joinableGroupPlan ? <GroupPlanJoinBar
        plan={joinableGroupPlan}
        locationName={joinableGroupPlan.together_locations?.name ?? snapshot?.locations.find((location) => location.id === joinableGroupPlan.location_id)?.name}
        busy={planActionBusyId === joinableGroupPlan.id}
        onJoin={() => void startGroupPlan(joinableGroupPlan)}
        onDetails={() => router.push(`/plan/${joinableGroupPlan.id}` as never)}
      /> : null}
      <GroupComposer
        conversationId={detail.conversation.id}
        characterInstanceId={String(
          detail.conversation.character_instance_id ??
            detail.participants[0]?.character_instance_id ?? "",
        )}
        groupName={detail.conversation.title ?? "the group"}
        input={input}
        hasPendingImage={Boolean(pendingImage)}
        sending={sending}
        canContinue={detail.messages.some((message) =>
          message.role === "assistant"
        )}
        onChange={setInput}
        onPhoto={openPhotoMenu}
        onSend={() => void sendPrepared()}
        onContinue={() =>
          void send("Keep talking among yourselves for a moment.", true)}
        onDictation={(text) =>
          setInput((current) => mergeDictationTranscript(current, text))}
        onDictationError={setError}
        onDictationStart={() => setActiveVoiceId(null)}
      />
      <Modal
        animationType="fade"
        transparent
        visible={showPhotoMenu}
        onRequestClose={() => setShowPhotoMenu(false)}
      >
        <Pressable
          style={styles.modalRoot}
          onPress={() => setShowPhotoMenu(false)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={styles.photoMenu}
          >
            <View style={styles.photoMenuHeader}>
              <View>
                <Text style={styles.detailsKicker}>PHOTO</Text>
                <Text style={styles.photoMenuTitle}>Choose what to send</Text>
              </View>
              <Pressable
                accessibilityLabel="Close photo options"
                onPress={() => setShowPhotoMenu(false)}
                style={styles.close}
              >
                <X size={19} color={colors.text} />
              </Pressable>
            </View>
            <Text style={styles.photoMenuLabel}>REQUEST FROM UP TO TWO</Text>
            <View style={styles.photoSubjectGrid}>
              {(detail?.participants ?? []).map((participant) => {
                const selected = photoSubjects.includes(
                    participant.character_instance_id,
                  ),
                  name = participant.together_character_instances
                    .together_character_templates.name.split(" ")[0];
                return (
                  <Pressable
                    key={participant.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() =>
                      togglePhotoSubject(participant.character_instance_id)}
                    style={[
                      styles.photoSubject,
                      selected && styles.photoSubjectSelected,
                    ]}
                  >
                    <CharacterAvatarForParticipant
                      participant={participant}
                      size={42}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.photoSubjectName,
                        selected && styles.photoSubjectNameSelected,
                      ]}
                    >
                      {name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              disabled={!photoSubjects.length || photoRequestBusy}
              onPress={() => void requestGroupPhoto()}
              style={[
                styles.photoRequestButton,
                (!photoSubjects.length || photoRequestBusy) && { opacity: .45 },
              ]}
            >
              {photoRequestBusy
                ? <ActivityIndicator color="#fff" />
                : <Camera size={18} color="#fff" />}
              <Text style={styles.photoRequestButtonText}>
                {photoSubjects.length === 2
                  ? "Request photo together"
                  : "Request photo"}
              </Text>
            </Pressable>
            <View style={styles.photoMenuDivider} />
            <Pressable
              onPress={() => {
                setShowPhotoMenu(false);
                void choosePhoto();
              }}
              style={styles.photoUploadButton}
            >
              <Upload size={18} color={colors.rose} />
              <View style={{ flex: 1 }}>
                <Text style={styles.photoUploadTitle}>Upload your photo</Text>
                <Text style={styles.photoUploadCopy}>
                  Share an image from your device with the group.
                </Text>
              </View>
              <ChevronRight size={18} color={colors.dimmed} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <GroupDetailsModal
        visible={showDetails}
        detail={detail}
        snapshot={snapshot}
        busy={busy}
        onClose={() => setShowDetails(false)}
        onBusy={setBusy}
        onChanged={(next) => setDetail(next)}
        onArchived={async () => {
          await refresh();
          router.replace(MESSAGES_INBOX_HREF as never);
        }}
      />
      <GroupChatSettingsModal
        visible={showChatSettings}
        conversation={detail.conversation}
        onClose={() => setShowChatSettings(false)}
        onSaved={(conversation) => {
          setDetail((current) => current
            ? { ...current, conversation }
            : current);
        }}
      />
        </View>
        {showRightRail && contextParticipant && snapshot
          ? <GroupContextRail
            snapshot={snapshot}
            detail={detail}
            participant={contextParticipant}
            activePlan={activeGroupPlan}
            onCycle={(direction) => {
              const currentIndex = Math.max(0, detail.participants.findIndex(
                (item) => item.character_instance_id ===
                  contextParticipant.character_instance_id,
              ));
              const nextIndex = (currentIndex + direction +
                detail.participants.length) % detail.participants.length;
              setContextParticipantId(
                detail.participants[nextIndex]!.character_instance_id,
              );
            }}
            onSelect={setContextParticipantId}
            onPlan={() => openGroupPlanner(false)}
          />
          : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function GroupComposer({
  conversationId,
  characterInstanceId,
  groupName,
  input,
  hasPendingImage,
  sending,
  canContinue,
  onChange,
  onPhoto,
  onSend,
  onContinue,
  onDictation,
  onDictationError,
  onDictationStart,
}: {
  conversationId: string;
  characterInstanceId: string;
  groupName: string;
  input: string;
  hasPendingImage: boolean;
  sending: boolean;
  canContinue: boolean;
  onChange: (value: string) => void;
  onPhoto: () => void;
  onSend: () => void;
  onContinue: () => void;
  onDictation: (value: string) => void;
  onDictationError: (value: string) => void;
  onDictationStart: () => void;
}) {
  const [composerFocused, setComposerFocused] = useState(false);
  const dictation = useChatDictation({
      conversationId,
      characterInstanceId,
      disabled: sending || !characterInstanceId,
      onBeforeStart: onDictationStart,
      onTranscript: onDictation,
      onError: onDictationError,
    }),
    dictationBusy = dictation.phase !== "idle",
    overLimit = input.length > MESSAGE_CHARACTER_LIMIT,
    continueMode = !input.trim() && !hasPendingImage,
    disabled = sending || dictationBusy || overLimit ||
      (continueMode && !canContinue);
  return (
    <View style={styles.composerWrap}>
      <View style={styles.composer}>
        <View style={[
          styles.composerInputShell,
          composerFocused && styles.composerInputFocused,
        ]}>
          <GroupMediaButton
            name={groupName}
            disabled={sending || dictationBusy}
            onPress={onPhoto}
          />
          <TextInput
            accessibilityLabel="Message group"
            value={input}
            onChangeText={onChange}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            editable={!dictationBusy}
            placeholder={dictation.phase === "recording"
              ? "Listening…"
              : dictation.phase === "transcribing"
              ? "Turning voice into text…"
              : `Message ${groupName}…`}
            placeholderTextColor={colors.dimmed}
            multiline
            textAlignVertical="top"
            style={styles.composerInput}
          />
          <GroupDictationButton
            phase={dictation.phase}
            elapsedMs={dictation.elapsedMs}
            disabled={sending}
            onPress={() => void dictation.toggle()}
          />
        </View>
        <Pressable
          accessibilityLabel={continueMode
            ? "Let the group keep talking"
            : "Send message"}
          disabled={disabled}
          onPress={continueMode ? onContinue : onSend}
          style={[
            styles.send,
            continueMode && styles.continueButton,
            disabled && styles.sendDisabled,
          ]}
        >
          {sending
            ? <ActivityIndicator color="#fff" size="small" />
            : continueMode
            ? <Sparkles size={19} color="#fff" />
            : <Send size={19} color="#fff" />}
        </Pressable>
      </View>
      <MessageCharacterCounter value={input} />
    </View>
  );
}

function GroupMediaButton({
  name,
  disabled,
  onPress,
}: {
  name: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);
  return (
    <Pressable
      accessibilityLabel={`Open photo options for ${name}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.mediaButton,
        pressed && styles.mediaButtonPressed,
        disabled && styles.sendDisabled,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.mediaButtonGlow,
          {
            opacity: glow.interpolate({
              inputRange: [0, 1],
              outputRange: [.28, .72],
            }),
            transform: [{
              scale: glow.interpolate({
                inputRange: [0, 1],
                outputRange: [.9, 1.16],
              }),
            }],
          },
        ]}
      />
      <ImagePlus size={21} color="#E5D7FF" strokeWidth={1.7} />
    </Pressable>
  );
}

function GroupDictationButton({
  phase,
  elapsedMs,
  disabled,
  onPress,
}: {
  phase: ChatDictationPhase;
  elapsedMs: number;
  disabled: boolean;
  onPress: () => void;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (phase !== "recording") {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000)),
    label = phase === "recording"
      ? `Stop voice-to-text recording. ${Math.floor(seconds / 60)} minutes ${
        seconds % 60
      } seconds.`
      : phase === "transcribing"
      ? "Turning voice into text."
      : "Start voice-to-text.",
    buttonDisabled = phase === "transcribing" ||
      (phase === "idle" && disabled);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityState={{
        disabled: buttonDisabled,
        busy: phase === "transcribing",
      }}
      disabled={buttonDisabled}
      onPress={onPress}
      style={[
        styles.dictationButton,
        phase === "recording" && styles.dictationRecording,
        buttonDisabled && styles.sendDisabled,
      ]}
    >
      {phase === "recording"
        ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.dictationPulse,
              {
                opacity: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [.18, .52],
                }),
                transform: [{
                  scale: pulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [.82, 1.12],
                  }),
                }],
              },
            ]}
          />
        )
        : null}
      {phase === "transcribing"
        ? <ActivityIndicator color="#D9C7FF" size="small" />
        : phase === "recording"
        ? <Square size={13} color="#fff" fill="#fff" />
        : <Mic size={20} color="#D9C7FF" strokeWidth={1.9} />}
    </Pressable>
  );
}

function GroupAmbientGlow({ compact }: { compact: boolean }) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.glowLayer}
    >
      <View
        style={[
          styles.glowOrb,
          styles.glowRose,
          compact && styles.glowRoseCompact,
        ]}
      />
      <View
        style={[
          styles.glowOrb,
          styles.glowViolet,
          compact && styles.glowVioletCompact,
        ]}
      />
      <View
        style={[
          styles.glowOrb,
          styles.glowCenter,
          compact && styles.glowCenterCompact,
        ]}
      />
    </View>
  );
}

function GroupHeader(
  { detail, worldName, onDetails }: {
    detail: GroupDetail;
    worldName?: string;
    onDetails: () => void;
  },
) {
  return (
    <View style={styles.header}>
      <Link href={MESSAGES_INBOX_HREF as never} dismissTo asChild>
        <Pressable
          accessibilityLabel="Back to Messages"
          style={styles.headerButton}
        >
          <ChevronLeft size={25} color={colors.text} />
        </Pressable>
      </Link>
      <Pressable onPress={onDetails} style={styles.headerMain}>
        <AvatarStack participants={detail.participants} />
        <View style={styles.headerCopy}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {detail.conversation.title}
          </Text>
          <Text style={styles.headerSub}>
            {worldName ? `${worldName} · ` : ""}
            {detail.participants.length} companions
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel="Group details"
        onPress={onDetails}
        style={styles.headerButton}
      >
        <MoreHorizontal size={21} color={colors.text} />
      </Pressable>
    </View>
  );
}
function GroupConversationMenu({title,hasActivePlan,favorite,favoriteBusy,onClose,onDetails,onCreatePlan,onChangePlan,onEndPlan,onFavorite,onSettings,onFresh,onDelete}:{title:string;hasActivePlan:boolean;favorite:boolean;favoriteBusy:boolean;onClose:()=>void;onDetails:()=>void;onCreatePlan:()=>void;onChangePlan:()=>void;onEndPlan:()=>void;onFavorite:()=>void;onSettings:()=>void;onFresh:()=>void;onDelete:()=>void}) {
  const actions={createPlan:onCreatePlan,changePlan:onChangePlan,endPlan:onEndPlan};
  return <FrostedSurface intensity={88} style={styles.groupMenu}>
    <View style={styles.groupMenuTop}><Text numberOfLines={1} style={styles.groupMenuTitle}>{title}</Text><Pressable onPress={onClose}><Text style={styles.groupMenuClose}>Close</Text></Pressable></View>
    <Text style={styles.groupMenuSection}>GROUP</Text>
    <Pressable accessibilityRole="button" accessibilityState={{selected:favorite,disabled:favoriteBusy}} disabled={favoriteBusy} onPress={onFavorite} style={styles.groupMenuFavorite}><Star size={15} color={favorite?'#FFD27A':colors.muted} fill={favorite?'#FFD27A':'transparent'}/><Text style={styles.groupMenuItemText}>{favorite?'Remove from favorites':'Add to favorites'}</Text></Pressable>
    <Pressable onPress={onDetails} style={styles.groupMenuItem}><Text style={styles.groupMenuItemText}>Group details</Text></Pressable>
    <Text style={styles.groupMenuSection}>PLAN</Text>
    {conversationPlanMenuItems(hasActivePlan).map((item)=><Pressable key={item.key} onPress={actions[item.key]} style={styles.groupMenuItem}><Text style={[styles.groupMenuItemText,item.danger&&{color:colors.danger}]}>{item.label}</Text></Pressable>)}
    <Text style={styles.groupMenuSection}>CONVERSATION</Text>
    <Pressable onPress={onSettings} style={styles.groupMenuItem}><Text style={styles.groupMenuItemText}>Edit chat settings</Text></Pressable>
    <Pressable onPress={onFresh} style={styles.groupMenuItem}><Text style={styles.groupMenuItemText}>Start a fresh chat</Text></Pressable>
    <Text style={styles.groupMenuSection}>MANAGE</Text>
    <Pressable onPress={onDelete} style={styles.groupMenuItem}><Text style={[styles.groupMenuItemText,{color:colors.danger}]}>Delete this conversation</Text></Pressable>
  </FrostedSurface>;
}
function GroupLocationPlanSuggestion({action,participants,locationRecord,busy,onAccept,onChange,onDismiss}:{action:ConversationAction;participants:GroupParticipant[];locationRecord?:Location;busy:boolean;onAccept:(timing:"now"|"in_one_hour")=>void;onChange:()=>void;onDismiss:()=>void}) {
  const location=String(action.payload.location??"that place"),worldSlug=typeof action.payload.worldSlug==="string"?action.payload.worldSlug:undefined,locationSlug=typeof action.payload.locationSlug==="string"?action.payload.locationSlug:undefined;
  const hours=placeHoursStatus(locationRecord?.hours);
  return <View style={styles.groupPlanSuggestion}>
    <View style={styles.groupPlanSuggestionHero}>
      <Image source={locationHeroAsset(worldSlug,locationSlug)} style={StyleSheet.absoluteFill} contentFit="cover"/>
      <View style={styles.groupPlanSuggestionShade}/>
      <View style={styles.groupPlanSuggestionCopy}><View style={styles.groupPlanSuggestionTop}><Text style={styles.groupPlanEventKicker}>PLAN WITH THE GROUP</Text><Pressable accessibilityLabel="Dismiss group plan suggestion" disabled={busy} onPress={onDismiss} style={styles.groupPlanSuggestionClose}><X size={16} color="#fff"/></Pressable></View><Text style={styles.groupPlanSuggestionTitle}>Go to {location} together?</Text><View style={styles.groupPlanInvitationPeople}><AvatarStack participants={participants}/><Text numberOfLines={1} style={styles.groupPlanSuggestionBody}>{groupCompanionLabel(participants)}</Text></View><Text style={[styles.groupPlanSuggestionBody,hours.state==='open'?styles.groupPlanHoursOpen:hours.state==='closed'?styles.groupPlanHoursClosed:undefined]}>{hours.statusLabel} · {hours.scheduleLabel}</Text></View>
    </View>
    <View style={styles.groupPlanSuggestionActions}><Pressable disabled={busy} onPress={()=>onAccept("now")} style={[styles.groupPlanPrimary,busy&&styles.groupPlanDisabled]}><Text style={styles.groupPlanPrimaryText}>{busy?"SAVING…":"NOW"}</Text></Pressable><Pressable disabled={busy} onPress={()=>onAccept("in_one_hour")} style={styles.groupPlanSecondary}><Text style={styles.groupPlanSuggestionSecondaryText}>IN 1 HOUR</Text></Pressable><Pressable disabled={busy} onPress={onChange} style={styles.groupPlanSuggestionChange}><CalendarDays size={14} color={colors.rose}/><Text style={styles.groupPlanSuggestionChangeText}>PICK ANOTHER TIME</Text></Pressable></View>
  </View>;
}
function GroupPlanTimelineEvent({event,plan,participants,groupLabel,busy,onOpen,onStart,onEnd,onCancel}:{event:ConversationEvent;plan?:SharedPlan;participants:GroupParticipant[];groupLabel:string;busy:boolean;onOpen:(plan:SharedPlan)=>void;onStart:(plan:SharedPlan)=>void;onEnd:(plan:SharedPlan)=>void;onCancel:(plan:SharedPlan)=>void}) {
  if(isPlanLifecycleDividerEvent(event)){
    const direct=planLifecycleDividerLabel(event,groupLabel);
    const action=event.event_type==='plan_created'?'scheduled':event.event_type==='plan_joined'?'started':'ended';
    const label=direct?`Plan ${action} with ${groupLabel}`:null;
    return label?<View><View accessibilityRole="text" accessibilityLabel={label} style={styles.planLifecycleDivider}><View style={styles.planLifecycleLine}/><Text style={styles.planLifecycleText}>{label}</Text><View style={styles.planLifecycleLine}/></View>{plan&&event.event_type!=='plan_completed'?<GroupPlanResponseStrip plan={plan} participants={participants}/>:null}</View>:null;
  }
  const metadata=event.metadata??{},title=String(metadata.title??plan?.title??'Group plan'),starts=String(metadata.startsAt??plan?.starts_at??''),location=String(metadata.location??plan?.together_locations?.name??'');
  const availability=plan?planActionAvailability(plan):null;
  return <View style={styles.groupPlanEvent}>
    <Pressable disabled={!plan} onPress={()=>plan&&onOpen(plan)} style={styles.groupPlanEventMain}>
      <CalendarDays size={18} color={colors.rose}/><View style={{flex:1,minWidth:0}}><Text style={styles.groupPlanEventKicker}>{event.event_type==='plan_cancelled'?'PLAN CANCELLED':event.event_type==='plan_switched'||event.event_type==='plan_rescheduled'?'PLAN CHANGED':'GROUP PLAN'}</Text><Text style={styles.groupPlanEventTitle}>{title}</Text>{starts?<Text style={styles.groupPlanEventMeta}>{new Date(starts).toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}{location?` · ${location}`:''}</Text>:null}</View>{plan?<ChevronRight size={16} color={colors.muted}/>:null}
    </Pressable>
    {plan&&(availability?.primary||availability?.canEnd||availability?.canCancel)?<View style={styles.groupPlanEventActions}>{availability.primary?<Pressable disabled={busy||!availability.primaryEnabled} onPress={()=>onStart(plan)} style={[styles.groupPlanPrimary,(busy||!availability.primaryEnabled)&&styles.groupPlanDisabled]}><Play size={13} color="#fff" fill="#fff"/><Text style={styles.groupPlanPrimaryText}>{busy?'Starting…':'Join plan'}</Text></Pressable>:null}{availability.canEnd?<Pressable disabled={busy} onPress={()=>onEnd(plan)} style={styles.groupPlanSecondary}><Text style={styles.groupPlanDangerText}>End plan</Text></Pressable>:null}{availability.canCancel?<Pressable disabled={busy} onPress={()=>onCancel(plan)} style={styles.groupPlanSecondary}><Text style={styles.groupPlanDangerText}>Cancel plan</Text></Pressable>:null}</View>:null}
  </View>;
}
function GroupActivePlanBar({plan,participantCount,locationName,busy,onDetails,onChange,onEnd}:{plan:SharedPlan;participantCount:number;locationName?:string;busy:boolean;onDetails:()=>void;onChange:()=>void;onEnd:()=>void}) {
  const[now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
  const start=new Date(plan.starts_at).getTime(),end=new Date(plan.ends_at).getTime(),duration=Math.max(1,end-start),progress=Math.max(0,Math.min(1,(now-start)/duration)),remaining=Math.max(0,end-now);
  const remainingLabel=remaining<60000?'ending soon':`${Math.ceil(remaining/60000)} min left`;
  return <View style={styles.groupPlanBar}><View style={styles.groupPlanBarIcon}><CalendarDays size={17} color={colors.rose}/></View><Pressable accessibilityRole="button" accessibilityLabel={`Open active group plan, ${plan.title}`} onPress={onDetails} style={styles.groupPlanBarContent}><View style={styles.groupPlanBarHeading}><Text style={styles.groupPlanBarKicker}>TOGETHER NOW · {participantCount} COMPANIONS</Text><Text style={styles.groupPlanBarClock}>{remainingLabel}</Text></View><Text numberOfLines={1} style={styles.groupPlanBarTitle}>{plan.title}</Text><Text numberOfLines={1} style={styles.groupPlanBarMeta}>{locationName??'Shared place'}</Text><View style={styles.groupPlanProgressTrack}><View style={[styles.groupPlanProgressFill,{width:`${Math.round(progress*100)}%`}]}/></View></Pressable><View style={styles.groupPlanBarButtons}><Pressable accessibilityRole="button" accessibilityLabel="Change active group plan" disabled={busy} onPress={onChange} style={styles.groupPlanBarAction}><Text style={styles.groupPlanBarActionText}>Change</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="End active group plan" disabled={busy} onPress={onEnd} style={styles.groupPlanBarAction}><Text style={[styles.groupPlanBarActionText,{color:colors.danger}]}>{busy?'Ending…':'End'}</Text></Pressable></View></View>;
}
function GroupPlanResponseStrip({plan,participants}:{plan:SharedPlan;participants:GroupParticipant[]}){
  const responses=participants.filter((participant)=>(plan.participant_instance_ids??[plan.character_instance_id]).includes(participant.character_instance_id)).map((participant)=>({participant,response:plan.participant_responses?.find((item)=>item.character_instance_id===participant.character_instance_id)}));
  if(!responses.length)return null;
  return <View style={styles.groupPlanResponses}>{responses.map(({participant,response})=>{const lateWithoutArrival=plan.status==='active'&&Date.now()>new Date(plan.starts_at).getTime()+5*60000&&response?.response_state!=='arrived';const state=lateWithoutArrival?'late':response?.response_state??'going',label=state==='arrived'?'Here':state==='late'?'Late':state==='declined'?'Declined':state==='unavailable'?'Unavailable':'Going';return <View key={participant.character_instance_id} accessibilityLabel={`${participant.together_character_instances.together_character_templates.name}: ${label}`} style={styles.groupPlanResponse}><CharacterAvatarForParticipant participant={participant} size={25}/><View style={[styles.groupPlanResponseDot,['going','arrived'].includes(state)?styles.groupPlanResponseReady:state==='late'?styles.groupPlanResponseLate:styles.groupPlanResponseUnavailable]}/><Text numberOfLines={1} style={styles.groupPlanResponseText}>{participant.together_character_instances.together_character_templates.name.split(' ')[0]} · {label}</Text></View>;})}</View>;
}
function GroupPlanWaitingBar({plan,locationName,onDetails}:{plan:SharedPlan;locationName?:string;onDetails:()=>void}) {
  const startsAt=plan.starts_at?new Date(plan.starts_at):null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open upcoming group plan, ${plan.title}`} onPress={onDetails} style={styles.groupPlanBar}><View style={styles.groupPlanBarIcon}><CalendarDays size={17} color={colors.rose}/></View><View style={{flex:1,minWidth:0}}><Text style={styles.groupPlanBarKicker}>YOU’RE EARLY</Text><Text numberOfLines={1} style={styles.groupPlanBarTitle}>{plan.title}</Text><Text numberOfLines={1} style={styles.groupPlanBarMeta}>{locationName??'Shared place'}{startsAt?` · begins ${startsAt.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`:' · waiting for the group'}</Text></View><ChevronRight size={16} color={colors.muted}/></Pressable>;
}
function GroupPlanJoinBar({plan,locationName,busy,onJoin,onDetails}:{plan:SharedPlan;locationName?:string;busy:boolean;onJoin:()=>void;onDetails:()=>void}) {
  return <View style={styles.groupPlanBar}><View style={styles.groupPlanBarIcon}><CalendarDays size={17} color={colors.rose}/></View><Pressable accessibilityRole="button" accessibilityLabel={`Open group plan, ${plan.title}`} onPress={onDetails} style={{flex:1,minWidth:0}}><Text style={styles.groupPlanBarKicker}>GROUP PLAN</Text><Text numberOfLines={1} style={styles.groupPlanBarTitle}>{plan.title}</Text><Text numberOfLines={1} style={styles.groupPlanBarMeta}>{locationName??'Shared place'} · ready to start</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Join group plan, ${plan.title}`} disabled={busy} onPress={onJoin} style={[styles.groupPlanJoin,busy&&styles.groupPlanDisabled]}>{busy?<ActivityIndicator size="small" color="#fff"/>:<Play size={13} color="#fff" fill="#fff"/>}<Text style={styles.groupPlanPrimaryText}>{busy?'Joining…':'Join'}</Text></Pressable></View>;
}
function AvatarStack({ participants }: { participants: GroupParticipant[] }) {
  return (
    <View style={styles.avatarStack}>
      {participants.slice(0, 3).map((participant, index) => (
        <View
          key={participant.id}
          style={[styles.avatarStackItem, {
            left: index * 14,
            zIndex: 3 - index,
          }]}
        >
          <CharacterAvatarForParticipant participant={participant} size={34} />
        </View>
      ))}
    </View>
  );
}
function CharacterAvatarForParticipant(
  { participant, size }: { participant: GroupParticipant; size: number },
) {
  const character = participant.together_character_instances,
    template = character.together_character_templates;
  return (
    <CharacterAvatar
      slug={template.slug}
      name={template.name}
      template={template}
      version={character.together_character_versions}
      size={size}
    />
  );
}
function GroupContextRail({
  snapshot,
  detail,
  participant,
  activePlan,
  onCycle,
  onSelect,
  onPlan,
}: {
  snapshot: Snapshot;
  detail: GroupDetail;
  participant: GroupParticipant;
  activePlan: SharedPlan | null;
  onCycle: (direction: -1 | 1) => void;
  onSelect: (characterInstanceId: string) => void;
  onPlan: () => void;
}) {
  const character = participant.together_character_instances,
    template = character.together_character_templates,
    currentIndex = Math.max(0, detail.participants.findIndex((item) =>
      item.character_instance_id === participant.character_instance_id
    )),
    location = character.current_location_id
      ? snapshot.locations.find((item) => item.id === character.current_location_id)
          ?.name ?? "Home"
      : "Home",
    memories = snapshot.memories.filter((item) =>
      item.character_instance_id === character.id
    ).slice(0, 3),
    story = snapshot.storyArcs?.find((item) =>
      item.character_instance_id === character.id && item.status === "active"
    ),
    plans = [...new Map([
      ...detail.sharedPlans,
      ...snapshot.sharedPlans,
    ].map((plan) => [plan.id, plan])).values()].filter((plan) =>
      (plan.participant_instance_ids ?? [plan.character_instance_id]).includes(
        character.id,
      ) && ["scheduled", "active"].includes(plan.status)
    ).sort((left, right) =>
      new Date(left.starts_at ?? 0).getTime() -
      new Date(right.starts_at ?? 0).getTime()
    ),
    nextPlan = activePlan ?? plans[0] ?? null,
    portrait = resolveCharacterPortraitSource(
      template,
      character.together_character_versions,
      template.slug,
    );
  return (
    <ScrollView
      style={styles.rightRail}
      contentContainerStyle={styles.rightRailContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.memberNavigator}>
        <Pressable
          accessibilityLabel="Previous group member"
          onPress={() => onCycle(-1)}
          style={styles.memberCycleButton}
        >
          <ChevronLeft size={17} color={colors.text} />
        </Pressable>
        <Text style={styles.memberCounter}>
          {currentIndex + 1} OF {detail.participants.length}
        </Text>
        <Pressable
          accessibilityLabel="Next group member"
          onPress={() => onCycle(1)}
          style={styles.memberCycleButton}
        >
          <ChevronRight size={17} color={colors.text} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.memberStrip}
      >
        {detail.participants.map((item) => {
          const selected = item.character_instance_id === character.id;
          return (
            <Pressable
              key={item.id}
              accessibilityLabel={`Show ${item.together_character_instances.together_character_templates.name}`}
              accessibilityState={{ selected }}
              onPress={() => onSelect(item.character_instance_id)}
              style={[styles.memberThumb, selected && styles.memberThumbActive]}
            >
              <CharacterAvatarForParticipant participant={item} size={31} />
            </Pressable>
          );
        })}
      </ScrollView>
      {portrait
        ? (
          <Image
            source={portrait}
            style={styles.contextPortrait}
            contentFit="cover"
            contentPosition="top"
          />
        )
        : (
          <View style={styles.contextPortraitFallback}>
            <CharacterAvatarForParticipant participant={participant} size={104} />
          </View>
        )}
      <Text style={styles.contextName}>{template.name}</Text>
      <Text style={styles.contextBio}>
        {template.occupation} · {groupRelationshipLabel(character.relationship_stage)}
      </Text>

      {nextPlan
        ? (
          <GroupContextSection title={nextPlan.status === "active" ? "TOGETHER NOW" : "NEXT TOGETHER"}>
            <Pressable
              onPress={() => router.push(`/plan/${nextPlan.id}` as never)}
            >
              <GroupContextLine
                icon={<CalendarDays size={15} color={colors.rose} />}
                title={nextPlan.title}
                body={nextPlan.status === "active"
                  ? nextPlan.together_locations?.name ?? "Group plan in progress"
                  : `${new Date(nextPlan.starts_at).toLocaleString([], {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}${nextPlan.together_locations?.name
                    ? ` · ${nextPlan.together_locations.name}`
                    : ""}`}
              />
            </Pressable>
          </GroupContextSection>
        )
        : null}

      <GroupContextSection title={`${template.name.split(" ")[0]!.toUpperCase()} RIGHT NOW`}>
        <GroupContextLine
          icon={<MapPin size={15} color={colors.warm} />}
          title={location === "Home" ? "Home" : `At ${location}`}
          body={character.current_activity || "Taking some private time"}
        />
      </GroupContextSection>

      {story
        ? (
          <GroupContextSection title="CURRENT STORY">
            <GroupContextLine
              icon={<Sparkles size={15} color={colors.violet} />}
              title={story.together_story_arc_templates?.title ?? "Your story"}
              body={story.together_story_arc_templates?.chapters.find((chapter) =>
                chapter.id === story.current_chapter_id
              )?.title ?? "In progress"}
            />
          </GroupContextSection>
        )
        : null}

      <GroupContextSection title={`WHAT ${template.name.split(" ")[0]!.toUpperCase()} REMEMBERS`}>
        {memories.length
          ? memories.map((memory) => (
            <Pressable
              key={memory.id}
              onPress={() => router.push(`/memories?character=${template.slug}` as never)}
              style={styles.contextMemoryLine}
            >
              <Brain size={14} color={memory.pinned ? colors.rose : colors.violet} />
              <Text numberOfLines={2} style={styles.contextCopy}>
                {presentMemoryText(memory.canonical_text, template.name)}
              </Text>
            </Pressable>
          ))
          : <Text style={styles.contextMuted}>Meaningful details will collect here.</Text>}
      </GroupContextSection>

      {!activePlan
        ? (
          <Pressable onPress={onPlan} style={styles.contextPlanButton}>
            <CalendarDays size={17} color="#fff" />
            <Text style={styles.contextPlanButtonText}>Plan with the group</Text>
          </Pressable>
        )
        : null}
      <Pressable
        onPress={() => router.push(`/character/${template.slug}` as never)}
        style={styles.contextSecondaryButton}
      >
        <Text style={styles.contextSecondaryButtonText}>View profile</Text>
        <ChevronRight size={16} color={colors.rose} />
      </Pressable>
      <Pressable
        onPress={() => router.push(`/memories?character=${template.slug}` as never)}
        style={styles.contextSecondaryButton}
      >
        <Brain size={16} color={colors.rose} />
        <Text style={styles.contextSecondaryButtonText}>Memory Center</Text>
      </Pressable>
    </ScrollView>
  );
}

function GroupContextSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.contextSection}>
      <Text style={styles.contextSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function GroupContextLine({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.contextLine}>
      <View style={styles.contextLineIcon}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={styles.contextLineTitle}>{title}</Text>
        <Text numberOfLines={2} style={styles.contextCopy}>{body}</Text>
      </View>
    </View>
  );
}

function groupRelationshipLabel(stage: string) {
  return ({
    stranger: "You just met",
    acquaintance: "Getting acquainted",
    friend: "A real friendship",
    flirting: "There is a spark",
    dating: "You are dating",
    exclusive: "Choosing each other",
    long_term: "Building a life",
  } as Record<string, string>)[stage] ?? "Getting closer";
}
function GroupBubble({
  message,
  participant,
  grouped,
  reactions,
  participants,
  media,
  offer,
  offerBusy,
  activeVoiceId,
  onVoiceActive,
  onOfferAccept,
  onOfferDecline,
  onMediaRetry,
  onReply,
  voiceVisible,
  voiceEnabled,
  onRetry,
  textStyle,
}: {
  message: Message;
  participant?: GroupParticipant;
  grouped: boolean;
  reactions: MessageReaction[];
  participants: Map<string, GroupParticipant>;
  media: GeneratedMedia[];
  offer?: MediaOffer;
  offerBusy: boolean;
  activeVoiceId: string | null;
  onVoiceActive: (id: string | null) => void;
  onOfferAccept: (offer: MediaOffer) => void;
  onOfferDecline: (offer: MediaOffer) => void;
  onMediaRetry: (media: GeneratedMedia) => void;
  onReply: () => void;
  voiceVisible: boolean;
  voiceEnabled: boolean;
  onRetry?:()=>void;
  textStyle: { fontSize: number; lineHeight: number };
}) {
  const opacity = useRef(new Animated.Value(0)).current,
    translate = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(translate, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translate]);
  const user = message.role === "user",
    mediaOnly = message.provider_metadata?.mediaOnly === true,
    attachments = message.attachments ??
      message.together_conversation_attachments ?? [],
    images = visibleChatPhotoMedia(media),
    offerMedia = photoMediaForOffer(media,offer?.generated_media_id),
    visibleImages = mediaWithoutActivePhotoOffer(images,offer?offerMedia?.id:null),
    hasMediaSurface = Boolean(
      offer || attachments.length || visibleImages.length,
    ),
    voice = media.find((item) => item.media_type === "voice_note"),
    speakerName =
      participant?.together_character_instances.together_character_templates
        .name.split(" ")[0] ??
        String(message.provider_metadata?.speakerName ?? "Companion"),
    offerPreviewSources =
      (offer?.subject_character_instance_ids?.length
        ? offer.subject_character_instance_ids
        : offer
        ? [offer.character_instance_id]
        : []).map((id) => {
          const subject = participants.get(id)?.together_character_instances;
          return subject
            ? resolveCharacterPortraitSource(
              subject.together_character_templates,
              subject.together_character_versions,
              subject.together_character_templates.slug,
            )
            : undefined;
        }).filter(Boolean) as Array<
          Exclude<ReturnType<typeof resolveCharacterPortraitSource>, undefined>
        >;
  const messageActions = () =>
    Alert.alert("Message actions", undefined, [
      { text: "Reply", onPress: onReply },
      {
        text: "Copy",
        onPress: () => void Clipboard.setStringAsync(message.content),
      },
      ...(!user
        ? [{
          text: "Report response",
          onPress: () => void reportMessage(message.id, "other"),
        }]
        : []),
      { text: "Cancel", style: "cancel" },
    ] as never);
  return (
    <Animated.View
      style={[
        styles.messageRow,
        user ? styles.userRow : styles.assistantRow,
        grouped && styles.groupedRow,
        { opacity, transform: [{ translateY: translate }] },
      ]}
    >
      {!user
        ? (
          <View style={styles.portraitSlot}>
            {!grouped && participant
              ? (
                <Pressable
                  accessibilityLabel={`View ${speakerName}'s profile`}
                  onPress={() =>
                    router.push(
                      `/character/${participant.together_character_instances.together_character_templates.slug}` as never,
                    )}
                >
                  <CharacterAvatarForParticipant
                    participant={participant}
                    size={28}
                  />
                </Pressable>
              )
              : null}
          </View>
        )
        : null}
      <View
        style={[
          styles.bubbleWrap,
          hasMediaSurface && styles.mediaBubbleWrap,
          user && { alignItems: "flex-end" },
        ]}
      >
        {!user && !grouped
          ? (
            <Pressable
              onPress={() =>
                participant && router.push(
                  `/character/${participant.together_character_instances.together_character_templates.slug}` as never,
                )}
            >
              <Text style={styles.speakerName}>{speakerName}</Text>
            </Pressable>
          )
          : null}
        {message.content !== "[Photo]" || attachments.length ||
            visibleImages.length
          ? (
            <Pressable
              onPress={message.delivery_status==="failed"?onRetry:undefined}
              onLongPress={messageActions}
              style={[
                styles.bubble,
                user ? styles.userBubble : styles.assistantBubble,
                message.delivery_status==="failed"&&{borderColor:colors.danger,borderWidth:1},
              ]}
            >
              {message.content !== "[Photo]"
                ? <Text style={[styles.bubbleText, textStyle]}>{message.content}</Text>
                : null}
              {attachments.map((attachment) => (
                <Pressable
                  key={attachment.id}
                  accessibilityLabel="Open shared photo"
                  onPress={() =>
                    attachment.signed_url &&
                    void Linking.openURL(attachment.signed_url)}
                >
                  <Image
                    source={privateStoredImageSource(
                      attachment.signed_url,
                      attachment.storage_path,
                    )}
                    style={styles.sharedImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                </Pressable>
              ))}
              {visibleImages.map((item) => (
                <MediaTile
                  key={item.id}
                  media={item}
                  style={styles.sharedImage}
                  onRetry={() => onMediaRetry(item)}
                  contentFit="contain"
                />
              ))}
              {!user && !mediaOnly && voiceVisible
                ? (
                  <GroupVoiceNote
                    message={message}
                    name={speakerName}
                    initialMedia={voice}
                    activeVoiceId={activeVoiceId}
                    onVoiceActive={onVoiceActive}
                    enabled={voiceEnabled}
                  />
                )
                : null}
              <View style={styles.messageTimeRow}>
                {message.delivery_status==="failed"?<Text style={[styles.timestamp,{color:colors.danger}]}>Not sent · Tap to retry</Text>:null}
                <Text style={styles.timestamp}>
                  {new Date(message.created_at).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            </Pressable>
          )
          : null}
        {offer
          ? (
            <ChatPhotoRequestCard
              offer={offer}
              media={offerMedia}
              previewSources={offerPreviewSources}
              busy={offerBusy}
              onAccept={() => onOfferAccept(offer)}
              onDecline={() => onOfferDecline(offer)}
              onBuyCredits={() => router.push("/subscription")}
              readyContentFit="contain"
              onRetry={media.find((item) =>
                  item.id === offer.generated_media_id
                )?.status === "failed"
                ? () => {
                  const failed = media.find((item) =>
                    item.id === offer.generated_media_id
                  );
                  if (failed) onMediaRetry(failed);
                }
                : undefined}
            />
          )
          : null}
        <View style={styles.bubbleMeta}>
          {reactions.map((reaction) => (
            <View key={reaction.id} style={styles.reaction}>
              <Text>{reaction.reaction}</Text>
              <Text style={styles.reactor}>
                {participants.get(reaction.reactor_character_instance_id)
                  ?.together_character_instances.together_character_templates
                  .name.split(" ")[0]}
              </Text>
            </View>
          ))}
          <Pressable onPress={onReply} hitSlop={8}>
            <Text style={styles.replyAction}>Reply</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

function GroupVoiceNote({
  message,
  name,
  initialMedia,
  activeVoiceId,
  onVoiceActive,
  enabled,
}: {
  message: Message;
  name: string;
  initialMedia?: GeneratedMedia;
  activeVoiceId: string | null;
  onVoiceActive: (id: string | null) => void;
  enabled: boolean;
}) {
  const [media, setMedia] = useState(initialMedia),
    [quote, setQuote] = useState<VoiceNoteQuote | null>(null),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const source = media?.status === "ready" && media.signed_url
      ? media.signed_url
      : null,
    player = useAudioPlayer(source, { updateInterval: 250 }),
    status = useAudioPlayerStatus(player),
    active = Boolean(media && activeVoiceId === media.id);
  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);
  useEffect(() => {
    if (!media || media.status === "ready" || media.status === "failed") return;
    const timer = setTimeout(() => {
      void refreshVoiceNote(media.id).then((result) => {
        setMedia(result.media);
        setFailed(result.media.status === "failed");
      }).catch(() => setFailed(true));
    }, 1600);
    return () => clearTimeout(timer);
  }, [media]);
  const generate = async (hideFuture = false) => {
    setBusy(true);
    setFailed(false);
    try {
      if (hideFuture) await hideVoiceNoteConfirmation();
      const result = await requestVoiceNote(message.id, crypto.randomUUID());
      if (result.media) setMedia(result.media);
      setQuote(null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const listen = async () => {
    if (!enabled) {
      router.push("/subscription");
      return;
    }
    if (source && media) {
      if (status.playing) {
        player.pause();
        onVoiceActive(null);
      } else {
        onVoiceActive(media.id);
        player.play();
      }
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const next = await quoteVoiceNote(message.id);
      if (await isVoiceNoteConfirmationHidden()) {
        if (next.canAfford) await generate();
        else setQuote(next);
      } else setQuote(next);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Pressable
        accessibilityLabel={status.playing
          ? "Pause voice note"
          : `${
            failed || media?.status === "failed" ? "Retry" : "Listen to"
          } ${name}`}
        disabled={busy}
        onPress={() => void listen()}
        style={voiceStyles.listen}
      >
        {busy || media && !source && media.status !== "failed"
          ? <ActivityIndicator size="small" color={colors.rose} />
          : source && status.playing
          ? <Pause size={13} color={colors.rose} />
          : source
          ? <Play size={13} color={colors.rose} />
          : <Volume2 size={13} color={enabled ? colors.rose : colors.muted} />}
        <Text
          style={[
            voiceStyles.listenText,
            !enabled && voiceStyles.listenTextLocked,
          ]}
        >
          {source
            ? (status.playing ? "Pause" : "Play")
            : !enabled
            ? "Listen · Kivelle+"
            : (failed || media?.status === "failed" ? "Retry" : "Listen")}
        </Text>
      </Pressable>
      <VoiceNotePurchaseModal
        visible={Boolean(quote)}
        name={name}
        creditCost={quote?.creditCost ?? 0}
        creditBalance={quote?.creditBalance ?? 0}
        busy={busy}
        onClose={() => setQuote(null)}
        onConfirm={(hide) => void generate(hide)}
        onBuyCredits={() => {
          setQuote(null);
          router.push("/subscription");
        }}
      />
    </>
  );
}
function TypingIndicator(
  { people }: { people: Array<{ id: string; name: string }> },
) {
  const pulse = useRef(new Animated.Value(.25)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: .25,
          duration: 520,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={styles.typing}>
      <Animated.View style={[styles.typingDot, { opacity: pulse }]} />
      <Animated.View style={[styles.typingDot, { opacity: pulse }]} />
      <Animated.View style={[styles.typingDot, { opacity: pulse }]} />
      <Text style={styles.typingText}>
        {people.map((person) => person.name.split(" ")[0]).join(" and ")}{" "}
        {people.length > 1 ? "are" : "is"} typing…
      </Text>
    </View>
  );
}

function GroupDetailsModal({
  visible,
  detail,
  snapshot,
  busy,
  onClose,
  onBusy,
  onChanged,
  onArchived,
}: {
  visible: boolean;
  detail: GroupDetail;
  snapshot: Snapshot | null;
  busy: boolean;
  onClose: () => void;
  onBusy: (value: boolean) => void;
  onChanged: (detail: GroupDetail) => void;
  onArchived: () => void;
}) {
  const [title, setTitle] = useState(detail.conversation.title ?? ""),
    [adding, setAdding] = useState(false),
    [mutationError,setMutationError]=useState("");
  useEffect(() => setTitle(detail.conversation.title ?? ""), [
    detail.conversation.title,
  ]);
  useEffect(() => {
    if (visible) setMutationError("");
  }, [visible]);
  const active = new Set(
      detail.participants.map((participant) =>
        participant.character_instance_id
      ),
    ),
    anchor = detail.participants[0]?.together_character_instances,
    groupWorldId = detail.conversation.group_world_id ??
      (snapshot && anchor
        ? characterResidentWorld(snapshot, anchor)?.id
        : undefined),
    groupWorld = snapshot?.worlds.find((world) => world.id === groupWorldId),
    eligible = snapshot
      ? groupAddCandidates(snapshot, groupWorldId, active)
      : [],
    blockingArchivePlan=currentGroupPlan(detail.sharedPlans??[]);
  const mutate = async (input: Record<string, unknown>) => {
    onBusy(true);
    setMutationError("");
    try {
      onChanged(
        await manageGroup<GroupDetail>({
          ...input,
          conversationId: detail.conversation.id,
        }),
      );
      setAdding(false);
    }catch(error){
      setMutationError(error instanceof Error?error.message:"That group change could not be saved.");
    } finally {
      onBusy(false);
    }
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel="Close group details" onPress={onClose} style={StyleSheet.absoluteFill} />
        <FrostedSurface intensity={94} style={styles.details}>
          <View style={styles.detailsHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailsKicker}>GROUP DETAILS</Text>
              <Text style={styles.detailsTitle}>
                {detail.conversation.title}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close group details" onPress={onClose} style={styles.close}>
              <X size={20} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.detailsLabel}>GROUP NAME</Text>
            <View style={styles.renameRow}>
              <TextInput
                value={title}
                onChangeText={setTitle}
                maxLength={80}
                style={styles.renameInput}
              />
              <Pressable
                disabled={busy || !title.trim() ||
                  title.trim() === detail.conversation.title}
                onPress={() =>
                  void mutate({ action: "rename", title: title.trim() })}
                style={styles.saveSmall}
              >
                <Text style={styles.saveSmallText}>Save</Text>
              </Pressable>
            </View>
            <Text style={styles.detailsLabel}>PARTICIPANTS</Text>
            {detail.participants.map((participant) => {
              const blockingPlan=groupPlanBlockingParticipantRemoval(detail.sharedPlans??[],participant.character_instance_id);
              return <View key={participant.id} style={styles.detailPerson}>
                <CharacterAvatarForParticipant
                  participant={participant}
                  size={44}
                />
                <Text style={styles.detailPersonName}>
                  {participant.together_character_instances
                    .together_character_templates.name}
                </Text>
                {blockingPlan?<Text numberOfLines={1} style={styles.detailPersonStatus}>In {blockingPlan.title}</Text>:detail.participants.length > 2
                  ? (
                    <Pressable
                      accessibilityLabel={`Remove ${participant.together_character_instances.together_character_templates.name}`}
                      disabled={busy}
                      onPress={() =>
                        void mutate({
                          action: "remove_participant",
                          characterInstanceId:
                            participant.character_instance_id,
                        })}
                      style={styles.iconButton}
                    >
                      <UserMinus size={18} color={colors.danger} />
                    </Pressable>
                  )
                  : null}
              </View>
            })}
            {detail.participants.length < 5
              ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add a companion"
                  onPress={() => setAdding((value) => !value)}
                  style={styles.addButton}
                >
                  <Plus size={18} color={colors.rose} />
                  <Text style={styles.addText}>Add companion</Text>
                  <ChevronRight size={17} color={colors.dimmed} />
                </Pressable>
              )
              : null}
            {adding
              ? (
                <View style={styles.addList}>
                  {eligible.map((character) => {
                    const fake = {
                      id: character.id,
                      character_instance_id: character.id,
                      together_character_instances: character,
                    } as GroupParticipant;
                    return (
                      <Pressable
                        key={character.id}
                        disabled={busy}
                        onPress={() =>
                          void mutate({
                            action: "add_participant",
                            characterInstanceId: character.id,
                          })}
                        style={styles.detailPerson}
                      >
                        <CharacterAvatarForParticipant
                          participant={fake}
                          size={38}
                        />
                        <Text style={styles.detailPersonName}>
                          {character.together_character_templates.name}
                        </Text>
                        <Plus size={18} color={colors.rose} />
                      </Pressable>
                    );
                  })}
                  {!eligible.length
                    ? (
                      <Text style={styles.addEmpty}>
                        No other companions from{" "}
                        {groupWorld?.name ?? "this world"} are available.
                      </Text>
                    )
                    : null}
                </View>
              )
              : null}
            <Text style={styles.detailsLabel}>WHO RESPONDS</Text>
            <Segment
              options={[["automatic", "Automatic"], [
                "choose_speaker",
                "Choose speaker",
              ]]}
              value={detail.settings.responseMode}
              onChange={(value) =>
                void mutate({
                  action: "settings",
                  responseMode: value,
                  energy: detail.settings.energy,
                })}
            />
            <Text style={styles.detailsLabel}>GROUP ENERGY</Text>
            <Segment
              options={[["quiet", "Quiet"], ["balanced", "Balanced"], [
                "lively",
                "Lively",
              ]]}
              value={detail.settings.energy}
              onChange={(value) =>
                void mutate({
                  action: "settings",
                  responseMode: detail.settings.responseMode,
                  energy: value,
                })}
            />
            {mutationError?<Text accessibilityRole="alert" style={styles.detailError}>{mutationError}</Text>:null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={blockingArchivePlan?`Resolve ${blockingArchivePlan.title} before archiving this group`:"Archive group"}
              disabled={busy||Boolean(blockingArchivePlan)}
              onPress={async () => {
                onBusy(true);
                setMutationError("");
                try {
                  await manageGroup({
                    action: "archive",
                    conversationId: detail.conversation.id,
                  });
                  onClose();
                  onArchived();
                }catch(error){
                  setMutationError(error instanceof Error?error.message:"This group could not be archived.");
                } finally {
                  onBusy(false);
                }
              }}
              style={[styles.archive,blockingArchivePlan&&styles.archiveDisabled]}
            >
              <Archive size={18} color={colors.danger} />
              <Text style={styles.archiveText}>{blockingArchivePlan?`Resolve ${blockingArchivePlan.title} first`:"Archive group"}</Text>
            </Pressable>
          </ScrollView>
          {busy
            ? (
              <View style={styles.busyOverlay}>
                <ActivityIndicator color={colors.rose} />
              </View>
            )
            : null}
        </FrostedSurface>
      </View>
    </Modal>
  );
}
function Segment(
  { options, value, onChange }: {
    options: Array<[string, string]>;
    value: string;
    onChange: (value: string) => void;
  },
) {
  return (
    <View style={styles.segment}>
      {options.map(([key, label]) => (
        <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityState={{selected:value===key}}
          accessibilityLabel={label}
          onPress={() => onChange(key)}
          style={[styles.segmentOption, value === key && styles.segmentActive]}
        >
          <Text
            style={[
              styles.segmentText,
              value === key && styles.segmentTextActive,
            ]}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
function mentionedParticipants(
  text: string,
  participants: GroupParticipant[],
): string[] {
  const words = new Set(
    text.normalize("NFKC").toLocaleLowerCase().split(/[^\p{L}\p{N}_-]+/u)
      .filter(Boolean),
  );
  return participants.filter((participant) =>
    words.has(
      participant.together_character_instances.together_character_templates.name
        .split(" ")[0]!.toLocaleLowerCase(),
    )
  ).map((participant) => participant.character_instance_id);
}
function groupCompanionLabel(participants:GroupParticipant[]){
  const names=participants.map((participant)=>participant.together_character_instances.together_character_templates.name.split(" ")[0]).filter(Boolean);
  if(!names.length)return"the group";
  if(names.length===1)return names[0]!;
  if(names.length===2)return`${names[0]} & ${names[1]}`;
  return`${names.slice(0,-1).join(", ")} & ${names[names.length-1]}`;
}
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const voiceStyles = StyleSheet.create({
  listen: {
    alignSelf: "flex-start",
    minHeight: 30,
    marginTop: 7,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 15,
    backgroundColor: "rgba(216,62,234,.08)",
  },
  listenText: { color: colors.rose, fontSize: 10, fontWeight: "900" },
  listenTextLocked: { color: colors.muted },
});
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  shell: {
    flex: 1,
    width: "100%",
    maxWidth: 1480,
    alignSelf: "center",
    flexDirection: "row",
    backgroundColor: colors.background,
  },
  conversation: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  glowLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
  },
  glowOrb: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(156,68,196,.035)",
    ...(Platform.OS === "web" ? ({ filter: "blur(62px)" } as never) : {}),
  },
  glowRose: {
    width: 620,
    height: 620,
    top: "14%",
    right: -250,
    backgroundColor: "rgba(216,62,234,.055)",
    ...(Platform.OS === "web"
      ? ({
        backgroundImage:
          "radial-gradient(circle, rgba(216,62,234,.15) 0%, rgba(164,46,182,.055) 44%, transparent 73%)",
      } as never)
      : {}),
  },
  glowViolet: {
    width: 540,
    height: 540,
    bottom: "5%",
    left: -250,
    backgroundColor: "rgba(120,72,210,.045)",
    ...(Platform.OS === "web"
      ? ({
        backgroundImage:
          "radial-gradient(circle, rgba(130,83,220,.13) 0%, rgba(93,56,166,.045) 48%, transparent 74%)",
      } as never)
      : {}),
  },
  glowCenter: {
    width: 430,
    height: 430,
    top: "44%",
    left: "30%",
    backgroundColor: "rgba(115,42,133,.025)",
    ...(Platform.OS === "web"
      ? ({
        backgroundImage:
          "radial-gradient(circle, rgba(172,65,178,.075) 0%, transparent 70%)",
      } as never)
      : {}),
  },
  glowRoseCompact: {
    width: 420,
    height: 420,
    right: -210,
    top: "18%",
    opacity: .72,
  },
  glowVioletCompact: {
    width: 380,
    height: 380,
    left: -210,
    bottom: "8%",
    opacity: .66,
  },
  glowCenterCompact: {
    width: 300,
    height: 300,
    left: "22%",
    opacity: .55,
  },
  header: {
    paddingTop: Platform.OS === "web" ? 14 : 50,
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "rgba(8,11,19,.98)",
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  headerMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerCopy: { minWidth: 0, flex: 1 },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  headerSub: { color: colors.muted, fontSize: 11, marginTop: 3 },
  avatarStack: { width: 64, height: 38, position: "relative" },
  avatarStackItem: {
    position: "absolute",
    top: 2,
    borderWidth: 2,
    borderColor: colors.background,
    borderRadius: 20,
  },
  groupMenu:{position:"absolute",zIndex:30,top:Platform.OS==="web"?72:108,right:12,width:270,padding:12,gap:2,borderRadius:radius.lg,backgroundColor:"rgba(24,18,33,.98)",borderWidth:1,borderColor:colors.border,shadowColor:"#000",shadowOpacity:.42,shadowRadius:18,shadowOffset:{width:0,height:10}},
  groupMenuTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8,paddingHorizontal:8,paddingBottom:5},
  groupMenuTitle:{flex:1,color:colors.text,fontFamily:"Georgia",fontSize:19},
  groupMenuClose:{color:colors.muted,fontSize:10,fontWeight:"800"},
  groupMenuSection:{color:colors.dimmed,fontSize:8,fontWeight:"900",letterSpacing:1.2,paddingHorizontal:8,paddingTop:9,paddingBottom:3},
  groupMenuItem:{minHeight:40,justifyContent:"center",paddingHorizontal:9,borderRadius:radius.md},
  groupMenuFavorite:{minHeight:40,paddingHorizontal:9,borderRadius:radius.md,flexDirection:"row",alignItems:"center",gap:8},
  groupMenuItemText:{color:colors.text,fontSize:12,fontWeight:"700"},
  rightRail: {
    width: 310,
    flexShrink: 0,
    borderRightWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(10,10,17,.78)",
  },
  rightRailContent: { padding: 18, paddingBottom: 36 },
  memberNavigator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  memberCycleButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,.035)",
  },
  memberCounter: {
    color: colors.dimmed,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  memberStrip: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 8,
    paddingVertical: 4,
    marginBottom: 12,
  },
  memberThumb: {
    width: 39,
    height: 39,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  memberThumbActive: { borderColor: colors.violet },
  contextPortrait: {
    width: "100%",
    height: 214,
    borderRadius: radius.lg,
    backgroundColor: colors.elevated,
  },
  contextPortraitFallback: {
    width: "100%",
    height: 214,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    backgroundColor: colors.elevated,
  },
  contextName: {
    color: colors.text,
    fontFamily: "Georgia",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 14,
  },
  contextBio: { color: colors.muted, fontSize: 11, marginTop: 4 },
  contextSection: {
    paddingTop: 18,
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 9,
  },
  contextSectionTitle: {
    color: colors.dimmed,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.15,
  },
  contextLine: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  contextLineIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,.04)",
  },
  contextLineTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 3,
  },
  contextCopy: { flex: 1, color: colors.muted, fontSize: 10, lineHeight: 15 },
  contextMuted: { color: colors.dimmed, fontSize: 10, lineHeight: 15 },
  contextMemoryLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 3,
  },
  contextPlanButton: {
    minHeight: 44,
    marginTop: 20,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.rose,
  },
  contextPlanButtonText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  contextSecondaryButton: {
    minHeight: 42,
    marginTop: 9,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  contextSecondaryButtonText: { color: colors.text, fontSize: 11, fontWeight: "800" },
  plannerModalRoot:{flex:1,backgroundColor:"rgba(4,5,10,.76)",paddingTop:Platform.OS==="web"?34:70,paddingHorizontal:Platform.OS==="web"?24:0},
  plannerModalScroll:{width:"100%",maxWidth:860,alignSelf:"center",borderRadius:Platform.OS==="web"?24:0,overflow:"hidden",backgroundColor:colors.background},
  plannerModalContent:{paddingBottom:32},
  timeline: { flex: 1 },
  timelineContent: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 24,
    gap: 8,
  },
  earlierButton: {
    alignSelf: "center",
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(112,69,145,.16)",
    borderWidth: 1,
    borderColor: "rgba(203,168,255,.18)",
  },
  earlierText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  pressed: { opacity: .72 },
  day: {
    alignSelf: "center",
    color: colors.dimmed,
    fontSize: 10,
    letterSpacing: 1.1,
    fontWeight: "800",
    marginVertical: 8,
  },
  planLifecycleDivider:{width:"100%",flexDirection:"row",alignItems:"center",gap:10,marginVertical:10},
  planLifecycleLine:{height:1,flex:1,backgroundColor:"rgba(255,255,255,.10)"},
  planLifecycleText:{color:colors.dimmed,fontSize:9,fontWeight:"900",letterSpacing:.8,textTransform:"uppercase"},
  groupPlanEvent:{alignSelf:"center",width:"100%",maxWidth:580,borderRadius:radius.lg,backgroundColor:"rgba(30,22,40,.96)",borderWidth:1,borderColor:"rgba(216,62,234,.24)",overflow:"hidden",marginVertical:4},
  groupPlanSuggestion:{alignSelf:"center",width:"100%",maxWidth:580,borderRadius:radius.lg,backgroundColor:"rgba(22,17,31,.98)",borderWidth:1,borderColor:"rgba(216,62,234,.24)",overflow:"hidden",marginVertical:6},
  groupPlanSuggestionHero:{height:176,overflow:"hidden"},
  groupPlanSuggestionShade:{position:"absolute",top:0,right:0,bottom:0,left:0,backgroundColor:"rgba(8,6,14,.48)"},
  groupPlanSuggestionCopy:{flex:1,justifyContent:"flex-end",padding:16},
  groupPlanSuggestionTop:{position:"absolute",top:12,left:14,right:12,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  groupPlanSuggestionClose:{width:32,height:32,borderRadius:16,backgroundColor:"rgba(5,5,10,.52)",alignItems:"center",justifyContent:"center"},
  groupPlanSuggestionTitle:{color:"#fff",fontFamily:"Georgia",fontSize:22,fontWeight:"800"},
  groupPlanSuggestionBody:{color:"rgba(255,255,255,.78)",fontSize:11,marginTop:5},
  groupPlanInvitationPeople:{minHeight:34,flexDirection:"row",alignItems:"center",gap:8,marginTop:7},
  groupPlanHoursOpen:{color:"#84E6B7"},
  groupPlanHoursClosed:{color:"#F5A0AE"},
  groupPlanSuggestionActions:{padding:12,flexDirection:"row",alignItems:"center",gap:8,flexWrap:"wrap"},
  groupPlanSuggestionSecondaryText:{color:colors.text,fontSize:10,fontWeight:"900"},
  groupPlanSuggestionChange:{minHeight:36,flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:9},
  groupPlanSuggestionChangeText:{color:colors.rose,fontSize:9,fontWeight:"900"},
  groupPlanEventMain:{flexDirection:"row",alignItems:"center",gap:11,padding:13},
  groupPlanEventKicker:{color:colors.rose,fontSize:9,fontWeight:"900",letterSpacing:1.1},
  groupPlanEventTitle:{color:colors.text,fontSize:14,fontWeight:"900",marginTop:3},
  groupPlanEventMeta:{color:colors.muted,fontSize:10,marginTop:4},
  groupPlanEventActions:{flexDirection:"row",alignItems:"center",gap:8,paddingHorizontal:13,paddingBottom:12},
  groupPlanPrimary:{minHeight:36,paddingHorizontal:13,borderRadius:18,backgroundColor:colors.rose,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:6},
  groupPlanPrimaryText:{color:"#fff",fontSize:10,fontWeight:"900"},
  groupPlanSecondary:{minHeight:36,paddingHorizontal:12,borderRadius:18,borderWidth:1,borderColor:colors.border,alignItems:"center",justifyContent:"center"},
  groupPlanDangerText:{color:colors.danger,fontSize:10,fontWeight:"900"},
  groupPlanDisabled:{opacity:.42},
  groupPlanResponses:{alignSelf:"center",width:"100%",maxWidth:580,flexDirection:"row",alignItems:"center",justifyContent:"center",flexWrap:"wrap",gap:10,marginTop:-2,marginBottom:8},
  groupPlanResponse:{minHeight:29,flexDirection:"row",alignItems:"center",gap:5},
  groupPlanResponseDot:{width:7,height:7,borderRadius:4,marginLeft:-10,marginTop:17,borderWidth:1,borderColor:"#17111F"},
  groupPlanResponseReady:{backgroundColor:colors.success},
  groupPlanResponseLate:{backgroundColor:colors.warm},
  groupPlanResponseUnavailable:{backgroundColor:colors.danger},
  groupPlanResponseText:{color:colors.muted,fontSize:9,fontWeight:"800",maxWidth:105},
  messageRow: {
    width: "86%",
    maxWidth: 680,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 7,
  },
  assistantRow: { alignSelf: "flex-start" },
  userRow: { alignSelf: "flex-end", justifyContent: "flex-end" },
  groupedRow: { marginTop: -4 },
  portraitSlot: { width: 28 },
  bubbleWrap: { minWidth: 0, maxWidth: "100%", flexShrink: 1 },
  mediaBubbleWrap: { width: "100%", maxWidth: 430 },
  speakerName: {
    color: colors.rose,
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 10,
    marginBottom: 5,
  },
  bubble: {
    minWidth: 0,
    maxWidth: "100%",
    flexShrink: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.06)",
  },
  userBubble: {
    backgroundColor: colors.roseSoft,
    borderBottomRightRadius: 4,
    shadowColor: colors.rose,
    shadowOpacity: .18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  bubbleText: {
    minWidth: 0,
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    ...(Platform.OS === "web"
      ? ({ overflowWrap: "anywhere", wordBreak: "break-word" } as never)
      : {}),
  },
  messageTimeRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 5,
  },
  timestamp: { color: "rgba(255,255,255,.48)", fontSize: 9 },
  sharedImage: {
    width: "100%",
    height: 390,
    maxWidth: "100%",
    marginTop: 6,
    borderRadius: 14,
    backgroundColor: colors.elevated,
  },
  bubbleMeta: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  reaction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,.06)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  reactor: { color: colors.dimmed, fontSize: 9 },
  replyAction: {
    color: colors.dimmed,
    fontSize: 9,
    fontWeight: "800",
    paddingHorizontal: 5,
  },
  typing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 46,
    marginTop: 14,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.violet,
  },
  typingText: { color: colors.muted, fontSize: 11, marginLeft: 5 },
  error: {
    color: colors.danger,
    fontSize: 11,
    textAlign: "center",
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  mentions: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 78,
    maxWidth: 700,
    alignSelf: "center",
    padding: 8,
    borderRadius: radius.lg,
    backgroundColor: "rgba(29,23,37,.98)",
  },
  mentionRow: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
  },
  mentionName: { color: colors.text, fontWeight: "800" },
  speakerPicker: { gap: 7, paddingHorizontal: 14, paddingVertical: 7 },
  speakerChip: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 7,
    paddingRight: 11,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,.04)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  speakerChipActive: {
    borderColor: colors.rose,
    backgroundColor: "rgba(104,42,111,.55)",
  },
  speakerChipText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  replyPreview: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.violet,
    backgroundColor: "rgba(255,255,255,.04)",
  },
  replyLabel: { color: colors.violet, fontSize: 10, fontWeight: "900" },
  replyText: { color: colors.muted, fontSize: 11, marginTop: 2 },
  attachmentPreview: {
    marginHorizontal: 12,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderRadius: 14,
    backgroundColor: "rgba(216,62,234,.08)",
    borderWidth: 1,
    borderColor: "rgba(216,62,234,.22)",
  },
  attachmentPreviewImage: { width: 50, height: 50, borderRadius: 10 },
  attachmentPreviewTitle: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "900",
  },
  attachmentPreviewMeta: { color: colors.muted, fontSize: 9, marginTop: 3 },
  groupPlanBar:{minHeight:68,marginHorizontal:10,marginTop:7,padding:10,borderRadius:radius.lg,flexDirection:"row",alignItems:"center",gap:9,backgroundColor:"rgba(30,22,40,.98)",borderWidth:1,borderColor:"rgba(216,62,234,.25)"},
  groupPlanBarIcon:{width:36,height:36,borderRadius:18,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(216,62,234,.10)"},
  groupPlanBarContent:{flex:1,minWidth:0},
  groupPlanBarHeading:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:6},
  groupPlanBarKicker:{color:colors.rose,fontSize:8,fontWeight:"900",letterSpacing:1.1},
  groupPlanBarClock:{color:colors.muted,fontSize:8,fontWeight:"800"},
  groupPlanBarTitle:{color:colors.text,fontSize:12,fontWeight:"900",marginTop:2},
  groupPlanBarMeta:{color:colors.muted,fontSize:9,marginTop:2},
  groupPlanBarButtons:{alignItems:"stretch",justifyContent:"center"},
  groupPlanBarAction:{minHeight:28,paddingHorizontal:8,alignItems:"center",justifyContent:"center"},
  groupPlanBarActionText:{color:colors.text,fontSize:10,fontWeight:"900"},
  groupPlanProgressTrack:{height:2,borderRadius:1,overflow:"hidden",backgroundColor:"rgba(255,255,255,.10)",marginTop:6},
  groupPlanProgressFill:{height:2,borderRadius:1,backgroundColor:colors.rose},
  groupPlanJoin:{minHeight:38,paddingHorizontal:13,borderRadius:19,backgroundColor:colors.rose,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:6},
  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: "rgba(8,11,19,.99)",
    paddingBottom: Platform.OS === "ios" ? 10 : 2,
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  composerInputShell: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    maxHeight: 124,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 5,
    paddingRight: 5,
    paddingVertical: 4,
    borderRadius: 27,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  composerInputFocused: {
    backgroundColor: "rgba(43,27,56,.98)",
    borderColor: "rgba(188,142,216,.20)",
  },
  mediaButton: {
    position: "relative",
    width: 42,
    height: 42,
    borderRadius: 21,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(70,42,108,.72)",
    borderWidth: 1,
    borderColor: "rgba(203,168,255,.48)",
    shadowColor: "#8F5BFF",
    shadowOpacity: .4,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 3 },
  },
  mediaButtonPressed: {
    transform: [{ scale: .96 }],
    backgroundColor: "rgba(88,48,137,.94)",
  },
  mediaButtonGlow: {
    position: "absolute",
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(139,80,255,.25)",
    borderWidth: 1,
    borderColor: "rgba(220,196,255,.28)",
  },
  composerInput: {
    minWidth: 0,
    flex: 1,
    maxHeight: 116,
    minHeight: 44,
    paddingLeft: 4,
    paddingRight: 7,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
    backgroundColor: "transparent",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as never) : {}),
  },
  send: {
    width: 50,
    height: 50,
    borderRadius: 25,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.rose,
    shadowColor: colors.rose,
    shadowOpacity: .3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  continueButton: {
    backgroundColor: colors.violet,
    shadowColor: colors.violet,
  },
  sendDisabled: { opacity: .4 },
  dictationButton: {
    position: "relative",
    flexShrink: 0,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    backgroundColor: "rgba(100,61,167,.18)",
    borderWidth: 1,
    borderColor: "rgba(203,168,255,.22)",
  },
  dictationRecording: {
    backgroundColor: "rgba(225,65,99,.84)",
    borderColor: "rgba(255,180,200,.82)",
  },
  dictationPulse: {
    position: "absolute",
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderRadius: 20,
    backgroundColor: "#FF6F91",
  },
  modalRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    backgroundColor: "rgba(4,3,7,.72)",
  },
  photoMenu: {
    width: "100%",
    maxWidth: 470,
    padding: 20,
    borderRadius: radius.xl,
    backgroundColor: "rgba(31,23,42,.97)",
    borderWidth: 1,
    borderColor: "rgba(219,169,238,.28)",
    shadowColor: "#000",
    shadowOpacity: .42,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
  },
  photoMenuHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  photoMenuTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 24,
    marginTop: 3,
  },
  photoMenuLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 10,
  },
  photoSubjectGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  photoSubject: {
    minWidth: 94,
    flex: 1,
    maxWidth: 140,
    minHeight: 82,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 9,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,.045)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoSubjectSelected: {
    backgroundColor: "rgba(128,61,151,.36)",
    borderColor: colors.violet,
  },
  photoSubjectName: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  photoSubjectNameSelected: { color: colors.text },
  photoRequestButton: {
    height: 50,
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 16,
    backgroundColor: colors.wine,
  },
  photoRequestButtonText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  photoMenuDivider: {
    height: 1,
    marginVertical: 17,
    backgroundColor: colors.border,
  },
  photoUploadButton: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  photoUploadTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  photoUploadCopy: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  details: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "90%",
    padding: 20,
    borderRadius: radius.xl,
    backgroundColor: "rgba(27,21,35,.97)",
    borderColor: "rgba(207,162,231,.24)",
  },
  detailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailsKicker: {
    color: colors.rose,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  detailsTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 26,
    marginTop: 4,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,.05)",
  },
  detailsLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginTop: 20,
    marginBottom: 9,
  },
  renameRow: { flexDirection: "row", gap: 8 },
  renameInput: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 13,
    color: colors.text,
    backgroundColor: "rgba(255,255,255,.05)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  saveSmall: {
    width: 68,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.wine,
  },
  saveSmallText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  detailPerson: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailPersonName: {
    minWidth: 0,
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  detailPersonStatus:{color:colors.muted,fontSize:10,fontWeight:"700",maxWidth:100,textAlign:"right"},
  detailError:{color:colors.danger,fontSize:12,lineHeight:18,marginTop:12,textAlign:"center"},
  iconButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  addButton: { height: 48, flexDirection: "row", alignItems: "center", gap: 9 },
  addText: { flex: 1, color: colors.rose, fontSize: 13, fontWeight: "900" },
  addList: {
    padding: 6,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,.025)",
  },
  addEmpty: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 10,
    paddingVertical: 14,
    textAlign: "center",
  },
  segment: {
    flexDirection: "row",
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: "rgba(10,8,15,.62)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentOption: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  segmentActive: { backgroundColor: "rgba(92,47,108,.78)" },
  segmentText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  segmentTextActive: { color: colors.text },
  archive: {
    height: 52,
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: radius.lg,
    backgroundColor: "rgba(255,113,129,.08)",
    borderWidth: 1,
    borderColor: "rgba(255,113,129,.2)",
  },
  archiveDisabled:{opacity:.45},
  archiveText: { color: colors.danger, fontWeight: "900" },
  busyOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.xl,
    backgroundColor: "rgba(10,8,14,.58)",
  },
});
