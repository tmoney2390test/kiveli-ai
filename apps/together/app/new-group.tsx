import { styles } from '../src/styles/newGroupStyles';
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
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
import { colors } from "../src/theme";
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
