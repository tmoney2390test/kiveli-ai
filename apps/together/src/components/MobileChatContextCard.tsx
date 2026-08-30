import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Brain, CalendarDays, ChevronDown, LockKeyhole, MapPin } from "lucide-react-native";
import { colors, radius } from "../theme";

export function MobileChatContextCard({
  identityKey,
  name,
  accessibilityName,
  location,
  activity,
  next,
  memoryCount,
  memoryLocked,
  onMemory,
  onPlan,
}: {
  identityKey: string;
  name: string;
  accessibilityName?: string;
  location: string;
  activity: string;
  next?: { title: string; detail: string; onPress?: () => void } | null;
  memoryCount: number;
  memoryLocked: boolean;
  onMemory: () => void;
  onPlan?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [identityKey]);
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Hide" : "Show"} conversation context for ${accessibilityName ?? name}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [styles.summary, pressed && styles.pressed]}
      >
        <View style={styles.locationIcon}><MapPin size={15} color={colors.warm} /></View>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.title}>{location}</Text>
          <Text numberOfLines={1} style={styles.activity}>{activity}</Text>
        </View>
        <ChevronDown
          size={18}
          color={colors.muted}
          style={expanded ? { transform: [{ rotate: "180deg" }] } : undefined}
        />
      </Pressable>
      {expanded ? (
        <View style={styles.details}>
          {next ? (
            <Pressable
              accessibilityRole={next.onPress ? "button" : undefined}
              disabled={!next.onPress}
              onPress={next.onPress}
              style={styles.detailRow}
            >
              <CalendarDays size={16} color={colors.rose} />
              <View style={styles.copy}>
                <Text style={styles.kicker}>NEXT TOGETHER</Text>
                <Text numberOfLines={1} style={styles.detailTitle}>{next.title}</Text>
                <Text numberOfLines={1} style={styles.detailCopy}>{next.detail}</Text>
              </View>
            </Pressable>
          ) : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onMemory} style={styles.action}>
              {memoryLocked ? <LockKeyhole size={16} color={colors.violet} /> : <Brain size={16} color={colors.violet} />}
              <Text style={styles.actionText}>Memories · {memoryCount}</Text>
            </Pressable>
            {onPlan ? (
              <Pressable accessibilityRole="button" onPress={onPlan} style={[styles.action, styles.planAction]}>
                <CalendarDays size={16} color="#fff" />
                <Text style={[styles.actionText, styles.planText]}>Plan something</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 10, marginTop: 7, borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(174,124,232,.2)", backgroundColor: "rgba(24,19,34,.92)", overflow: "hidden" },
  summary: { minHeight: 48, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 9 },
  locationIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(242,162,127,.09)" },
  copy: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 12, fontWeight: "900" },
  activity: { color: colors.muted, fontSize: 10, marginTop: 2 },
  details: { borderTopWidth: 1, borderTopColor: colors.border, padding: 10, gap: 10 },
  detailRow: { minHeight: 48, padding: 10, borderRadius: radius.sm, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: colors.surface },
  kicker: { color: colors.rose, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  detailTitle: { color: colors.text, fontSize: 12, fontWeight: "800", marginTop: 2 },
  detailCopy: { color: colors.muted, fontSize: 10, marginTop: 2 },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1, minHeight: 44, paddingHorizontal: 10, borderRadius: radius.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderWidth: 1, borderColor: colors.border },
  planAction: { backgroundColor: colors.rose, borderColor: colors.rose },
  actionText: { color: colors.text, fontSize: 10, fontWeight: "800" },
  planText: { color: "#fff" },
  pressed: { backgroundColor: "rgba(168,69,242,.08)" },
});
