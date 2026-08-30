import { Pressable, StyleSheet, Text } from "react-native";
import { ArrowDown } from "lucide-react-native";
import { colors, radius } from "../theme";

export function JumpToLatestButton({
  visible,
  onPress,
  bottom = 92,
}: {
  visible: boolean;
  onPress: () => void;
  bottom?: number;
}) {
  if (!visible) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Jump to latest message"
      onPress={onPress}
      style={({ pressed }) => [styles.button, { bottom }, pressed && styles.pressed]}
    >
      <ArrowDown size={16} color="#fff" />
      <Text style={styles.label}>Latest</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    zIndex: 24,
    right: 16,
    minHeight: 44,
    paddingHorizontal: 15,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: colors.rose,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.2)",
    shadowColor: "#000",
    shadowOpacity: .34,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
  },
  label: { color: "#fff", fontSize: 12, fontWeight: "900" },
  pressed: { opacity: .82, transform: [{ scale: .98 }] },
});
