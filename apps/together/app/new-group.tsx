import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Check, ChevronLeft, Lock, Users } from "lucide-react-native";
import { CharacterAvatar, FrostedSurface } from "../src/components";
import { manageGroup } from "../src/lib/api";
import { groupWorldOptions } from "../src/lib/groupWorld";
import { parseGroupPrefillParticipants } from "../src/lib/groupInvite";
import { useTogether } from "../src/store/useTogether";
import { colors, radius, spacing, typography } from "../src/theme";
import type { GroupDetail } from "../src/types";
import { subscriptionHref } from "../src/lib/subscriptionPresentation";

export default function NewGroupScreen() {
  const params = useLocalSearchParams<{ participants?: string | string[]; world?: string | string[] }>(),
    snapshot = useTogether((state) => state.snapshot),
    browsedWorldId = useTogether((state) => state.browsedWorldId),
    refresh = useTogether((state) => state.refresh);
  const [selected, setSelected] = useState<string[]>([]),
    [selectedWorldId, setSelectedWorldId] = useState<string | null>(null),
    [title, setTitle] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const appliedPrefill = useRef<string | null>(null);
  const allowed =
    snapshot?.entitlements?.entitlement_keys?.includes("group_chat") === true;
  const worldOptions = useMemo(
    () => snapshot ? groupWorldOptions(snapshot) : [],
    [snapshot],
  );
  const participantParam = routeParam(params.participants),
    worldParam = routeParam(params.world),
    prefillKey = `${participantParam ?? ""}|${worldParam ?? ""}`;
  useEffect(() => {
    if (!participantParam || !worldOptions.length || appliedPrefill.current === prefillKey) return;
    const requestedIds = parseGroupPrefillParticipants(participantParam);
    const option = worldOptions.find((item) => item.world.id === worldParam || item.world.slug === worldParam) ??
      worldOptions.find((item) => item.characters.some((character) => requestedIds.includes(character.id)));
    if (!option) return;
    const eligibleIds = new Set(option.characters.map((character) => character.id));
    setSelected(requestedIds.filter((id) => eligibleIds.has(id)));
    setSelectedWorldId(option.world.id);
    appliedPrefill.current = prefillKey;
  }, [participantParam, prefillKey, worldOptions, worldParam]);
  const activeWorldId =
    worldOptions.some((option) => option.world.id === selectedWorldId)
      ? selectedWorldId
      : worldOptions.some((option) => option.world.id === browsedWorldId)
      ? browsedWorldId
      : worldOptions.find((option) => option.characters.length >= 2)?.world
        .id ??
        worldOptions[0]?.world.id ?? null;
  const activeOption = worldOptions.find((option) =>
    option.world.id === activeWorldId
  );
  const characters = activeOption?.characters ?? [];
  const chooseWorld = (worldId: string) => {
    if (worldId === activeWorldId) return;
    setSelected([]);
    setSelectedWorldId(worldId);
    setError("");
  };
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length < 5
        ? [...current, id]
        : current
    );
  const create = async () => {
    if (selected.length < 2) return;
    setBusy(true);
    setError("");
    try {
      const result = await manageGroup<GroupDetail>({
        action: "create",
        characterInstanceIds: selected,
        worldId: activeWorldId,
        title: title.trim() || undefined,
        requestId: crypto.randomUUID(),
      });
      await refresh();
      router.replace(
        `/group-chat?id=${encodeURIComponent(result.conversation.id)}` as never,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The group could not be created.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.glow} />
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back to Messages"
          onPress={() => router.canGoBack() ? router.back() : router.replace('/chat-tab?inbox=1')}
          style={styles.back}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>NEW CONVERSATION</Text>
          <Text style={styles.heading}>New Group</Text>
        </View>
        <View style={styles.count}>
          <Users size={14} color={colors.muted} />
          <Text style={styles.countText}>{selected.length}/5</Text>
        </View>
      </View>
      {!allowed
        ? (
          <View style={styles.gate}>
            <FrostedSurface intensity={90} style={styles.gateCard}>
              <View style={styles.gateIcon}>
                <Lock size={22} color={colors.rose} />
              </View>
              <Text style={styles.gateTitle}>
                Group chats are a Kivelle+ feature
              </Text>
              <Text style={styles.gateCopy}>
                Bring distinct companions into one persistent conversation with
                Kivelle+ or Max.
              </Text>
              <Pressable
                onPress={() => router.push(subscriptionHref({intent:"group_chat",returnTo:"/new-group"}) as never)}
                style={styles.primary}
              >
                <Text style={styles.primaryText}>See subscriptions</Text>
              </Pressable>
            </FrostedSurface>
          </View>
        )
        : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>
              GROUP NAME <Text style={styles.optional}>OPTIONAL</Text>
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              maxLength={80}
              placeholder="Weekend plans"
              placeholderTextColor={colors.dimmed}
              style={styles.input}
            />
            <View style={styles.sectionLine}>
              <Text style={styles.label}>FILTER BY WORLD</Text>
              <Text style={styles.help}>
                Same-world groups only. Choose a world to see who can join.
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.worlds}
            >
              {worldOptions.map((option) => {
                const active = option.world.id === activeWorldId;
                return (
                  <Pressable
                    key={option.world.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={`${option.world.name}, ${option.characters.length} available companions`}
                    onPress={() => chooseWorld(option.world.id)}
                    style={[styles.world, active && styles.worldActive]}
                  >
                    <Text
                      style={[
                        styles.worldName,
                        active && styles.worldNameActive,
                      ]}
                    >
                      {option.world.name}
                    </Text>
                    <Text style={styles.worldCount}>
                      {option.characters.length} available
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.sectionLine}>
              <View>
                <Text style={styles.label}>CHOOSE 2–5 COMPANIONS</Text>
                <Text style={styles.help}>
                  Showing companions from{" "}
                  {activeOption?.world.name ?? "this world"}.
                </Text>
              </View>
            </View>
            <View style={styles.grid}>
              {characters.map((character) => {
                const template = character.together_character_templates,
                  active = selected.includes(character.id);
                return (
                  <Pressable
                    key={character.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    onPress={() => toggle(character.id)}
                    style={(
                      { pressed },
                    ) => [
                      styles.person,
                      active && styles.personActive,
                      pressed && { opacity: .75 },
                    ]}
                  >
                    <CharacterAvatar
                      slug={template.slug}
                      name={template.name}
                      template={template}
                      version={character.together_character_versions}
                      size={64}
                    />
                    <View style={styles.personCopy}>
                      <Text style={styles.personName} numberOfLines={1}>
                        {template.name}
                      </Text>
                      <Text style={styles.personMeta} numberOfLines={1}>
                        {template.occupation || character.current_activity ||
                          "Kivelle companion"}
                      </Text>
                    </View>
                    <View style={[styles.check, active && styles.checkActive]}>
                      {active
                        ? <Check size={15} color="#fff" strokeWidth={3} />
                        : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {!characters.length
              ? (
                <Text style={styles.empty}>
                  Meet companions in a world before starting a group.
                </Text>
              )
              : characters.length < 2
              ? (
                <Text style={styles.empty}>
                  Meet another companion in {activeOption?.world.name}{" "}
                  to start a group here.
                </Text>
              )
              : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              disabled={selected.length < 2 || busy}
              onPress={() => void create()}
              style={[styles.primary, selected.length < 2 && styles.disabled]}
            >
              {busy
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.primaryText}>Create group</Text>}
            </Pressable>
          </ScrollView>
        )}
    </View>
  );
}

function routeParam(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  glow: {
    position: "absolute",
    top: -120,
    left: "15%",
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: "rgba(123,58,154,.15)",
  },
  header: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    minHeight: 92,
    paddingHorizontal: spacing.lg,
    paddingTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,.05)",
  },
  headerCopy: { flex: 1 },
  kicker: {
    color: colors.rose,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  heading: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 28,
    fontWeight: "700",
    marginTop: 2,
  },
  count: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,.05)",
  },
  countText: { color: colors.muted, fontSize: 12, fontWeight: "800" },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: spacing.lg,
    paddingBottom: 60,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginTop: 12,
  },
  optional: { color: colors.dimmed, fontSize: 9 },
  input: {
    height: 54,
    marginTop: 10,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    color: colors.text,
    fontSize: 16,
    backgroundColor: "rgba(31,24,39,.8)",
    borderWidth: 1,
    borderColor: colors.borderBright,
  },
  sectionLine: { marginTop: 25, marginBottom: 14 },
  help: { color: colors.muted, fontSize: 12, marginTop: 5 },
  worlds: { gap: 9, paddingRight: 12 },
  world: {
    minWidth: 138,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(20,17,27,.72)",
  },
  worldActive: {
    borderColor: "rgba(216,62,234,.62)",
    backgroundColor: "rgba(88,37,100,.38)",
  },
  worldName: { color: colors.textSecondary, fontSize: 13, fontWeight: "900" },
  worldNameActive: { color: colors.text },
  worldCount: { color: colors.muted, fontSize: 10, marginTop: 4 },
  grid: { gap: 9 },
  person: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(20,17,27,.72)",
  },
  personActive: {
    borderColor: "rgba(216,62,234,.62)",
    backgroundColor: "rgba(88,37,100,.38)",
  },
  personCopy: { minWidth: 0, flex: 1 },
  personName: { color: colors.text, fontSize: 16, fontWeight: "900" },
  personMeta: { color: colors.muted, fontSize: 12, marginTop: 5 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.borderBright,
    alignItems: "center",
    justifyContent: "center",
  },
  checkActive: { backgroundColor: colors.rose, borderColor: colors.rose },
  primary: {
    height: 54,
    marginTop: 24,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.rose,
    shadowColor: colors.rose,
    shadowOpacity: .25,
    shadowRadius: 16,
  },
  primaryText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  disabled: { opacity: .38 },
  error: {
    color: colors.danger,
    fontSize: 12,
    marginTop: 14,
    textAlign: "center",
  },
  empty: { color: colors.muted, textAlign: "center", paddingVertical: 40 },
  gate: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  gateCard: {
    width: "100%",
    maxWidth: 480,
    alignItems: "center",
    padding: 28,
    borderRadius: radius.xl,
    backgroundColor: "rgba(30,23,39,.9)",
    borderColor: "rgba(216,62,234,.28)",
  },
  gateIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,62,234,.12)",
  },
  gateTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 25,
    textAlign: "center",
    marginTop: 18,
  },
  gateCopy: {
    color: colors.muted,
    textAlign: "center",
    lineHeight: 20,
    marginTop: 8,
  },
});
