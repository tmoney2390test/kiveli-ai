import { type ReactNode, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Boxes,
  DollarSign,
  FileClock,
  Globe2,
  LifeBuoy,
  RefreshCw,
  Shield,
  Users,
} from "lucide-react-native";
import { router } from "expo-router";
const icons: Record<string, typeof Activity> = {
  overview: Activity,
  queues: Boxes,
  incidents: AlertTriangle,
  support: LifeBuoy,
  safety: Shield,
  users: Users,
  video_costs: DollarSign,
  worlds: Globe2,
  releases: Boxes,
  audit: FileClock,
  alerts: Activity,
};

export function OperationsFrame({
  tabs,
  active,
  onSelect,
  role,
  updatedAt,
  loading,
  onRefresh,
  children,
  contentKey,
}: {
  tabs: Array<{ key: string; label: string }>;
  active: string;
  onSelect: (key: string) => void;
  role: string;
  updatedAt: string;
  loading: boolean;
  onRefresh: () => void;
  children: ReactNode;
  contentKey?: string;
}) {
  const { width } = useWindowDimensions(),
    insets = useSafeAreaInsets(),
    compact = width < 1000;
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [active, contentKey]);
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {!compact
        ? (
          <View style={s.sidebar}>
            <View style={s.brand}>
              <Text style={s.brandName}>Kivelli</Text>
              <Text style={s.muted}>OPERATIONS</Text>
            </View>
            <ScrollView contentContainerStyle={s.navigation}>
              {tabs.map((item) => {
                const Icon = icons[item.key] ?? Activity;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: item.key === active }}
                    onPress={() => onSelect(item.key)}
                    style={[s.nav, item.key === active && s.selected]}
                  >
                    <Icon
                      size={18}
                      color={item.key === active ? "#C9B6FF" : "#98A5B7"}
                    />
                    <Text
                      style={[s.navText, item.key === active && s.activeText]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/home")}
              style={s.nav}
            >
              <ArrowLeft size={18} color="#98A5B7" />
              <Text style={s.navText}>Back to Kivelli</Text>
            </Pressable>
            <Text style={s.role}>{role} access</Text>
          </View>
        )
        : null}
      <View style={s.main}>
        <View style={s.header}>
          {compact
            ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to Kivelli"
                onPress={() => router.replace("/home")}
                style={s.icon}
              >
                <ArrowLeft size={20} color="#EDF1F7" />
              </Pressable>
            )
            : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text accessibilityRole="header" style={s.title}>
              {tabs.find((item) => item.key === active)?.label ?? "Operations"}
            </Text>
            <Text style={s.muted}>
              {loading
                ? "Refreshing data…"
                : `Updated ${
                  new Date(updatedAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                }`} · {role} access
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh operations"
            disabled={loading}
            onPress={onRefresh}
            style={s.icon}
          >
            {loading
              ? <ActivityIndicator color="#C9B6FF" size="small" />
              : <RefreshCw size={18} color="#CBD5E1" />}
          </Pressable>
        </View>
        {compact
          ? (
            <ScrollView
              horizontal
              style={{ flexGrow: 0 }}
              contentContainerStyle={s.mobileTabs}
              showsHorizontalScrollIndicator={false}
            >
              {tabs.map((item) => (
                <Pressable
                  key={item.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: item.key === active }}
                  onPress={() => onSelect(item.key)}
                  style={[s.nav, item.key === active && s.selected]}
                >
                  <Text style={s.navText}>{item.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )
          : null}
        <ScrollView
          ref={scroll}
          contentContainerStyle={[s.content, {
            paddingBottom: Math.max(insets.bottom, 24) + 24,
          }, compact && { paddingHorizontal: 16 }]}
        >
          {children}
        </ScrollView>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", backgroundColor: "#0B1018" },
  sidebar: {
    width: 204,
    backgroundColor: "#0E1520",
    borderRightWidth: 1,
    borderRightColor: "#263142",
    padding: 12,
  },
  brand: { padding: 14, gap: 5, marginBottom: 16 },
  brandName: { fontSize: 25, fontWeight: "700", color: "#F0F3F9" },
  muted: { fontSize: 12, color: "#99A7BA", lineHeight: 19 },
  navigation: { gap: 4 },
  nav: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 7,
  },
  selected: { backgroundColor: "#2C2849" },
  navText: { fontSize: 13, color: "#BAC5D5", fontWeight: "500" },
  activeText: { color: "#D9C9FF" },
  role: {
    color: "#8290A3",
    fontSize: 11,
    padding: 12,
    textTransform: "capitalize",
  },
  main: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 19,
    borderBottomWidth: 1,
    borderBottomColor: "#263142",
  },
  title: { fontSize: 25, fontWeight: "600", color: "#EDF1F7", marginBottom: 3 },
  icon: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#344155",
    borderRadius: 8,
  },
  mobileTabs: { padding: 10, gap: 6 },
  content: {
    width: "100%",
    maxWidth: 1560,
    alignSelf: "center",
    padding: 24,
    gap: 18,
  },
});
