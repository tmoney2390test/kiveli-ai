import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageContentPosition, type ImageSource } from 'expo-image';

type Props = {
  source: ImageSource | number;
  accessibilityLabel?: string;
  contentPosition?: ImageContentPosition;
  frameStyle?: StyleProp<ViewStyle>;
  blurRadius?: number;
  dim?: number;
  priority?: 'low' | 'normal' | 'high';
  recyclingKey?: string;
  onError?: () => void;
};

/**
 * Keeps the complete composition visible while still filling the card edge to edge.
 * A softened cover layer supplies the atmosphere; the foreground uses contain so
 * faces, signage, and location anchors are not lost at responsive aspect ratios.
 */
export function DetailPreservingArtwork({
  source,
  accessibilityLabel,
  contentPosition = 'center',
  frameStyle,
  blurRadius = 0,
  dim = .16,
  priority = 'normal',
  recyclingKey,
  onError,
}: Props) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Image
      source={source}
      style={[StyleSheet.absoluteFill, styles.backdrop]}
      contentFit="cover"
      contentPosition={contentPosition}
      blurRadius={Math.max(14, blurRadius)}
      cachePolicy="memory-disk"
      priority={priority}
      recyclingKey={recyclingKey?`${recyclingKey}:backdrop`:undefined}
      onError={onError}
    />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(7,5,10,${dim})` }]} />
    <View style={[StyleSheet.absoluteFill, frameStyle]}>
      <Image
        accessibilityLabel={accessibilityLabel}
        source={source}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        contentPosition={contentPosition}
        blurRadius={blurRadius}
        transition={180}
        cachePolicy="memory-disk"
        priority={priority}
        recyclingKey={recyclingKey}
        onError={onError}
      />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  backdrop: { opacity: .56, transform: [{ scale: 1.06 }] },
});
