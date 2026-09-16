import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { ArrowUpRight, LifeBuoy } from "lucide-react-native";
import { recoveryTopics } from "../lib/supportRecovery";
import { colors } from "../theme";

export function SupportRecoveryLinks(
  { onTopic }: { onTopic?: (topic: typeof recoveryTopics[number]) => void },
) {
  return (
    <View style={s.root}>
      <View style={s.heading}>
        <LifeBuoy color="#CBA6EF" size={22} />
        <Text accessibilityRole="header" style={s.title}>Help & recovery</Text>
      </View>
      <Text style={s.body}>
        Try the relevant recovery option, or send a request with the details you
        want support to review.
      </Text>
      {recoveryTopics.map((topic) => (
        <View key={topic.id} style={s.card}>
          <Text style={s.label}>{topic.title}</Text>
          <Text style={s.body}>{topic.body}</Text>
          <View style={s.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(topic.route as never)}
              style={s.action}
            >
              <Text style={s.link}>{topic.action}</Text>
              <ArrowUpRight size={16} color="#CBA6EF" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Get support: ${topic.title}`}
              onPress={() =>
                onTopic
                  ? onTopic(topic)
                  : router.push(`/support?topic=${topic.id}` as never)}
              style={s.action}
            >
              <Text style={s.link}>Get support</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  root: { gap: 12 },
  heading: { flexDirection: "row", gap: 10, alignItems: "center" },
  title: { fontSize: 23, fontWeight: "700", color: colors.text },
  label: { fontSize: 16, fontWeight: "600", color: colors.text },
  body: { fontSize: 13, lineHeight: 20, color: colors.muted },
  card: {
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  action: { minHeight: 44, flexDirection: "row", gap: 6, alignItems: "center" },
  link: { fontSize: 13, color: "#CBA6EF", fontWeight: "600" },
});
