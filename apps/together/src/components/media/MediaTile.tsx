import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Camera, Play, RefreshCw } from 'lucide-react-native';
import type { GeneratedMedia } from '../../types';
import { colors } from '../../theme';
import { generatedMediaImageSource } from '../../lib/mediaImageSource';
import { styles } from '../../styles/mediaStyles';
import { MediaProgress } from './MediaProgress';
import { MediaFeedbackControls } from './MediaFeedbackControls';
import { openGeneratedMedia } from './openGeneratedMedia';

export function MediaTile(
  { media, style, onRetry, contentFit = "cover" }: {
    media: GeneratedMedia;
    style?: ViewStyle;
    onRetry?: () => void;
    contentFit?: "cover" | "contain";
  },
) {
  const noun = media.media_type === "video" ? "Video" : "Photo";
  if (media.status === "queued" || media.status === "generating") {
    return <MediaProgress media={media} style={style} />;
  }
  if (media.status === "failed") {
    return (
      <View style={[styles.tile, styles.pending, style]}>
        <Camera color={colors.muted} />
        <Text style={styles.pendingTitle}>
          That {noun.toLowerCase()} didn’t come through
        </Text>
        <Text style={styles.caption}>
          {media.failure_reason_safe ?? "Ask again or retry."}
        </Text>
        {onRetry
          ? (
            <Pressable onPress={onRetry} style={styles.retry}>
              <RefreshCw size={14} color={colors.rose} />
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          )
          : null}
      </View>
    );
  }
  if (!media.signed_url) return null;
  return (
    <View style={[styles.tile, style]}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`Open ${noun.toLowerCase()}`}
        onPress={() => openGeneratedMedia(media.id)}
        style={[
          styles.mediaPressable,
          media.media_type === "image" && styles.mediaPressableWithFeedback,
        ]}
      >
        {media.media_type === "video" && media.parent_media_id
          ? <VideoPoster />
          : (
            <Image
              source={generatedMediaImageSource(media)}
              style={StyleSheet.absoluteFill}
              contentFit={contentFit}
              transition={180}
              cachePolicy="memory-disk"
              priority="low"
              recyclingKey={media.id}
            />
          )}
        {media.media_type === "video"
          ? (
            <View style={styles.play}>
              <Play size={20} color="#fff" fill="#fff" />
            </View>
          )
          : null}
      </Pressable>
      {media.media_type === "image"
        ? <MediaFeedbackControls media={media} style={styles.feedbackBelow} />
        : null}
    </View>
  );
}

function VideoPoster() {
  return (
    <View style={[StyleSheet.absoluteFill, styles.videoPoster]}>
      <Play size={34} color={colors.rose} />
      <Text style={styles.pendingTitle}>Shared video</Text>
    </View>
  );
}
