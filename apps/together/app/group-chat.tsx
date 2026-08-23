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
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  Archive,
  Camera,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Mic,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Send,
  Sparkles,
  Square,
  Upload,
  UserMinus,
  Volume2,
  X,
} from "lucide-react-native";
import { shouldGroupChatMessages } from "@together/domain/src/group-chat";
import {
  MESSAGE_CHARACTER_LIMIT,
  messageCharacterLimitError,
} from "@together/domain/src/message-limits";
import {
  CharacterAvatar,
  ChatPhotoRequestCard,
  EmptyState,
  FrostedSurface,
  MediaTile,
  MessageCharacterCounter,
  resolveCharacterPortraitSource,
  VoiceNotePurchaseModal,
} from "../src/components";
import {
  confirmUserImage,
  type GroupDialogueEvent,
  manageGroup,
  manageMedia,
  prepareUserImage,
  quoteVoiceNote,
  refreshVoiceNote,
  reportMessage,
  requestVoiceNote,
  sendGroupDialogue,
  type VoiceNoteQuote,
} from "../src/lib/api";
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
import { mediaWithoutActivePhotoOffer, photoMediaForOffer, visibleChatPhotoMedia } from "../src/lib/photoRequestPresentation";
import { characterResidentWorld } from "../src/lib/place";
import { supabase } from "../src/lib/supabase";
import {
  hideVoiceNoteConfirmation,
  isVoiceNoteConfirmationHidden,
} from "../src/lib/voiceNoteConfirmation";
import { useTogether } from "../src/store/useTogether";
import {
  type ChatDictationPhase,
  useChatDictation,
} from "../src/hooks/useChatDictation";
import { colors, radius, typography } from "../src/theme";
import type {
  GeneratedMedia,
  GroupDetail,
  GroupParticipant,
  MediaOffer,
  Message,
  MessageReaction,
  Snapshot,
} from "../src/types";

