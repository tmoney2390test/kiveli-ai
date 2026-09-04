import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../theme";

type ConversationTimelineSkeletonProps = {
  label?: string;
};

export function ConversationTimelineSkeleton({
  label = "Loading conversation messages",
}: ConversationTimelineSkeletonProps) {
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      style={styles.root}
    >
      <Text style={styles.status}>Loading messages…</Text>
      <View importantForAccessibility="no-hide-descendants" style={styles.timeline}>
        <View style={styles.day} />
        <View style={styles.incomingRow}>
          <View style={styles.avatar} />
          <View style={[styles.bubble, styles.incomingBubble]}>
            <View style={[styles.line, styles.lineLong]} />
            <View style={[styles.line, styles.lineMedium]} />
            <View style={[styles.line, styles.lineShort]} />
          </View>
        </View>
        <View style={[styles.bubble, styles.outgoingBubble]}>
          <View style={[styles.line, styles.lineMedium]} />
          <View style={[styles.line, styles.lineShort]} />
        </View>
        <View style={styles.incomingRow}>
          <View style={styles.avatar} />
          <View style={[styles.bubble, styles.incomingBubble, styles.lastBubble]}>
            <View style={[styles.line, styles.lineLong]} />
            <View style={[styles.line, styles.lineLong]} />
            <View style={[styles.line, styles.lineMedium]} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingTop: 8,
  },
  status: {
    alignSelf: "center",
    marginBottom: 18,
    color: colors.dimmed,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  timeline: { width: "100%", gap: 15 },
  day: {
    width: 68,
    height: 8,
    alignSelf: "center",
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,.055)",
  },
  incomingRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 9,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(216,62,234,.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.055)",
  },
  bubble: {
    minHeight: 60,
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 15,
    paddingVertical: 13,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.055)",
  },
  incomingBubble: {
    width: "68%",
    maxWidth: 510,
    backgroundColor: "rgba(255,255,255,.035)",
    borderBottomLeftRadius: 6,
  },
  outgoingBubble: {
    width: "53%",
    maxWidth: 410,
    alignSelf: "flex-end",
    backgroundColor: "rgba(150,55,181,.10)",
    borderColor: "rgba(216,62,234,.10)",
    borderBottomRightRadius: 6,
  },
  lastBubble: { minHeight: 78 },
  line: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,.075)",
  },
  lineLong: { width: "92%" },
  lineMedium: { width: "70%" },
  lineShort: { width: "43%" },
});
