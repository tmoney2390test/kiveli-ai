import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Image, type ImageSource } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Minus, Plus, RotateCcw, X } from "lucide-react-native";
import { colors, radius } from "../theme";
import { clampImageZoom, MAX_IMAGE_ZOOM, MIN_IMAGE_ZOOM } from "../lib/imageZoom";

const DOUBLE_TAP_ZOOM = 2.5;

export function ImageLightbox({
  visible,
  source,
  accessibilityLabel = "Full-size photo",
  onClose,
}: {
  visible: boolean;
  source: ImageSource | number;
  accessibilityLabel?: string;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const stageRef = useRef<View>(null);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);

  const reset = useCallback((animated = true) => {
    const next = (value: number) => animated ? withTiming(value, { duration: 170 }) : value;
    scale.value = next(1);
    savedScale.value = 1;
    translateX.value = next(0);
    translateY.value = next(0);
  }, [savedScale, scale, translateX, translateY]);

  const setZoom = useCallback((requested: number) => {
    const next = clampImageZoom(requested);
    scale.value = withTiming(next, { duration: 140 });
    savedScale.value = next;
    if (next === MIN_IMAGE_ZOOM) {
      translateX.value = withTiming(0, { duration: 140 });
      translateY.value = withTiming(0, { duration: 140 });
    }
  }, [savedScale, scale, translateX, translateY]);

  useEffect(() => {
    if (visible) reset(false);
  }, [reset, visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const node = stageRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const handleWheel = (rawEvent: Event) => {
      const event = rawEvent as WheelEvent;
      event.preventDefault();
      const multiplier = event.deltaY < 0 ? 1.16 : 1 / 1.16;
      setZoom(savedScale.value * multiplier);
    };
    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [savedScale, setZoom, visible]);

  const pinch = useMemo(() => Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(MAX_IMAGE_ZOOM, Math.max(MIN_IMAGE_ZOOM, savedScale.value * event.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= MIN_IMAGE_ZOOM) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
      }
    }), [savedScale, scale, translateX, translateY]);

  const pan = useMemo(() => Gesture.Pan()
    .minDistance(2)
    .onBegin(() => {
      panStartX.value = translateX.value;
      panStartY.value = translateY.value;
    })
    .onUpdate((event) => {
      if (scale.value <= MIN_IMAGE_ZOOM) return;
      const maxX = Math.max(0, (width * (scale.value - 1)) / 2);
      const maxY = Math.max(0, (height * (scale.value - 1)) / 2);
      translateX.value = Math.min(maxX, Math.max(-maxX, panStartX.value + event.translationX));
      translateY.value = Math.min(maxY, Math.max(-maxY, panStartY.value + event.translationY));
    }), [height, panStartX, panStartY, scale, translateX, translateY, width]);

  const doubleTap = useMemo(() => Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > MIN_IMAGE_ZOOM) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
      } else {
        scale.value = withTiming(DOUBLE_TAP_ZOOM);
        savedScale.value = DOUBLE_TAP_ZOOM;
      }
    }), [savedScale, scale, translateX, translateY]);

  const gesture = useMemo(
    () => Gesture.Simultaneous(pinch, pan, doubleTap),
    [doubleTap, pan, pinch],
  );
  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <View pointerEvents="none" style={styles.backdrop} />
        <View ref={stageRef} style={styles.stage}>
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.imageCanvas, animatedImageStyle]}>
              <Image
                source={source}
                style={StyleSheet.absoluteFill}
                contentFit="contain"
                cachePolicy="memory-disk"
                priority="high"
                accessibilityLabel={accessibilityLabel}
              />
            </Animated.View>
          </GestureDetector>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close full-size photo"
          onPress={onClose}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <X size={23} color="#fff" />
        </Pressable>
        <View style={styles.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => setZoom(savedScale.value / 1.35)} style={styles.controlButton}>
            <Minus size={18} color="#fff" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Reset photo zoom" onPress={() => reset()} style={styles.controlButton}>
            <RotateCcw size={17} color="#fff" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => setZoom(savedScale.value * 1.35)} style={styles.controlButton}>
            <Plus size={18} color="#fff" />
          </Pressable>
        </View>
        <Text pointerEvents="none" style={styles.hint}>
          {Platform.OS === "web" ? "Scroll to zoom · drag to move · double-click to reset" : "Pinch to zoom · drag to move · double-tap to reset"}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(2,2,7,.88)",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(8,5,14,.54)",
    ...(Platform.OS === "web" ? ({ backdropFilter: "blur(22px)" } as never) : {}),
  },
  stage: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  imageCanvas: {
    flex: 1,
    marginHorizontal: 10,
    marginVertical: 44,
  },
  close: {
    position: "absolute",
    right: 18,
    top: Platform.OS === "web" ? 18 : 48,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20,16,27,.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.20)",
  },
  controls: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 42 : 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 5,
    borderRadius: radius.pill,
    backgroundColor: "rgba(20,16,27,.80)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.18)",
  },
  controlButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 16 : 32,
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "700",
  },
  pressed: { opacity: .72, transform: [{ scale: .96 }] },
});
