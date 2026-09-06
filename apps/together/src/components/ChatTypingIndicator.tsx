import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export function ChatTypingIndicator({ name }: { name: string }) {
  const dots = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    dots.forEach((value) => value.setValue(0));
    const wave = Animated.loop(
      Animated.sequence([
        Animated.stagger(120, dots.map((value) =>
          Animated.sequence([
            Animated.timing(value, {
              toValue: 1,
              duration: 180,
              easing: Easing.out(Easing.quad),
              useNativeDriver: Platform.OS !== "web",
            }),
            Animated.timing(value, {
              toValue: 0,
              duration: 180,
              easing: Easing.in(Easing.quad),
              useNativeDriver: Platform.OS !== "web",
            }),
          ])
        )),
        Animated.delay(180),
      ]),
      { resetBeforeIteration: true },
    );
    wave.start();
    return () => {
      wave.stop();
      dots.forEach((value) => {
        value.stopAnimation();
        value.setValue(0);
      });
    };
  }, [dots]);

  return <View
    accessibilityLabel={`${name} is typing`}
    accessibilityLiveRegion="polite"
    style={styles.typing}
  >
    <View accessibilityElementsHidden style={styles.typingDots}>
      {dots.map((value, index) => <Animated.View
        key={index}
        style={[styles.dot, {
          opacity: value.interpolate({ inputRange: [0, 1], outputRange: [.34, 1] }),
          transform: [
            { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
            { scale: value.interpolate({ inputRange: [0, 1], outputRange: [.82, 1.08] }) },
          ],
        }]}
      />)}
    </View>
    <Text style={styles.typingText}>{name} is typing</Text>
  </View>;
}

const styles = StyleSheet.create({
  typing: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 35,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  typingDots: { flexDirection: "row", gap: 3 },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.rose,
    opacity: .5,
  },
  typingText: { color: colors.muted, fontSize: 12, fontStyle: "italic" },
});
