import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { MessageCircle, Pin, UsersRound } from "lucide-react-native";
import { manageGroup } from "../lib/api";
import { cacheGroupDetailSummary } from "../lib/groupDetailCache";
import {
  inboxPreview,
  isConversationPinned,
  isActiveInboxConversation,
  returnToMessagesInbox,
} from "../lib/messageInbox";
import { conversationRouteTarget } from "../lib/conversationNavigation";
import { warmRoute } from "../lib/routeWarmup";
import { colors, radius } from "../theme";
import type {
  CharacterInstance,
  Conversation,
  GroupDetail,
  Snapshot,
} from "../types";
import { CharacterAvatar } from "./ui";
import { naturalizeCharacterActivity } from "@together/domain/src/character-language";

const groupRailCache = new Map<string, GroupDetail[]>();

type RailRow = {
  conversation: Conversation;
  character?: CharacterInstance;
  group?: GroupDetail;
};

export function ChatConversationRail({
  snapshot,
  activeConversationId,
}: {
  snapshot: Snapshot;
  activeConversationId: string;
}) {
  const scope = snapshot.activeContinuity?.id ?? "default";
  const [groups, setGroups] = useState<GroupDetail[]>(() =>
    groupRailCache.get(scope) ?? []
  );
  const [openingConversationId, setOpeningConversationId] = useState<string | null>(null);
  const hasGroups = snapshot.conversations.some((conversation) =>
    isActiveInboxConversation(conversation) && conversation.kind === "group"
  );

  useEffect(() => {
    setGroups(groupRailCache.get(scope) ?? []);
    if (!hasGroups) return;
    let cancelled = false;
    void manageGroup<{ groups: GroupDetail[] }>({ action: "list" })
      .then(({ groups: next }) => {
        if (cancelled) return;
        groupRailCache.set(scope, next);
        next.forEach((group) => cacheGroupDetailSummary(scope, group));
        setGroups(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [hasGroups, scope]);

  useEffect(() => {
    groups.forEach((group) => cacheGroupDetailSummary(scope, group));
  }, [groups, scope]);

  useEffect(() => setOpeningConversationId(null), [activeConversationId]);

  const groupByConversation = useMemo(
    () => new Map(groups.map((group) => [group.conversation.id, group])),
    [groups],
  );
  const rows = useMemo<RailRow[]>(() =>
    snapshot.conversations
      .filter(isActiveInboxConversation)
      .map((conversation) => ({
        conversation,
        character: snapshot.characters.find((character) =>
          character.id === conversation.character_instance_id
        ),
        group: groupByConversation.get(conversation.id),
      }))
      .filter((row) => row.conversation.kind === "group" || row.character)
      .sort((left, right) => {
        const pinned = Number(isConversationPinned(right.conversation)) -
          Number(isConversationPinned(left.conversation));
        return pinned || conversationTime(right.conversation) -
          conversationTime(left.conversation);
      }), [groupByConversation, snapshot.characters, snapshot.conversations]);

  const openConversation = (row: RailRow) => {
    if (row.conversation.id === activeConversationId) return;
    setOpeningConversationId(row.conversation.id);
    if (row.conversation.kind === "group") {
      openRailHref(`/group-chat?id=${encodeURIComponent(row.conversation.id)}`);
      return;
    }
    const template = row.character?.together_character_templates;
    if (!template) return;
    openRailHref(
      `/chat?character=${
        encodeURIComponent(template.public_handle ?? template.slug)
      }`,
    );
  };

  const openMessages = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      router.replace({ pathname: "/(tabs)/chat-tab", params: { messages: "1" } } as never);
      return;
    }
    returnToMessagesInbox({
      reset: (href) => router.replace(href as never),
      navigate: (href) => router.push(href as never),
    });
  };

  return (
    <View style={styles.rail}>
      <View style={styles.headingRow}>
        <Text style={styles.kicker}>CONVERSATIONS</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View all conversations"
          onPress={openMessages}
        >
          <Text style={styles.viewAll}>View all</Text>
        </Pressable>
      </View>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {rows.map((row) => {
          const active = row.conversation.id === activeConversationId;
          const opening = row.conversation.id === openingConversationId;
          const group = row.conversation.kind === "group";
          const name = group
            ? row.conversation.title || groupName(row.group) || "Group chat"
            : row.character?.together_character_templates.name ??
              row.conversation.title ?? "Conversation";
          const preview = inboxPreview(row.conversation) || (row.character
            ? naturalizeCharacterActivity(row.character.current_activity,{occupation:row.character.together_character_templates.occupation})
            : "Continue the conversation");
          return (
            <Pressable
              key={row.conversation.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${name}${
                row.conversation.unread ? ", unread" : ""
              }`}
              accessibilityState={{ selected: active, busy: opening }}
              onHoverIn={() => warmConversation(row)}
              onPressIn={() => warmConversation(row)}
              onPress={() => openConversation(row)}
              style={({ pressed }) => [
                styles.row,
                active && styles.rowActive,
                opening && styles.rowOpening,
                pressed && !active && styles.rowPressed,
              ]}
            >
              {active ? <View pointerEvents="none" style={styles.activeRail} /> : null}
              {group
                ? <RailGroupAvatar group={row.group} />
                : row.character
                ? (
                  <CharacterAvatar
                    slug={row.character.together_character_templates.slug}
                    name={name}
                    template={row.character.together_character_templates}
                    version={row.character.together_character_versions}
                    size={40}
                  />
                )
                : (
                  <View style={styles.fallbackAvatar}>
                    <MessageCircle size={18} color={colors.muted} />
                  </View>
                )}
              <View style={styles.copy}>
                <View style={styles.nameRow}>
                  <Text numberOfLines={1} style={[styles.name, active && styles.nameActive]}>{name}</Text>
                  {isConversationPinned(row.conversation) ? <Pin accessibilityLabel="Pinned" size={11} color={colors.violet} fill={colors.violet} /> : null}
                </View>
                <Text numberOfLines={1} style={styles.preview}>{preview}</Text>
              </View>
              {opening
                ? <ActivityIndicator accessibilityLabel={`Opening ${name}`} size="small" color={colors.violet} />
                : row.conversation.unread && !active
                ? <View accessibilityLabel="Unread" style={styles.unread} />
                : null}
            </Pressable>
          );
        })}
        {!rows.length
          ? <Text style={styles.empty}>Your conversations will appear here.</Text>
          : null}
      </ScrollView>
    </View>
  );
}

function openRailHref(href: string) {
  const target = conversationRouteTarget(href);
  if (target) router.replace(target as never);
}

function warmConversation(row: RailRow) {
  const href = row.conversation.kind === "group"
    ? `/group-chat?id=${encodeURIComponent(row.conversation.id)}`
    : row.character
    ? `/chat?character=${encodeURIComponent(
      row.character.together_character_templates.public_handle ??
        row.character.together_character_templates.slug,
    )}`
    : "";
  if (href) warmRoute(href, (value) => router.prefetch(value as never));
}

function RailGroupAvatar({ group }: { group?: GroupDetail }) {
  const members = group?.participants.slice(0, 2) ?? [];
  if (!members.length) {
    return (
      <View style={styles.fallbackAvatar}>
        <UsersRound size={19} color={colors.violet} />
      </View>
    );
  }
  return (
    <View style={styles.groupAvatar}>
      {members.map((participant, index) => {
        const character = participant.together_character_instances;
        return (
          <View
            key={participant.id}
            style={[styles.groupAvatarItem, { left: index * 12, zIndex: 2 - index }]}
          >
            <CharacterAvatar
              slug={character.together_character_templates.slug}
              name={character.together_character_templates.name}
              template={character.together_character_templates}
              version={character.together_character_versions}
              size={32}
            />
          </View>
        );
      })}
      <View style={styles.groupBadge}>
        <UsersRound size={8} color={colors.text} />
      </View>
    </View>
  );
}

function groupName(group?: GroupDetail) {
  return group?.participants.map((participant) =>
    participant.together_character_instances.together_character_templates.name
      .split(" ")[0]
  ).join(", ");
}

function conversationTime(conversation: Conversation) {
  const value = conversation.last_message_at ?? conversation.updated_at ??
    conversation.created_at;
  const result = value ? new Date(value).getTime() : 0;
  return Number.isNaN(result) ? 0 : result;
}

const styles = StyleSheet.create({
  rail: {
    width: 260,
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 0,
    paddingTop: 18,
    backgroundColor: "#0B0E17",
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  kicker: {
    color: colors.dimmed,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  viewAll: { color: colors.violet, fontSize: 11, fontWeight: "800" },
  list: { flex: 1, minHeight: 0 },
  listContent: { paddingHorizontal: 9, paddingBottom: 22, gap: 3 },
  row: {
    position: "relative",
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 9,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  rowActive: {
    backgroundColor: "rgba(216,62,234,.14)",
    borderColor: "rgba(216,62,234,.34)",
  },
  rowOpening: { backgroundColor: "rgba(171, 94, 231, .09)" },
  activeRail: { position: "absolute", left: -1, top: 9, bottom: 9, width: 3, borderRadius: 2, backgroundColor: colors.rose },
  rowPressed: { backgroundColor: "rgba(255,255,255,.045)" },
  copy: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  nameActive: { color: colors.text },
  preview: { color: colors.muted, fontSize: 10, marginTop: 3 },
  unread: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4AA4FF" },
  fallbackAvatar: {
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "rgba(154,99,215,.10)",
    borderWidth: 1,
    borderColor: "rgba(154,99,215,.18)",
  },
  groupAvatar: { width: 40, height: 40, flexShrink: 0, position: "relative" },
  groupAvatarItem: {
    position: "absolute",
    top: 4,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: "#0B0E17",
    overflow: "hidden",
  },
  groupBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    zIndex: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.violet,
    borderWidth: 1,
    borderColor: "#0B0E17",
  },
  empty: { color: colors.dimmed, fontSize: 11, lineHeight: 17, padding: 12 },
});
