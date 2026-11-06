import { styles } from '../../../styles/chatStyles';
import { CatalogImage as Image } from '../../../components/CatalogImage';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { type ImageSource } from 'expo-image';
import {
  Brain,
  CalendarDays,
  Sparkles,
  Camera,
  Copy,
  FastForward,
  Flag,
  GitBranch,
  Heart,
  LockKeyhole,
  MapPin,
  Trash2,
  Undo2,
  Volume2,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { isPhotoOnlyConversationMessage } from '../../../lib/chatMediaPresentation';
import { CharacterAvatar } from '../../../components/ui';
import { CharacterMentionText, ChatActionText } from '../../../components/CharacterMentionText';
import { ChatPhotoRequestCard } from '../../../components/media/ChatPhotoRequestCard';
import { FailedMessageRecovery } from '../../../components/FailedMessageRecovery';
import type { PhotoUploadPhase } from '../../../lib/photoUploadPresentation';
import { MediaTile } from '../../../components/media/MediaTile';
import {
  type MessageActionDefinition,
  MessageActionSheet,
} from '../../../components/MessageActionSheet';
import { colors } from '../../../theme';
import { refreshVoiceNote } from '../../../lib/api/voice';
import type {
  CharacterInstance,
  ConversationAttachment,
  GeneratedMedia,
  MediaOffer,
  Message,
  MessageReaction,
} from '../../../types';
import { ReportMessageModal } from '../../../components/ReportMessageModal';
import {
  type ChatBubbleColor,
  chatBubbleColorHex,
  chatBubbleTextColor,
} from '@together/domain/src/chat-appearance';
import type { FeaturedCompanion } from '../../../lib/featuredCompanions';
import {
  mediaWithoutActivePhotoOffer,
  photoMediaForOffer,
  visibleChatPhotoMedia,
} from '../../../lib/photoRequestPresentation';
import { privateStoredImageSource, privateStoredPreviewSource } from '../../../lib/mediaImageSource';
import { subscriptionHref } from '../../../lib/subscriptionPresentation';
import { type VoiceNoteRequestResult } from '../types';
import { navigateChatSurface } from '../navigation';
import { VoiceNoteInline } from './VoiceMessage';
import { MessageQuickActions } from '../../../components/MessageQuickActions';
import type { ChatQuickAction } from '../../../lib/chatQuickActions';
export function MessageBubble({
  quickActions,
  quickActionsReady,
  onQuickActionsChange,
  canBranch,
  branchLocked,
  onBranch,
  canSpice,
  onSpice,
  onRestore,
  desktop,
  message,
  character,
  mentionCharacters,
  onCharacterMention,
  media,
  photoOffer,
  photoPreviewSource,
  photoOfferBusy,
  grouped,
  textStyle,
  bubbleColors,
  reactionNames,
  voiceEnabled,
  memoryManualControl,
  remembered,
  favorite,
  canContinue,
  onFavorite,
  onContinue,
  onPlan,
  hasActivePlan,
  onActivity,
  onLocation,
  onPhoto,
  seamlessCompletion,
  activeVoiceNoteId,
  onVoiceActivate,
  onVoiceRequest,
  onRemember,
  onCopied,
  onDeletePhoto,
  onPhotoOfferAccept,
  onPhotoOfferDecline,
  onMediaRetry,
  onFailedRetry,
  onFailedEdit,
  onFailedDiscard,
}: {
  quickActions: ChatQuickAction[];
  quickActionsReady: boolean;
  onQuickActionsChange: (value: ChatQuickAction[]) => void;
  canBranch: boolean;
  branchLocked: boolean;
  onBranch: () => void;
  canSpice: boolean;
  onSpice: () => void | Promise<void>;
  onRestore: () => void | Promise<void>;
  desktop: boolean;
  online?: boolean;
  message: Message;
  character: CharacterInstance;
  mentionCharacters: FeaturedCompanion[];
  onCharacterMention: (character: FeaturedCompanion) => void;
  media: GeneratedMedia[];
  photoOffer: MediaOffer | null;
  photoPreviewSource?: ImageSource | number;
  photoOfferBusy: boolean;
  grouped: boolean;
  textStyle: {
    fontSize: number;
    lineHeight: number;
  };
  bubbleColors: {
    user: ChatBubbleColor;
    companion: ChatBubbleColor;
  };
  reactionNames: Record<string, string>;
  voiceEnabled: boolean;
  memoryManualControl: boolean;
  remembered: boolean;
  favorite: boolean;
  canContinue: boolean;
  onFavorite: () => void | Promise<void>;
  onContinue: () => void | Promise<void>;
  onPlan: () => void;
  hasActivePlan: boolean;
  onActivity: () => void;
  onLocation: () => void;
  onPhoto: () => void;
  seamlessCompletion: boolean;
  activeVoiceNoteId: string | null;
  onVoiceActivate: (id: string | null) => void;
  onVoiceRequest: (messageId: string, name: string) => Promise<VoiceNoteRequestResult | null>;
  onRemember: (messageId: string) => Promise<void>;
  onCopied: () => void;
  onDeletePhoto: (attachment: ConversationAttachment) => void;
  onPhotoOfferAccept: (offer: MediaOffer, paymentMethod: 'credits' | 'daily_included') => void;
  onPhotoOfferDecline: (offer: MediaOffer) => void;
  onMediaRetry: (id: string) => Promise<void>;
  onFailedRetry?: () => void;
  onFailedEdit?: () => void;
  onFailedDiscard?: () => void;
  awaitingReply?: boolean;
  photoUploadPhase?: PhotoUploadPhase;
}) {
  const [actionsOpen, setActionsOpen] = useState(false),
    [reportOpen, setReportOpen] = useState(false),
    [voiceBusy, setVoiceBusy] = useState(false),
    [localVoice, setLocalVoice] = useState<GeneratedMedia | undefined>(),
    [voiceStatusError, setVoiceStatusError] = useState<string | null>(null),
    [voicePollRetry, setVoicePollRetry] = useState(0),
    [voiceReadyHint, setVoiceReadyHint] = useState(false);
  const opacity = useRef(new Animated.Value(seamlessCompletion || message.role === 'user' ? 1 : 0)).current;
  const translate = useRef(new Animated.Value(seamlessCompletion || message.role === 'user' ? 0 : 8)).current;
  const completionControlsOpacity = useRef(new Animated.Value(seamlessCompletion ? 0 : 1)).current;
  useEffect(() => {
    // Sent messages are already visible optimistically. A canonical refresh
    // must not replay their entrance and make them blink while a reply loads.
    if (message.role === 'user') return;
    if (seamlessCompletion) {
      Animated.timing(completionControlsOpacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(translate, {
        toValue: 0,
        duration: 220,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, [completionControlsOpacity, message.role, opacity, seamlessCompletion, translate]);
  const assistant = message.role === 'assistant',
    photoOnly = isPhotoOnlyConversationMessage(message),
    attachments = message.attachments ?? message.together_conversation_attachments ?? [],
    images = visibleChatPhotoMedia(media),
    voice = localVoice ?? media.find((item) => item.media_type === 'voice_note'),
    speakerName = String(
      message.provider_metadata?.speakerName ?? character.together_character_templates.name,
    ),
    speakerSlug = String(
      message.provider_metadata?.speakerSlug ?? character.together_character_templates.slug,
    ),
    bubbleColor = assistant ? bubbleColors.companion : bubbleColors.user,
    customBubbleColor = chatBubbleColorHex(bubbleColor),
    bubbleTextColor = chatBubbleTextColor(bubbleColor);
  const photoMedia = photoMediaForOffer(media, photoOffer?.generated_media_id);
  useEffect(() => {
    if (!voice || voice.status === 'ready' || voice.status === 'failed') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const poll = async () => {
      try {
        const result = await refreshVoiceNote(voice.id);
        if (cancelled) return;
        setLocalVoice(result.media);
        if (result.media.status === 'ready' && Platform.OS === 'web') setVoiceReadyHint(true);
        if (result.media.status === 'ready' || result.media.status === 'failed') {
          if (result.media.status === 'failed') setVoiceStatusError(result.media.failure_reason_safe ?? 'Voice generation failed. Tap to retry.');
          return;
        }
      } catch (caught) {
        if (cancelled) return;
        if (attempts >= 2) {
          setVoiceStatusError(caught instanceof Error ? caught.message : 'Voice status could not be checked. Tap to retry.');
          return;
        }
      }
      attempts += 1;
      if (attempts >= 30) {
        setVoiceStatusError('Voice is taking longer than expected. Tap to check again.');
        return;
      }
      timer = setTimeout(() => void poll(), 2000);
    };
    timer = setTimeout(() => void poll(), 1600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [voice?.id, voice?.status, voicePollRetry]);
  // The active offer owns its pending and failed presentation. Excluding its
  // linked media here prevents the legacy MediaTile loader from appearing
  // beside the blurred inline offer card.
  const standaloneImages = mediaWithoutActivePhotoOffer(images, photoOffer ? photoMedia?.id : null);
  if (photoOnly && !photoMedia && !photoOffer) {
    return null;
  }
  if (photoOnly) {
    return (
      <Animated.View
        style={[{ width: '100%', maxWidth: 430, alignSelf: 'flex-start', marginVertical: 2 }, {
          opacity,
          transform: [{ translateY: translate }],
        }]}
      >
        <ChatPhotoRequestCard
          offer={photoOffer}
          media={photoMedia}
          previewSource={photoPreviewSource}
          busy={photoOfferBusy}
          onAccept={(paymentMethod) => {
            if (photoOffer) {
              onPhotoOfferAccept(photoOffer, paymentMethod);
            }
          }}
          onDecline={() => {
            if (photoOffer) {
              onPhotoOfferDecline(photoOffer);
            }
          }}
          onBuyCredits={() => navigateChatSurface(subscriptionHref({ intent: 'credits' }))}
          onRetry={photoMedia || photoOffer?.generated_media_id
            ? () => void onMediaRetry(photoMedia?.id ?? String(photoOffer?.generated_media_id))
            : undefined}
        />
      </Animated.View>
    );
  }
  const onVoice = async () => {
    if (voiceBusy) {
      return;
    }
    setVoiceBusy(true);
    setVoiceStatusError(null);
    try {
      const result = await onVoiceRequest(message.id, speakerName);
      if (!result) {
        return;
      }
      if (result.status === 'not_configured') {
        Alert.alert('Voice note', result.message ?? "Voice isn't connected yet.");
        return;
      }
      if (result.media) {
        setLocalVoice(result.media);
        if (result.media.status === 'ready' && Platform.OS === 'web') setVoiceReadyHint(true);
        if (result.media.status === 'failed') setVoiceStatusError(result.media.failure_reason_safe ?? 'Voice generation failed. Tap to retry.');
        if (result.media.status === 'ready' && Platform.OS !== 'web') {
          onVoiceActivate(result.media.id);
        }
      }
    } catch (caught) {
      setVoiceStatusError(caught instanceof Error ? caught.message : 'The voice note could not be generated.');
      Alert.alert(
        'Voice note',
        caught instanceof Error ? caught.message : 'The voice note could not be generated.',
      );
    } finally {
      setVoiceBusy(false);
    }
  };
  const refreshVoice = async () => {
    if (!voice) {
      return;
    }
    try {
      const result = await refreshVoiceNote(voice.id);
      setLocalVoice(result.media);
      setVoiceStatusError(result.media.status === 'ready' && !result.media.signed_url ? 'Audio could not be loaded. Tap to try again.' : null);
      if (result.media.status === 'ready' && result.media.signed_url && Platform.OS === 'web') setVoiceReadyHint(true);
    } catch (caught) {
      setVoiceStatusError(caught instanceof Error ? caught.message : 'Audio could not be loaded. Tap to try again.');
    }
  };
  const retryVoiceStatus = () => { setVoiceStatusError(null); setVoicePollRetry((current) => current + 1); };
  const voiceAction = () => {
    if (!voiceEnabled) {
      navigateChatSurface(subscriptionHref({ intent: 'voice' }));
      return;
    }
    if (voice) {
      onVoiceActivate(activeVoiceNoteId === voice.id ? null : voice.id);
      return;
    }
    return onVoice();
  };
  const actionItems: MessageActionDefinition[] = [
    ...(assistant ? [{
      key: 'location',
      label: 'Location',
      icon: <MapPin size={23} color={colors.warm} />,
      onPress: () => {
        setActionsOpen(false);
        onLocation();
      },
    }] : []),
    ...(canBranch
      ? [{
        key: 'branch',
        label: 'Branch',
        icon: branchLocked
          ? <LockKeyhole size={23} color={colors.textSecondary} />
          : <GitBranch size={23} color={colors.rose} />,
        // The action sheet is a native Modal. Let it dismiss before opening
        // the branch confirmation or subscription flow above the chat.
        onPress: () => {
          setActionsOpen(false);
          setTimeout(onBranch, Platform.OS === 'web' ? 0 : 320);
        },
      }]
      : []),
    ...(message.provider_metadata?.branchPrefix
      ? [{
        key: 'copy',
        label: 'Copy',
        icon: <Copy size={23} color={colors.textSecondary} />,
        onPress: async () => { await Clipboard.setStringAsync(message.content); onCopied(); },
      }]
      : [
        ...(canSpice
          ? [
            {
              key: 'spice',
              label: 'Spice',
              icon: <Text style={{ fontSize: 23 }}>🌶</Text>,
              onPress: onSpice,
            },
            ...(message.provider_metadata?.canRestoreOriginal
              ? [{
                key: 'restore',
                label: 'Restore original',
                icon: <Undo2 size={23} color={colors.textSecondary} />,
                onPress: onRestore,
              }]
              : []),
          ]
          : []),
        ...(assistant && canContinue
          ? [{
            key: 'continue',
            label: 'Continue',
            icon: <FastForward size={23} color={colors.textSecondary} />,
            onPress: onContinue,
          }]
          : []),
        ...(memoryManualControl && !message.id.startsWith('local-') && !message.provider_metadata?.branchPrefix && message.delivery_status !== 'failed' && message.delivery_status !== 'pending'
          ? [{
            key: 'memory',
            label: remembered ? 'Saved' : 'Memory',
            icon: <Brain size={23} color={remembered ? colors.violet : colors.textSecondary} fill={remembered ? 'rgba(155,99,215,.28)' : 'transparent'} />,
            selected: remembered,
            onPress: () => onRemember(message.id),
          }]
          : []),
        {
          key: 'copy',
          label: 'Copy',
          icon: <Copy size={23} color={colors.textSecondary} />,
          onPress: async () => { await Clipboard.setStringAsync(message.content); onCopied(); },
        },
        ...(!message.id.startsWith('local-')
          ? [{
            key: 'favorite',
            label: favorite ? 'Favorited' : 'Favorite',
            icon: (
              <Heart
                size={23}
                color={favorite ? colors.rose : colors.textSecondary}
                fill={favorite ? colors.rose : 'transparent'}
              />
            ),
            selected: favorite,
            onPress: onFavorite,
          }]
          : []),
        ...(assistant
          ? [{
            key: 'plan',
            label: hasActivePlan ? 'End plan' : 'Plan something',
            icon: <CalendarDays size={23} color={colors.textSecondary} />,
            onPress: onPlan,
          }, {
            key: 'activity',
            label: 'Do an Activity',
            icon: <Sparkles size={23} color={colors.textSecondary} />,
            disabled: !hasActivePlan,
            onPress: onActivity,
          }, {
            key: 'photo',
            label: 'Ask for photo',
            icon: <Camera size={23} color={colors.textSecondary} />,
            onPress: onPhoto,
          }]
          : []),
        ...(!assistant && attachments.length && !message.id.startsWith('local-')
          ? [{
            key: 'delete-photo',
            label: 'Delete photo',
            icon: <Trash2 size={23} color={colors.danger} />,
            destructive: true,
            onPress: () => onDeletePhoto(attachments[0]!),
          }]
          : []),
        ...(assistant && !message.id.startsWith('local-')
          ? [{
            key: 'report',
            label: 'Report',
            icon: <Flag size={23} color={colors.muted} />,
            onPress: () => setReportOpen(true),
          }]
          : []),
        ...(message.delivery_status === 'failed' && onFailedRetry
          ? [{
            key: 'retry',
            label: 'Retry send',
            icon: <Undo2 size={23} color={colors.rose} />,
            onPress: onFailedRetry,
          }]
          : []),
      ]),
  ];
  return (
    <>
      <Animated.View
        style={[
          styles.messageRow,
          desktop && styles.messageRowDesktop,
          assistant ? styles.assistantRow : styles.userRow,
          { opacity, transform: [{ translateY: translate }] },
        ]}
      >
        {assistant && !grouped
          ? <CharacterAvatar slug={speakerSlug} size={28} />
          : assistant
          ? <View style={{ width: 28 }} />
          : null}
        <View style={styles.messageStack}>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={`${assistant ? speakerName : 'Your'} message. Tap for actions.`}
            onPress={() => setActionsOpen(true)}
            onLongPress={() => setActionsOpen(true)}
            style={[
              styles.bubble,
              desktop && styles.bubbleDesktop,
              assistant ? styles.assistantBubble : styles.userBubble,
              customBubbleColor ? { backgroundColor: customBubbleColor } : null,
              message.delivery_status === 'failed' && styles.failed,
            ]}
          >
            {!photoOnly && message.content !== '[Photo]'
              ? (assistant
                ? (
                  <CharacterMentionText
                    text={message.content}
                    characters={mentionCharacters}
                    excludeSlug={speakerSlug}
                    onCharacterPress={onCharacterMention}
                    style={[styles.messageText, textStyle, { color: bubbleTextColor }]}
                  />
                )
                : (
                  <Text style={[styles.messageText, textStyle, { color: bubbleTextColor }]}>
                    {message.content}
                  </Text>
                ))
              : !assistant && !attachments.length
              ? (
                <Text
                  style={[styles.messageText, textStyle, { color: bubbleTextColor, opacity: .66 }]}
                >
                  Photo deleted
                </Text>
              )
              : null}
            {attachments.map((attachment) => (
              <Pressable
                key={attachment.id}
                accessibilityRole='button'
                accessibilityLabel='Open shared photo'
                onPress={() => attachment.signed_url && void Linking.openURL(attachment.signed_url)}
              >
                <Image
                  source={privateStoredImageSource(attachment.signed_url, attachment.storage_path)}
                  previewSource={privateStoredPreviewSource(attachment.preview_url, attachment.storage_path)}
                  style={styles.userAttachment}
                  contentFit='cover'
                  cachePolicy='memory-disk'
                  priority='low'
                  recyclingKey={attachment.id}
                />
              </Pressable>
            ))}
            {standaloneImages.map((item) => (
              <MediaTile
                key={item.id}
                media={item}
                style={styles.messageMedia}
                showFreeBadge
                onRetry={() => void onMediaRetry(item.id)}
              />
            ))}
            {assistant && !photoOnly && voice ? <VoiceNoteInline
              showReadyHint={voiceReadyHint}
              media={voice}
              active={activeVoiceNoteId === voice.id}
              onActivate={() => { setVoiceReadyHint(false); onVoiceActivate(voice.id); }}
              onDeactivate={() => onVoiceActivate(null)}
              onRetry={() => void onVoice()}
              onRefresh={() => void refreshVoice()}
              pendingError={voiceStatusError}
              onPendingRetry={retryVoiceStatus}
            /> : null}
            <View style={styles.messageMeta}>
              <Text
                style={[styles.timestamp, desktop && styles.timestampDesktop, {
                  color: bubbleTextColor,
                  opacity: .58,
                }]}
              >
                {new Date(message.created_at).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </Pressable>
          {assistant && !photoOnly ? <Animated.View style={{ opacity: completionControlsOpacity }}><MessageQuickActions kind='direct' selected={quickActions} ready={quickActionsReady} onChange={onQuickActionsChange} actions={actionItems} voice={voice ? null : <Pressable accessibilityRole='button' accessibilityLabel={`Make voice note for ${speakerName}`} onPress={() => void voiceAction()} disabled={voiceBusy} style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(216,62,234,.38)', backgroundColor: 'rgba(216,62,234,.14)', alignItems: 'center', justifyContent: 'center' }}>{voiceBusy ? <ActivityIndicator size='small' color={colors.rose}/> : <Volume2 size={15} color={voiceEnabled ? colors.rose : colors.muted}/>}</Pressable>}/>{voiceBusy && !voice ? <Text accessibilityLiveRegion='polite' style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>Making voice…</Text> : null}{voiceStatusError && !voice ? <Pressable accessibilityRole='button' accessibilityLabel='Retry voice note' onPress={() => void voiceAction()}><Text accessibilityLiveRegion='polite' style={{ color: colors.rose, fontSize: 11, marginTop: 4 }}>Voice unavailable · Retry</Text></Pressable> : null}</Animated.View> : null}
          {message.together_message_reactions?.length
            ? (
              <View style={styles.messageReactions}>
                {message.together_message_reactions.map((reaction: MessageReaction) => (
                  <View key={reaction.id} style={styles.messageReaction}>
                    <Text style={styles.messageReactionEmoji}>{reaction.reaction}</Text>
                    <Text style={styles.messageReactionName}>
                      {reactionNames[reaction.reactor_character_instance_id] ??
                        String(reaction.metadata?.reactorName ?? 'Companion').split(' ')[0]}
                    </Text>
                  </View>
                ))}
              </View>
            )
            : null}
          {assistant && photoOffer
            ? (
              <ChatPhotoRequestCard
                offer={photoOffer}
                media={photoMedia}
                previewSource={photoPreviewSource}
                busy={photoOfferBusy}
                onAccept={(paymentMethod) => onPhotoOfferAccept(photoOffer, paymentMethod)}
                onDecline={() => onPhotoOfferDecline(photoOffer)}
                onBuyCredits={() => navigateChatSurface(subscriptionHref({ intent: 'credits' }))}
                onRetry={photoMedia || photoOffer.generated_media_id
                  ? () => void onMediaRetry(photoMedia?.id ?? String(photoOffer.generated_media_id))
                  : undefined}
              />
            )
            : null}
          {message.delivery_status === 'failed' && onFailedEdit && onFailedDiscard
            ? (
              <FailedMessageRecovery
                conversationId={message.conversation_id}
                clientRequestId={message.client_request_id}
                onRetry={onFailedRetry}
                onEdit={onFailedEdit}
                onDiscard={onFailedDiscard}
              />
            )
            : null}
        </View>
      </Animated.View>
      <MessageActionSheet
        contextCredits={typeof (message.provider_metadata?.contextCharge as {
            credits?: number;
          } | undefined)?.credits === 'number'
          ? (message.provider_metadata!.contextCharge as {
            credits: number;
          }).credits
          : undefined}
        visible={actionsOpen}
        message={message.content}
        senderName={speakerName}
        sentAt={message.created_at}
        userMessage={!assistant}
        actions={actionItems}
        onClose={() => setActionsOpen(false)}
      />
      <ReportMessageModal
        visible={reportOpen}
        messageId={message.id}
        onClose={() => setReportOpen(false)}
      />
    </>
  );
}
export function StreamingBubble(
  { desktop, character, content, textStyle, bubbleColor, reserveVoiceControl }: {
    desktop: boolean;
    character: CharacterInstance;
    content: string;
    textStyle: {
      fontSize: number;
      lineHeight: number;
    };
    bubbleColor: ChatBubbleColor;
    reserveVoiceControl: boolean;
  },
) {
  const backgroundColor = chatBubbleColorHex(bubbleColor),
    textColor = chatBubbleTextColor(bubbleColor);
  return (
    <View style={[styles.messageRow, desktop && styles.messageRowDesktop, styles.assistantRow]}>
      <CharacterAvatar slug={character.together_character_templates.slug} size={28} />
      <View style={styles.messageStack}>
        <View
          style={[
            styles.bubble,
            desktop && styles.bubbleDesktop,
            styles.assistantBubble,
            backgroundColor ? { backgroundColor } : null,
          ]}
        >
          <ChatActionText
            text={content}
            style={[styles.messageText, textStyle, { color: textColor }]}
            trailing={<Text style={styles.cursor}>▍</Text>}
          />
          {reserveVoiceControl ? <View aria-hidden style={styles.listenPlaceholder} /> : null}
          <View style={styles.messageMeta}>
            <Text
              style={[styles.timestamp, desktop && styles.timestampDesktop, { color: textColor }]}
            >
              Now
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
