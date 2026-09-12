import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Text, View, type ViewStyle } from 'react-native';
import { Camera, Sparkles } from 'lucide-react-native';
import type { GeneratedMedia } from '../../types';
import { colors } from '../../theme';
import { styles } from '../../styles/mediaStyles';

export function MediaProgress(
  { media, style }: { media: GeneratedMedia; style?: ViewStyle },
) {
  const pulse = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: Platform.OS!=='web',
      }),
      Animated.timing(pulse, {
        toValue: 0,
        duration: 1300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: Platform.OS!=='web',
      }),
    ]));
    const scanLoop = Animated.loop(Animated.timing(scan, {
      toValue: 1,
      duration: 2400,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: Platform.OS!=='web',
    }));
    pulseLoop.start();
    scanLoop.start();
    return () => {
      pulseLoop.stop();
      scanLoop.stop();
    };
  }, [pulse, scan]);

  const isVideo = media.media_type === "video";
  const title = isVideo
    ? "Bringing the moment to life…"
    : media.status === "queued"
    ? "Getting the photo ready…"
    : "Taking the photo…";
  const context = pendingContext(media.metadata ?? {});

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      accessibilityLabel={isVideo
        ? "Companion video is being generated"
        : "Companion photo is being generated"}
      style={[styles.tile, styles.progressCard, style]}
    >
      <View pointerEvents="none" style={styles.progressBackdrop}>
        <View style={[styles.glow, styles.glowRose]} />
        <View style={[styles.glow, styles.glowViolet]} />
        <Animated.View
          style={[
            styles.scanLine,
            {
              opacity: scan.interpolate({
                inputRange: [0, 0.18, 0.82, 1],
                outputRange: [0, 0.7, 0.7, 0],
              }),
              transform: [{
                translateY: scan.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-92, 92],
                }),
              }],
            },
          ]}
        />
      </View>
      <View style={styles.progressBadge}>
        <Sparkles size={11} color="#FFD8E7" />
        <Text style={styles.progressBadgeText}>
          {isVideo ? "MOMENT IN PROGRESS" : "PHOTO IN PROGRESS"}
        </Text>
      </View>
      <View style={styles.captureStage}>
        <Animated.View
          style={[
            styles.captureHalo,
            {
              opacity: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [0.28, 0.72],
              }),
              transform: [{
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.88, 1.12],
                }),
              }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.captureFrame,
            {
              transform: [{
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0.96],
                }),
              }],
            },
          ]}
        >
          <Camera size={31} color={colors.cream} strokeWidth={1.6} />
          <View style={styles.captureSpark}>
            <Sparkles size={13} color="#FF9CC0" fill="rgba(255,156,192,.2)" />
          </View>
        </Animated.View>
      </View>
      <View style={styles.progressCopy}>
        <Text style={styles.progressTitle}>{title}</Text>
        {context
          ? (
            <Text style={styles.progressContext} numberOfLines={1}>
              {context}
            </Text>
          )
          : null}
        <Text style={styles.progressHint}>
          You can keep chatting while it develops.
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              transform: [{
                scaleX: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.28, 1],
                }),
              }],
            },
          ]}
        />
      </View>
    </View>
  );
}

function pendingContext(metadata: Record<string, unknown>): string {
  const place = asRecord(metadata.placeContext);
  const location = asRecord(place?.location);
  const locationName = stringValue(location?.name) ??
    stringValue(place?.locationName);
  const activity = stringValue(metadata.activity);
  return [activity, locationName].filter((value): value is string =>
    Boolean(value)
  ).join(" · ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
