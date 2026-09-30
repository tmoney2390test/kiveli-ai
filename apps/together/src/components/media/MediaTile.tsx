import { useMediaStatusRecovery } from '../../lib/useMediaStatusRecovery';
import { mediaFailurePresentation } from '../../lib/mediaProgressPresentation';
import { MediaRecoveryActions } from './MediaRecoveryActions';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Camera, Play } from 'lucide-react-native';
import type { GeneratedMedia } from '../../types';
import { colors } from '../../theme';
import { generatedMediaImageSource } from '../../lib/mediaImageSource';
import { styles } from '../../styles/mediaStyles';
import { MediaProgress } from './MediaProgress';
import { MediaFeedbackControls } from './MediaFeedbackControls';
import { openGeneratedMedia } from './openGeneratedMedia';
import { FreePhotoBadge } from './FreePhotoBadge';

export function MediaTile(
  { media: sourceMedia, style, onRetry, contentFit = "cover", showFreeBadge = false }: {
    media: GeneratedMedia;
    style?: ViewStyle;
    onRetry?: () => void;
    contentFit?: "cover" | "contain";
    showFreeBadge?: boolean;
  },
) {
  const recovery = useMediaStatusRecovery(sourceMedia);
  const media = recovery.media ?? sourceMedia;
  const failure = mediaFailurePresentation(media);
  const noun = media.media_type === "video" ? "Video" : "Photo";
  if (media.status === "queued" || media.status === "generating" || media.status === "ready" && !media.signed_url) {
    return <MediaProgress media={media} style={style} progress={recovery.progress} recovery={<MediaRecoveryActions media={media} checking={recovery.busy} notice={recovery.notice} onCheck={() => void recovery.check()} />} />;
  }
  if (media.status === "failed") {
    return (
      <View style={[styles.tile, styles.pending, style, {height: undefined, minHeight: 238}]}>
        <Camera color={colors.muted} />
        <Text style={styles.pendingTitle}>
          That {noun.toLowerCase()} didn’t come through
        </Text>
        <Text style={styles.caption}>
          {failure.message}
        </Text>
        <MediaRecoveryActions media={media} checking={recovery.busy} notice={recovery.notice} onCheck={() => void recovery.check()} onRetry={onRetry} failed />
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
      {showFreeBadge && media.media_type === "image" ? <FreePhotoBadge media={media} /> : null}
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