export default function GroupChatScreen() {
  const params = useLocalSearchParams<{ id?: string; details?: string }>(),
    { width } = useWindowDimensions(),
    snapshot = useTogether((state) => state.snapshot),
    refresh = useTogether((state) => state.refresh);
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
    [sending, setSending] = useState(false),
    [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null),
    mediaRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    scrollRef = useRef<ScrollView | null>(null),
    bottomAlignedConversation = useRef<string | null>(null),
    keepPinnedToBottom = useRef(true);
  const loadedGroupRef = useRef<string | null>(null);
  useFocusEffect(useCallback(() => {
    if (!params.id) return;
    const conversationId=params.id,initial=loadedGroupRef.current!==conversationId;
    let cancelled=false;
    if(initial)setLoading(true);
    bottomAlignedConversation.current = null;
    keepPinnedToBottom.current = true;
    void manageGroup<GroupDetail>({action:"detail",conversationId}).then((next)=>{if(cancelled)return;loadedGroupRef.current=conversationId;setDetail(next);setError("");}).catch((caught)=>{if(!cancelled)setError(caught instanceof Error?caught.message:"This group could not be loaded.");}).finally(()=>{if(!cancelled&&initial)setLoading(false);});
    return () => {
      cancelled=true;
      abortRef.current?.abort();
      if (mediaRefreshTimer.current) clearTimeout(mediaRefreshTimer.current);
    };
  }, [params.id]));
  useEffect(() => {
    if (!params.id) return;
    const refreshDetail = () => {
      if (mediaRefreshTimer.current) clearTimeout(mediaRefreshTimer.current);
      mediaRefreshTimer.current = setTimeout(() => {
        void manageGroup<GroupDetail>({
          action: "detail",
          conversationId: params.id,
        }).then(setDetail).catch(() => undefined);
      }, 250);
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
      .subscribe();
    return () => {
      if (mediaRefreshTimer.current) clearTimeout(mediaRefreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [params.id]);
  const mediaNeedsRefresh = groupMediaNeedsRefresh(
    detail?.generatedMedia ?? [],
    detail?.mediaOffers ?? [],
  );
  useEffect(() => {
    if (!params.id || !mediaNeedsRefresh) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = () => {
      timer = setTimeout(() => {
        void manageGroup<GroupDetail>({
          action: "detail",
          conversationId: params.id,
        }).then((next) => {
          if (!cancelled) setDetail(next);
        }).catch(() => undefined).finally(() => {
          if (!cancelled) poll();
        });
      }, 2_000);
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
  const appendMessage = (message: Message) =>
    setDetail((current) =>
      current && !current.messages.some((item) => item.id === message.id)
        ? {
          ...current,
          messages: [...current.messages, message],
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
  const send = async (text = input, letThemTalk = false) => {
    const message = text.trim();
    if (!detail || !message) return;
    if (message.length > MESSAGE_CHARACTER_LIMIT) {
      setError(messageCharacterLimitError());
      return;
    }
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
    setReplyTo(null);
    try {
      await sendGroupDialogue(
        {
          conversationId: detail.conversation.id,
          message,
          clientRequestId: crypto.randomUUID(),
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
    } catch (caught) {
      if ((caught as Error)?.name !== "AbortError") {
        setError(
          caught instanceof Error
            ? caught.message
            : "The group could not reply.",
        );
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
    abortRef.current?.abort();
    keepPinnedToBottom.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setInput("");
    setSending(true);
    setError("");
    const mentions = mentionedParticipants(message, detail.participants),
      reply = replyTo;
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
          clientRequestId: crypto.randomUUID(),
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
    } catch (caught) {
      if ((caught as Error)?.name !== "AbortError") {
        setError(
          caught instanceof Error
            ? caught.message
            : "The group could not reply.",
        );
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
      <GroupAmbientGlow compact={width < 720} />
      <GroupHeader
        detail={detail}
        worldName={snapshot?.worlds.find((world) =>
          world.id === detail.conversation.group_world_id
        )?.name}
        onBack={() => router.replace("/(tabs)/chat-tab")}
        onDetails={() => setShowDetails(true)}
      />
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
        onContentSizeChange={() => {
          if (!params.id) return;
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
        {detail.messages.map((message, index) => {
          const previous = detail.messages[index - 1],
            dayLabel = groupTimelineDayLabel(
              message.created_at,
              previous?.created_at,
            ),
            grouped = Boolean(
              previous && !dayLabel &&
                shouldGroupChatMessages(previous, message),
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
          router.replace("/(tabs)/chat-tab");
        }}
      />
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
        <View style={styles.composerInputShell}>
          <GroupMediaButton
            name={groupName}
            disabled={sending || dictationBusy}
            onPress={onPhoto}
          />
          <TextInput
            accessibilityLabel="Message group"
            value={input}
            onChangeText={onChange}
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
  { detail, worldName, onBack, onDetails }: {
    detail: GroupDetail;
    worldName?: string;
    onBack: () => void;
    onDetails: () => void;
  },
) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Back to Messages"
        onPress={onBack}
        style={styles.headerButton}
      >
        <ChevronLeft size={25} color={colors.text} />
      </Pressable>
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
              onLongPress={messageActions}
              style={[
                styles.bubble,
                user ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              {message.content !== "[Photo]"
                ? <Text style={styles.bubbleText}>{message.content}</Text>
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
    [adding, setAdding] = useState(false);
  useEffect(() => setTitle(detail.conversation.title ?? ""), [
    detail.conversation.title,
  ]);
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
      : [];
  const mutate = async (input: Record<string, unknown>) => {
    onBusy(true);
    try {
      onChanged(
        await manageGroup<GroupDetail>({
          ...input,
          conversationId: detail.conversation.id,
        }),
      );
      setAdding(false);
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
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} />
        <FrostedSurface intensity={94} style={styles.details}>
          <View style={styles.detailsHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailsKicker}>GROUP DETAILS</Text>
              <Text style={styles.detailsTitle}>
                {detail.conversation.title}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.close}>
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
            {detail.participants.map((participant) => (
              <View key={participant.id} style={styles.detailPerson}>
                <CharacterAvatarForParticipant
                  participant={participant}
                  size={44}
                />
                <Text style={styles.detailPersonName}>
                  {participant.together_character_instances
                    .together_character_templates.name}
                </Text>
                {detail.participants.length > 2
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
            ))}
            {detail.participants.length < 5
              ? (
                <Pressable
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
            <Pressable
              disabled={busy}
              onPress={async () => {
                onBusy(true);
                try {
                  await manageGroup({
                    action: "archive",
                    conversationId: detail.conversation.id,
                  });
                  onClose();
                  onArchived();
                } finally {
                  onBusy(false);
                }
              }}
              style={styles.archive}
            >
              <Archive size={18} color={colors.danger} />
              <Text style={styles.archiveText}>Archive group</Text>
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
  day: {
    alignSelf: "center",
    color: colors.dimmed,
    fontSize: 10,
    letterSpacing: 1.1,
    fontWeight: "800",
    marginVertical: 8,
  },
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
