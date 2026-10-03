import { styles } from '../../../styles/chatStyles';
import { CatalogImage as Image } from '../../../components/CatalogImage';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Images, Play, X } from 'lucide-react-native';
import { FrostedBackdrop, FrostedSurface } from '../../../components/FrostedGlass';
import { colors } from '../../../theme';
import type { GeneratedMedia } from '../../../types';
import { privateStoredImageSource } from '../../../lib/mediaImageSource';
import { type ChatMediaGalleryItem, chatMediaVideoPreview } from '../../../lib/chatMediaGallery';
import { VideoMomentThumbnail } from '../../../components/VideoMomentThumbnail';
import { mediaViewerHref } from '../../../lib/conversationNavigation';
import { navigateChatSurface } from '../navigation';
export function ChatMediaGalleryModal(
  { visible, items, generatedMedia, companionName, returnTo, loading, error, onRetry, onClose }: {
    visible: boolean;
    items: ChatMediaGalleryItem[];
    generatedMedia: GeneratedMedia[];
    companionName: string;
    returnTo: string;
    loading: boolean;
    error: string;
    onRetry: () => void;
    onClose: () => void;
  },
) {
  const generatedById = new Map(generatedMedia.map((item) => [item.id, item]));
  const openItem = (item: ChatMediaGalleryItem) => {
    onClose();
    if (item.kind === 'generated') {
      navigateChatSurface(mediaViewerHref(item.media.id, returnTo));
      return;
    }
    if (item.attachment.signed_url) {
      void Linking.openURL(item.attachment.signed_url);
    }
  };
  return (
    <Modal visible={visible} transparent animationType='fade' onRequestClose={onClose}>
      <View style={styles.chatMediaBackdrop}>
        <FrostedBackdrop intensity={38} />
        <Pressable
          accessibilityLabel='Close conversation media'
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <FrostedSurface intensity={94} style={styles.chatMediaModal}>
          <View style={styles.chatMediaHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.chatMediaKicker}>CONVERSATION MEDIA</Text>
              <Text numberOfLines={1} style={styles.chatMediaTitle}>You + {companionName}</Text>
              <View style={styles.chatMediaSubtitleRow}>
                <Text style={styles.chatMediaSubtitle}>
                  {items.length
                    ? `${items.length} ${
                      items.length === 1 ? 'photo or video' : 'photos and videos'
                    }`
                    : 'Photos and videos will collect here.'}
                </Text>
                {loading && items.length
                  ? <ActivityIndicator size='small' color={colors.rose} />
                  : null}
              </View>
            </View>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel='Close conversation media'
              onPress={onClose}
              style={styles.chatMediaClose}
            >
              <X size={19} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.chatMediaContent}
          >
            {error
              ? (
                <Pressable
                  accessibilityRole='button'
                  accessibilityLabel='Retry loading conversation media'
                  onPress={onRetry}
                  style={styles.chatMediaError}
                >
                  <Text style={styles.chatMediaErrorText}>{error}</Text>
                  <Text style={styles.chatMediaRetry}>Try again</Text>
                </Pressable>
              )
              : null}
            {items.length
              ? (
                <View style={styles.chatMediaGrid}>
                  {items.map((item) => {
                    const generated = item.kind === 'generated' ? item.media : null,
                      attachment = item.kind === 'attachment' ? item.attachment : null,
                      isVideo = generated?.media_type === 'video' || attachment?.kind === 'video',
                      videoPreview = chatMediaVideoPreview(item, generatedById),
                      poster = videoPreview.poster,
                      posterUri = poster?.signed_url ?? null,
                      uri = generated?.signed_url ?? attachment?.signed_url ?? null,
                      pending = generated?.status === 'queued' ||
                        generated?.status === 'generating';
                    return (
                      <Pressable
                        key={item.id}
                        accessibilityRole='button'
                        accessibilityLabel={`Open ${isVideo ? 'video' : 'photo'} from ${
                          new Date(item.createdAt).toLocaleDateString()
                        }`}
                        onPress={() => openItem(item)}
                        style={(
                          { pressed },
                        ) => [styles.chatMediaTile, pressed && styles.chatMediaTilePressed]}
                      >
                        {isVideo
                          ? (
                            <>
                              <View style={styles.chatMediaVideoFallback}>
                                <Play size={32} color={colors.dimmed} />
                              </View>
                              {posterUri
                                ? (
                                  <ConversationMediaPhoto
                                    uri={posterUri}
                                    storagePath={poster?.storage_path}
                                  />
                                )
                                : null}
                              {visible && videoPreview.uri
                                ? (
                                  <VideoMomentThumbnail
                                    uri={videoPreview.uri}
                                    posterUri={posterUri}
                                    contentFit='contain'
                                  />
                                )
                                : null}
                              <View style={styles.chatMediaPlay}>
                                {pending
                                  ? <ActivityIndicator size='small' color='#fff' />
                                  : <Play size={16} color='#fff' fill='#fff' />}
                              </View>
                            </>
                          )
                          : uri
                          ? (
                            <ConversationMediaPhoto
                              uri={uri}
                              storagePath={generated?.storage_path ?? attachment?.storage_path}
                            />
                          )
                          : (
                            <View style={styles.chatMediaVideoFallback}>
                              {pending ? <ActivityIndicator color={colors.rose} /> : null}
                            </View>
                          )}
                        <View style={styles.chatMediaTileShade} />
                        <View style={styles.chatMediaTileMeta}>
                          <Text style={styles.chatMediaType}>
                            {pending ? 'CREATING' : isVideo ? 'VIDEO' : 'PHOTO'}
                          </Text>
                          <Text style={styles.chatMediaDate}>
                            {new Date(item.createdAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )
              : loading
              ? (
                <View accessibilityLiveRegion='polite' style={styles.chatMediaEmpty}>
                  <ActivityIndicator color={colors.rose} />
                  <Text style={styles.chatMediaEmptyTitle}>Gathering your media…</Text>
                  <Text style={styles.chatMediaEmptyCopy}>
                    The gallery is open now; photos and videos will fill in as they arrive.
                  </Text>
                </View>
              )
              : (
                <View style={styles.chatMediaEmpty}>
                  <Images size={34} color={colors.dimmed} />
                  <Text style={styles.chatMediaEmptyTitle}>No shared media yet</Text>
                  <Text style={styles.chatMediaEmptyCopy}>
                    Generated and shared photos and videos from this conversation will appear here.
                  </Text>
                </View>
              )}
          </ScrollView>
        </FrostedSurface>
      </View>
    </Modal>
  );
}
function ConversationMediaPhoto({ uri, storagePath }: {
  uri: string;
  storagePath?: string | null;
}) {
  const source = privateStoredImageSource(uri, storagePath);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image
        accessible={false}
        source={source}
        style={[StyleSheet.absoluteFill, styles.chatMediaPhotoBackdrop]}
        contentFit='cover'
        contentPosition='center'
        blurRadius={24}
        cachePolicy='memory-disk'
      />
      <View pointerEvents='none' style={styles.chatMediaPhotoMatte} />
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit='contain'
        contentPosition='center'
        cachePolicy='memory-disk'
        transition={0}
      />
    </View>
  );
}
