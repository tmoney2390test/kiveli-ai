import { styles } from '../../../styles/chatStyles';
import { CatalogImage as Image } from '../../../components/CatalogImage';
import { VeniceTestDiagnostics } from '../../../components/VeniceTestDiagnostics';
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
  Camera,
  Copy,
  FastForward,
  Flag,
  GitBranch,
  Heart,
  LockKeyhole,
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
import { privateStoredImageSource } from '../../../lib/mediaImageSource';
import { subscriptionHref } from '../../../lib/subscriptionPresentation';
import { type VoiceNoteRequestResult } from '../types';
import { navigateChatSurface } from '../navigation';
import { VoiceNoteInline } from './VoiceMessage';
export function MessageBubble({
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
  voiceVisible,
  voiceEnabled,
  memoryManualControl,
  favorite,
  canContinue,
  onFavorite,
  onContinue,
  onPlan,
  onPhoto,
  seamlessCompletion,
  activeVoiceNoteId,
  onVoiceActivate,
  onVoiceRequest,
  onRemember,
  onDeletePhoto,
  onPhotoOfferAccept,
  onPhotoOfferDecline,
  onMediaRetry,
  onFailedRetry,
  onFailedEdit,
  onFailedDiscard,
}: {
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
  voiceVisible: boolean;
  voiceEnabled: boolean;
  memoryManualControl: boolean;
  favorite: boolean;
  canContinue: boolean;
  onFavorite: () => void | Promise<void>;
  onContinue: () => void | Promise<void>;
  onPlan: () => void;
  onPhoto: () => void;
  seamlessCompletion: boolean;
  activeVoiceNoteId: string | null;
  onVoiceActivate: (id: string | null) => void;
  onVoiceRequest: (messageId: string, name: string) => Promise<VoiceNoteRequestResult | null>;
  onRemember: (messageId: string) => Promise<void>;
  onDeletePhoto: (attachment: ConversationAttachment) => void;
  onPhotoOfferAccept: (offer: MediaOffer, paymentMethod: 'credits' | 'daily_included') => void;
  onPhotoOfferDecline: (offer: MediaOffer) => void;
  onMediaRetry: (id: string) => Promise<void>;
  onFailedRetry?: () => void;
  onFailedEdit?: () => void;
  onFailedDiscard?: () => void;
}) {
  const [actionsOpen, setActionsOpen] = useState(false),
    [reportOpen, setReportOpen] = useState(false),
    [voiceBusy, setVoiceBusy] = useState(false),
    [localVoice, setLocalVoice] = useState<GeneratedMedia | undefined>();
  const opacity = useRef(new Animated.Value(seamlessCompletion ? 1 : 0)).current;
  const translate = useRef(new Animated.Value(seamlessCompletion ? 0 : 8)).current;
  const completionControlsOpacity = useRef(new Animated.Value(seamlessCompletion ? 0 : 1)).current;
  useEffect(() => {
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
  }, [completionControlsOpacity, opacity, seamlessCompletion, translate]);
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
        if (result.media.status === 'ready' && Platform.OS !== 'web') {
          onVoiceActivate(result.media.id);
        }
      }
    } catch (caught) {
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
    const result = await refreshVoiceNote(voice.id);
    setLocalVoice(result.media);
  };
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
    ...(canBranch
      ? [{
        key: 'branch',
        label: 'Branch',
        icon: branchLocked
          ? <LockKeyhole size={23} color={colors.textSecondary} />
          : <GitBranch size={23} color={colors.rose} />,
        onPress: onBranch,
      }]
      : []),
    ...(message.provider_metadata?.branchPrefix
      ? [{
        key: 'copy',
        label: 'Copy',
        icon: <Copy size={23} color={colors.textSecondary} />,
        onPress: () => Clipboard.setStringAsync(message.content),
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
        ...(memoryManualControl && !message.id.startsWith('local-')
          ? [{
            key: 'memory',
            label: 'Memory',
            icon: <Brain size={23} color={colors.textSecondary} />,
            onPress: () => onRemember(message.id),
          }]
          : []),
        {
          key: 'copy',
          label: 'Copy',
          icon: <Copy size={23} color={colors.textSecondary} />,
          onPress: () => Clipboard.setStringAsync(message.content),
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
        ...(assistant && voiceVisible && message.provider_metadata?.rewriteAction !== 'spice'
          ? [{
            key: 'voice',
            label: voice ? 'Voice' : 'Listen',
            icon: <Volume2 size={23} color={voiceEnabled ? colors.textSecondary : colors.muted} />,
            onPress: voiceAction,
          }]
          : []),
        ...(assistant
          ? [{
            key: 'plan',
            label: 'Plan something',
            icon: <CalendarDays size={23} color={colors.textSecondary} />,
            onPress: onPlan,
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
            {assistant && !photoOnly && voiceVisible &&
                message.provider_metadata?.rewriteAction !== 'spice' && (voice || voiceBusy)
              ? (
                <Animated.View
                  style={[styles.listenControlSlot, { opacity: completionControlsOpacity }]}
                >
                  {voice
                    ? (
                      <VoiceNoteInline
                        media={voice}
                        active={activeVoiceNoteId === voice.id}
                        onActivate={() =>
                          onVoiceActivate(activeVoiceNoteId === voice.id ? null : voice.id)}
                        onRetry={() => void onVoice()}
                        onRefresh={() => void refreshVoice()}
                      />
                    )
                    : (
                      <View style={styles.voiceNote}>
                        <ActivityIndicator size='small' color={colors.rose} />
                        <Text style={styles.voiceNoteText}>Generating voice…</Text>
                      </View>
                    )}
                </Animated.View>
              )
              : null}
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
          {assistant ? <VeniceTestDiagnostics metadata={message.provider_metadata} /> : null}
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
          {message.delivery_status === 'failed' && onFailedRetry && onFailedEdit && onFailedDiscard
            ? (
              <FailedMessageRecovery
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
