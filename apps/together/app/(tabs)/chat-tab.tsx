import { styles } from '../../src/styles/inboxStyles';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  Redirect,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";
import {
  Archive,
  CloudOff,
  MessageCircle,
  MoreVertical,
  Pin,
  Plus,
  Search,
  Settings,
  Undo2,
  Users,
  X,
} from "lucide-react-native";
import {
  CharacterAvatar,
  EmptyState,
  FrostedSurface,
} from "../../src/components";
import { ChatSettingsModal } from "../../src/components/ChatSettingsModal";
import { loadGroupDetail, manageConversation, manageGroup, setConversationPinned } from "../../src/lib/api";
import { confirmAction } from "../../src/lib/dialogs";
import {
  buildInboxRows,
  buildInboxSections,
  chatHrefFromInboxParams,
  type ChatLaunchParams,
  formatInboxTimestamp,
  groupParticipantLine,
  type InboxFilter,
  type InboxGroupDetail,
  type InboxPage,
  inboxPreview,
  isConversationPinned,
  type InboxRow,
  isActiveInboxConversation,
  mergeInboxConversations,
  mergeInboxGroups,
  mergeInboxPages,
} from "../../src/lib/messageInbox";
import { loadInboxFilter, saveInboxFilter } from "../../src/lib/messageInboxPreference";
import { loadMessageDrafts } from "../../src/lib/messageDrafts";
import { cacheInboxGroupSummary, prefetchCompleteGroupDetail } from "../../src/lib/groupDetailCache";
import { useTogether } from "../../src/store/useTogether";
import { colors } from "../../src/theme";
import type {
  CharacterInstance,
  Conversation,
} from "../../src/types";
import { useAppShell } from "../../src/shell/AppShellContext";
import { useAuth } from "../../src/hooks/useAuth";
import { useNetworkStatus } from "../../src/providers/NetworkStatusProvider";
import { conversationRouteTarget, navigateLocalRouteOnWeb, webConversationHref } from "../../src/lib/conversationNavigation";
import { characterConversationHref } from "../../src/lib/chatRoute";
import { prefetchConversationMessagePage } from "../../src/lib/conversationMessageWarmup";
import { warmRoute } from "../../src/lib/routeWarmup";
import { supabase } from "../../src/lib/supabase";

const demoMode = __DEV__ &&
  process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE === "true";
const INBOX_PAGE_SIZE = 40;
type InboxCacheEntry = { conversations: Conversation[]; groups: InboxGroupDetail[]; pageInfo: InboxPage["pageInfo"] };
const inboxCache = new Map<string, InboxCacheEntry>();

function normalizeInboxPage(value: InboxPage | Conversation[]): InboxPage {
  if (Array.isArray(value)) {
    return { conversations: value, groups: [], pageInfo: { hasMore: false, nextOffset: null } };
  }
  return value;
}

export default function MessageInbox() {
  const params = useLocalSearchParams<ChatLaunchParams>();
  const { desktop } = useAppShell();
  const { session } = useAuth();
  const { online } = useNetworkStatus();
  const { snapshot, refresh, setCoreState } = useTogether();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<InboxGroupDetail[]>([]);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [menuRow, setMenuRow] = useState<InboxRow | null>(null);
  const [settingsRow, setSettingsRow] = useState<InboxRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [error, setError] = useState("");
  const [archiveUndo, setArchiveUndo] = useState<{ row: InboxRow; restoring: boolean } | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const groupsRef = useRef<InboxGroupDetail[]>([]);
  const nextOffsetRef = useRef<number | null>(0);
  const hasMoreRef = useRef(true);
  const requestSequence = useRef(0);
  const fetchingMoreRef = useRef(false);
  const fetchingRefreshRef = useRef(false);
  const chatHref = chatHrefFromInboxParams(params);

  useEffect(() => {
    if (params.compose) setShowNewConversation(true);
  }, [params.compose]);

  const fetchInbox = useCallback(async (mode: "refresh" | "more" | "silent") => {
    if (chatHref || demoMode) return;
    const currentSnapshot = useTogether.getState().snapshot;
    if (!currentSnapshot) return;
    if (mode === "more" && (!hasMoreRef.current || fetchingMoreRef.current || fetchingRefreshRef.current)) return;
    if (mode !== "more" && (fetchingRefreshRef.current || fetchingMoreRef.current)) return;
    if (!online) {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      return;
    }
    const scope = `${session?.user.id ?? "anonymous"}:${currentSnapshot.activeContinuity?.id ?? "default"}`;
    const offset = mode === "more" ? nextOffsetRef.current ?? 0 : 0;
    const requestId = ++requestSequence.current;
    if (mode === "more") {
      fetchingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      fetchingRefreshRef.current = true;
      if (mode === "refresh") {
        setLoading(conversationsRef.current.length === 0);
        setRefreshing(conversationsRef.current.length > 0);
        setError("");
      }
    }
    try {
      const page = normalizeInboxPage(await manageConversation<InboxPage | Conversation[]>({ action: "inbox_v2", limit: INBOX_PAGE_SIZE, offset }));
      if (requestSequence.current !== requestId) return;
      const nextConversations = mode === "more" ? mergeInboxPages(conversationsRef.current, page.conversations) : page.conversations;
      const nextGroups = mode === "more" ? mergeInboxGroups(groupsRef.current, page.groups) : page.groups;
      conversationsRef.current = nextConversations;
      groupsRef.current = nextGroups;
      nextOffsetRef.current = page.pageInfo.nextOffset;
      hasMoreRef.current = page.pageInfo.hasMore;
      setConversations(nextConversations);
      setGroups(nextGroups);
      inboxCache.set(scope, { conversations: nextConversations, groups: nextGroups, pageInfo: page.pageInfo });
      const latest = useTogether.getState().snapshot;
      if (latest && latest.activeContinuity?.id === currentSnapshot.activeContinuity?.id) {
        setCoreState({ conversations: mergeInboxConversations(latest.conversations, nextConversations) });
      }
    } catch (caught) {
      if (requestSequence.current === requestId && mode !== "silent") setError(caught instanceof Error ? caught.message : "Messages could not be loaded.");
    } finally {
      if (requestSequence.current === requestId) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        fetchingMoreRef.current = false;
        fetchingRefreshRef.current = false;
      }
    }
  }, [chatHref, online, session?.user.id, setCoreState]);

  useEffect(() => {
    const userId = session?.user.id;
    const continuityId = snapshot?.activeContinuity?.id;
    if (chatHref || demoMode || !userId || !continuityId || !online) return;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const refreshWhenIdle = () => {
      if (cancelled || refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        if (cancelled) return;
        if (fetchingRefreshRef.current || fetchingMoreRef.current) {
          refreshWhenIdle();
          return;
        }
        void fetchInbox("silent");
      }, 160);
    };
    const channel = supabase.channel(`kivelle-inbox-${continuityId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "together_messages",
        filter: `user_id=eq.${userId}`,
      }, refreshWhenIdle)
      .subscribe();
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [chatHref, fetchInbox, online, session?.user.id, snapshot?.activeContinuity?.id]);

  const pendingReplyKey = conversations
    .filter((conversation) => conversation.reply_pending)
    .map((conversation) => conversation.id)
    .sort()
    .join(":");
  useEffect(() => {
    if (chatHref || demoMode || !online || !pendingReplyKey) return;
    // Realtime message delivery is the fast path. This short reconciliation is
    // active only while a reply is pending, covering failed turns and restricted
    // rows that are intentionally not delivered to a standard/native client.
    const timer = setInterval(() => {
      if (!fetchingRefreshRef.current && !fetchingMoreRef.current) void fetchInbox("silent");
    }, 1_500);
    return () => clearInterval(timer);
  }, [chatHref, fetchInbox, online, pendingReplyKey]);

  useFocusEffect(useCallback(() => {
    if (chatHref) return;
    const currentSnapshot = useTogether.getState().snapshot;
    if (!currentSnapshot) return;
    const scope = `${session?.user.id ?? "anonymous"}:${currentSnapshot.activeContinuity?.id ?? "default"}`;
    const cached = inboxCache.get(scope);
    const local = mergeInboxConversations(
      currentSnapshot.conversations.filter(isActiveInboxConversation),
      cached?.conversations ?? [],
    );
    conversationsRef.current = local;
    groupsRef.current = cached?.groups ?? [];
    nextOffsetRef.current = cached?.pageInfo.nextOffset ?? 0;
    hasMoreRef.current = cached?.pageInfo.hasMore ?? true;
    setConversations(local);
    setGroups(cached?.groups ?? []);
    setLoading(local.length === 0);
    if (demoMode) {
      setLoading(false);
      return;
    }
    void fetchInbox("refresh");
    return () => {
      requestSequence.current += 1;
      fetchingMoreRef.current = false;
      fetchingRefreshRef.current = false;
    };
  }, [chatHref, fetchInbox, session?.user.id, snapshot?.activeContinuity?.id]));

  useEffect(() => {
    const userId = session?.user.id;
    const continuityId = snapshot?.activeContinuity?.id;
    if (!userId || !continuityId) return;
    let cancelled = false;
    setFilter("all");
    void loadInboxFilter(userId, continuityId).then((saved) => { if (!cancelled) setFilter(saved); });
    return () => { cancelled = true; };
  }, [session?.user.id, snapshot?.activeContinuity?.id]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || !conversations.length) {
      setDrafts({});
      return;
    }
    let cancelled = false;
    void loadMessageDrafts(userId, conversations).then((loaded) => { if (!cancelled) setDrafts(loaded); });
    return () => { cancelled = true; };
  }, [conversations, session?.user.id]);

  useEffect(() => {
    const userId=session?.user.id,continuityId=snapshot?.activeContinuity?.id;
    if (!userId||!continuityId) return;
    const scope=`${userId}:${continuityId}`;
    groups.forEach((group) => cacheInboxGroupSummary(scope, group));
  }, [groups, session?.user.id, snapshot?.activeContinuity?.id]);

  useEffect(() => {
    if (!archiveUndo || archiveUndo.restoring) return;
    const timer = setTimeout(() => setArchiveUndo(null), 8000);
    return () => clearTimeout(timer);
  }, [archiveUndo]);

  const rows = useMemo(() =>
    snapshot
      ? buildInboxRows(
        conversations,
        snapshot.characters,
        snapshot.favoriteCharacterTemplateIds ?? [],
        query,
        filter,
        groups,
      )
      : [], [conversations, filter, groups, query, snapshot]);
  const sections = useMemo(() => buildInboxSections(rows), [rows]);
  const hasGroups = conversations.some((conversation) => conversation.kind === "group");

  const selectFilter = (next: InboxFilter) => {
    setFilter(next);
    const userId = session?.user.id;
    const continuityId = snapshot?.activeContinuity?.id;
    if (userId && continuityId) void saveInboxFilter(userId, continuityId, next);
  };

  const openSettings = (row: InboxRow) => {
    setMenuRow(null);
    setSettingsRow(row);
  };
  const archive = (row: InboxRow) => {
    setMenuRow(null);
    confirmAction({
      title: `Archive ${row.conversation.kind === "group" ? row.conversation.title ?? "this group" : `chat with ${row.character.together_character_templates.name}`}?`,
      message:
        "It will leave Messages now and remain recoverable from Archived Chats for 30 days. Relationships, memories, and Moments will not change.",
      confirmLabel: "Archive chat",
      onConfirm: async () => {
        setBusyId(row.conversation.id);
        try {
          const archived = row.conversation.kind === "group"
            ? (await manageGroup<{ archived: boolean; conversation: Conversation }>({
              action: "archive",
              conversationId: row.conversation.id,
            })).conversation
            : await manageConversation<Conversation>({
              action: "archive",
              conversationId: row.conversation.id,
            });
          const nextConversations = conversationsRef.current.filter((conversation) => conversation.id !== row.conversation.id);
          const nextGroups = groupsRef.current.filter((group) => group.conversation.id !== row.conversation.id);
          conversationsRef.current = nextConversations;
          groupsRef.current = nextGroups;
          setConversations(nextConversations);
          setGroups(nextGroups);
          useTogether.getState().upsertConversation(archived);
          setArchiveUndo({ row: { ...row, conversation: archived }, restoring: false });
          void refresh();
        } catch (caught) {
          Alert.alert(
            "Could not archive chat",
            caught instanceof Error ? caught.message : "Please try again.",
          );
        } finally {
          setBusyId(null);
        }
      },
    });
  };
  const undoArchive = async () => {
    if (!archiveUndo || archiveUndo.restoring) return;
    const row = archiveUndo.row;
    setArchiveUndo({ ...archiveUndo, restoring: true });
    try {
      const restored = await manageConversation<Conversation>({ action: "restore", conversationId: row.conversation.id });
      useTogether.getState().upsertConversation(restored);
      setArchiveUndo(null);
      await fetchInbox("refresh");
      void refresh();
    } catch (caught) {
      setArchiveUndo({ row, restoring: false });
      Alert.alert("Could not restore chat", caught instanceof Error ? caught.message : "Please try again.");
    }
  };
  const togglePinned = async (row: InboxRow) => {
    setMenuRow(null);
    setBusyId(row.conversation.id);
    const pinned = !isConversationPinned(row.conversation);
    try {
      const updated = await setConversationPinned(row.conversation.id, pinned);
      const next = conversationsRef.current.map((item) => item.id === updated.id ? updated : item);
      conversationsRef.current = next;
      setConversations(next);
      const latest = useTogether.getState().snapshot;
      if (latest) useTogether.getState().upsertConversation(updated);
    } catch (caught) {
      Alert.alert("Could not update pin", caught instanceof Error ? caught.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  };

  if (chatHref) return <Redirect href={chatHref as never} />;
  if (!snapshot) {
    return (
      <EmptyState
        title="Messages unavailable"
        body="Reload Kivelle and try again."
      />
    );
  }
  const status = !online
    ? { icon: <CloudOff size={15} color={colors.text} />, text: "Offline · Showing saved conversations", tone: "offline" as const }
    : null;
  const emptyTitle = query
    ? "No matching chats"
    : filter === "unread"
    ? "You’re all caught up"
    : filter === "favorites"
    ? "No favorite chats yet"
    : filter === "groups"
    ? "No group conversations yet"
    : "No conversations yet";
  const emptyBody = query
    ? "Try a companion name or another word from the message."
    : filter === "unread"
    ? "New messages will appear here."
    : filter === "favorites"
    ? "Favorite a companion to keep their chat close."
    : filter === "groups"
    ? "Create a group from the + button when you are ready."
    : "Your conversations will appear here.";
  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <View pointerEvents="none" style={styles.glowTop} />
      <View pointerEvents="none" style={styles.glowBottom} />
      <SectionList
        accessibilityLabel="Messages list"
        sections={sections}
        keyExtractor={(row) => row.conversation.id}
        renderItem={({ item }) => (
          <SwipeableConversationRow
            row={item}
            draft={drafts[item.conversation.id]}
            busy={busyId === item.conversation.id}
            onMenu={() => setMenuRow(item)}
            onTogglePinned={() => void togglePinned(item)}
          />
        )}
        renderSectionHeader={({ section }) => (
          <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
        )}
        stickySectionHeadersEnabled={false}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== "web"}
        onEndReached={() => void fetchInbox("more")}
        onEndReachedThreshold={0.35}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void fetchInbox("refresh")} tintColor={colors.rose} colors={[colors.rose]} />}
        contentContainerStyle={[styles.content, desktop && styles.contentDesktop]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<>
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text accessibilityRole="header" style={styles.title}>Messages</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start a new conversation"
            onPress={() => setShowNewConversation(true)}
            style={styles.newButton}
          >
            <Plus size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.search}>
          <Search size={20} color={colors.dimmed} />
          <TextInput
            nativeID="conversation-search"
            accessibilityLabel="Search messages"
            value={query}
            onChangeText={setQuery}
            placeholder="Search messages"
            placeholderTextColor={colors.dimmed}
            returnKeyType="search"
            style={styles.searchInput}
          />
          {query
            ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setQuery("")}
                style={styles.clearSearch}
              >
                <X size={17} color={colors.muted} />
              </Pressable>
            )
            : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" style={styles.filtersScroller} contentContainerStyle={styles.filters}>
          <FilterButton label="All" active={filter === "all"} onPress={() => selectFilter("all")} />
          <FilterButton label="Unread" active={filter === "unread"} onPress={() => selectFilter("unread")} />
          <FilterButton label="Favorites" active={filter === "favorites"} onPress={() => selectFilter("favorites")} />
          {hasGroups || filter === "groups" ? <FilterButton label="Groups" active={filter === "groups"} onPress={() => selectFilter("groups")} /> : null}
        </ScrollView>
        {status ? <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.status, status.tone === "offline" && styles.statusOffline]}>{status.icon}<Text style={styles.statusText}>{status.text}</Text></View> : null}
        {error
          ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${error}. Retry loading messages`}
              onPress={() => void fetchInbox("refresh")}
              style={styles.error}
            >
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.retry}>Tap to retry</Text>
            </Pressable>
          )
          : null}
        </>}
        ListEmptyComponent={loading
          ? <View accessibilityLiveRegion="polite" style={styles.loadingRow}><ActivityIndicator color={colors.rose} /><Text style={styles.loading}>Loading messages…</Text></View>
          : <EmptyState title={emptyTitle} body={emptyBody} />}
        ListFooterComponent={loadingMore ? <View accessibilityLiveRegion="polite" style={styles.loadingMore}><ActivityIndicator color={colors.rose} /><Text style={styles.loadingMoreText}>Loading more conversations…</Text></View> : null}
      />
      <ConversationActions
        row={menuRow}
        onClose={() => setMenuRow(null)}
        onArchive={archive}
        onTogglePinned={(row) => void togglePinned(row)}
        onSettings={openSettings}
      />
      <NewConversationModal
        visible={showNewConversation}
        characters={snapshot.characters.filter((character) =>
          Boolean(character.introduced_at)
        )}
        onClose={() => setShowNewConversation(false)}
        onGroup={() => {
          setShowNewConversation(false);
          router.push("/new-group");
        }}
        onDirect={(character) => {
          setShowNewConversation(false);
          router.push(
            `/chat?character=${
              encodeURIComponent(
                character.together_character_templates.public_handle ??
                  character.together_character_templates.slug,
              )
            }` as never,
          );
        }}
      />
      <ChatSettingsModal
        visible={Boolean(settingsRow)}
        conversation={settingsRow?.conversation ?? null}
        character={settingsRow?.character ?? null}
        onClose={() => setSettingsRow(null)}
        onSaved={(updated) => {
          const next = conversationsRef.current.map((item) => item.id === updated.id ? updated : item);
          conversationsRef.current = next;
          setConversations(next);
          useTogether.getState().upsertConversation(updated);
        }}
      />
      {archiveUndo ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.undoToast, desktop && styles.undoToastDesktop]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.undoTitle}>Chat archived</Text>
            <Text numberOfLines={1} style={styles.undoCopy}>Recoverable for 30 days from Archived Chats.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Undo archive" disabled={archiveUndo.restoring} onPress={() => void undoArchive()} style={styles.undoButton}>
            {archiveUndo.restoring ? <ActivityIndicator size="small" color={colors.text} /> : <Undo2 size={16} color={colors.text} />}
            <Text style={styles.undoButtonText}>{archiveUndo.restoring ? "Restoring" : "Undo"}</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function FilterButton(
  { label, active, onPress }: {
    label: string;
    active: boolean;
    onPress: () => void;
  },
) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={`${label} conversations`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.filter, active && styles.filterActive]}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ConversationRow(
  { row, draft, busy, onMenu }: {
    row: InboxRow;
    draft?: string;
    busy: boolean;
    onMenu: () => void;
  },
) {
  const { character, conversation } = row;
  const { session } = useAuth();
  const pendingDialogue=useTogether((state)=>state.pendingDialogues[conversation.id]);
  const template = character.together_character_templates;
  const group = conversation.kind === "group" ? row.group : undefined;
  const displayName = conversation.kind === "group"
    ? conversation.title ||
      group?.participants.map((participant) =>
        participant.together_character_instances.together_character_templates
          .name.split(" ")[0]
      ).join(", ") || "Group chat"
    : template.name;
  const participantLine = groupParticipantLine(group);
  const pendingSpeaker=conversation.kind==="group"
    ? group?.participants.find((participant)=>participant.character_instance_id===pendingDialogue?.characterInstanceId)?.together_character_instances.together_character_templates.name.split(" ")[0]
    : template.name.split(" ")[0];
  const unreadCount = conversation.kind === "group" ? conversation.unread_count ?? 0 : 0;
  const href = conversation.kind === "group"
    ? `/group-chat?id=${encodeURIComponent(conversation.id)}`
    : characterConversationHref(
      template.public_handle ?? template.slug,
      conversation.id,
    );
  const warm = () => {
    warmRoute(href, (value) => router.prefetch(value as never));
    if(conversation.kind==="group"){
      const scope=`${session?.user.id??"anonymous"}:${useTogether.getState().snapshot?.activeContinuity?.id??"default"}`;
      void prefetchCompleteGroupDetail(scope,conversation.id,()=>loadGroupDetail(conversation.id,{messageLimit:30,timeoutMs:20_000})).catch(()=>undefined);
      return;
    }
    prefetchConversationMessagePage(session?.user.id, conversation.id, () => manageConversation({ action: "messages", conversationId: conversation.id, limit: 50 }));
  };
  const rowControl = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${displayName}${conversation.unread ? ", unread messages" : ""}`}
      onHoverIn={warm}
      onPressIn={warm}
      onPress={() => openChatHref(href)}
      disabled={busy}
      style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
    >
      {conversation.kind === "group" ? <GroupAvatarStack group={group} /> : (
        <CharacterAvatar
          slug={template.slug}
          name={template.name}
          template={template}
          version={character.together_character_versions}
          size={58}
        />
      )}
      <View style={styles.rowCopy}>
        <View style={styles.rowTitleLine}>
          <View style={styles.nameLine}>
            <Text
              style={[styles.name, conversation.unread && styles.unreadName]}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            {isConversationPinned(conversation) ? <Pin accessibilityLabel="Pinned" size={12} color={colors.violet} fill={colors.violet} /> : null}
            {conversation.unread && !unreadCount ? <View accessibilityLabel="Unread messages" style={styles.unreadDot} /> : null}
          </View>
          <Text style={styles.time}>
            {formatInboxTimestamp(conversation.last_message_at)}
          </Text>
        </View>
        {participantLine ? <Text numberOfLines={1} style={styles.groupParticipants}>{participantLine}</Text> : null}
        <Text
          style={[
            styles.preview,
            conversation.unread && styles.unreadPreview,
          ]}
          numberOfLines={2}
        >
          {pendingDialogue?`${pendingSpeaker??"Someone"} is typing…`:inboxPreview(conversation, { draft })}
        </Text>
      </View>
      {unreadCount ? <View accessibilityLabel={`${unreadCount} unread messages`} style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{unreadCount >= 99 ? "99+" : unreadCount}</Text></View> : null}
    </Pressable>
  );
  return (
    <View style={[styles.row, busy && styles.rowBusy]}>
      {rowControl}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Options for ${displayName}`}
        onPress={onMenu}
        disabled={busy}
        hitSlop={10}
        style={({ pressed }) => [styles.more, pressed && styles.pressed]}
      >
        <MoreVertical size={22} color={colors.muted} />
      </Pressable>
    </View>
  );
}

function SwipeableConversationRow(
  { row, draft, busy, onMenu, onTogglePinned }: {
    row: InboxRow;
    draft?: string;
    busy: boolean;
    onMenu: () => void;
    onTogglePinned: () => void;
  },
) {
  const pinned = isConversationPinned(row.conversation);
  return (
    <Swipeable
      enabled={!busy}
      friction={2}
      rightThreshold={44}
      overshootRight={false}
      renderRightActions={(_progress, _drag, swipeable) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pinned ? "Unpin chat" : "Pin chat"}
          onPress={() => {
            swipeable.close();
            onTogglePinned();
          }}
          style={[styles.swipeAction, pinned && styles.swipeActionPinned]}
        >
          <Pin size={18} color={colors.text} fill={pinned ? colors.text : "transparent"} />
          <Text style={styles.swipeActionText}>{pinned ? "Unpin" : "Pin"}</Text>
        </Pressable>
      )}
    >
      <ConversationRow row={row} draft={draft} busy={busy} onMenu={onMenu} />
    </Swipeable>
  );
}

function NewConversationModal({
  visible,
  characters,
  onClose,
  onGroup,
  onDirect,
}: {
  visible: boolean;
  characters: CharacterInstance[];
  onClose: () => void;
  onGroup: () => void;
  onDirect: (character: CharacterInstance) => void;
}) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close new conversation"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <FrostedSurface intensity={92} style={styles.newConversationSheet}>
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetKicker}>NEW CONVERSATION</Text>
              <Text style={styles.sheetName}>Who do you want to message?</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={styles.sheetClose}
            >
              <X size={19} color={colors.muted} />
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={onGroup} style={styles.newConversationGroup}>
            <View style={styles.newConversationIcon}>
              <Users size={21} color={colors.rose} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetActionTitle}>New Group</Text>
              <Text style={styles.sheetActionCopy}>
                Bring 2–5 companions into one chat.
              </Text>
            </View>
          </Pressable>
          <Text style={styles.newConversationLabel}>MESSAGE A COMPANION</Text>
          <ScrollView
            style={styles.newConversationList}
            showsVerticalScrollIndicator={false}
          >
            {characters.map((character) => {
              const template = character.together_character_templates;
              return (
                <Pressable
                  key={character.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${template.name}`}
                  onPress={() => onDirect(character)}
                  style={styles.newConversationPerson}
                >
                  <CharacterAvatar
                    slug={template.slug}
                    name={template.name}
                    template={template}
                    version={character.together_character_versions}
                    size={42}
                  />
                  <Text numberOfLines={1} style={styles.newConversationName}>
                    {template.name}
                  </Text>
                  <MessageCircle size={17} color={colors.muted} />
                </Pressable>
              );
            })}
            {!characters.length
              ? (
                <Text style={styles.newConversationEmpty}>
                  Meet a companion first to start messaging.
                </Text>
              )
              : null}
          </ScrollView>
        </FrostedSurface>
      </View>
    </Modal>
  );
}

function GroupAvatarStack({ group }: { group?: InboxGroupDetail }) {
  const items = group?.participants.slice(0, 3) ?? [];
  return (
    <View style={styles.groupAvatarStack}>
      {!items.length ? <View style={styles.groupAvatarFallback}><Users size={22} color={colors.violet} /></View> : null}
      {items.map((participant, index) => {
        const character = participant.together_character_instances,
          template = character.together_character_templates;
        return (
          <View
            key={participant.id}
            style={[styles.groupAvatar, {
              left: index * 18,
              zIndex: items.length - index,
            }]}
          >
            <CharacterAvatar
              slug={template.slug}
              name={template.name}
              template={template}
              version={character.together_character_versions}
              size={42}
            />
          </View>
        );
      })}
      {items.length ? <View style={styles.groupBadge}><Users size={11} color={colors.text} /></View> : null}
    </View>
  );
}

function ConversationActions(
  { row, onClose, onArchive, onSettings, onTogglePinned }: {
    row: InboxRow | null;
    onClose: () => void;
    onArchive: (row: InboxRow) => void;
    onSettings: (row: InboxRow) => void;
    onTogglePinned: (row: InboxRow) => void;
  },
) {
  return (
    <Modal
      transparent
      visible={Boolean(row)}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close chat options"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        {row
          ? (
            <FrostedSurface intensity={88} style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                {row.conversation.kind === "group"
                  ? <GroupAvatarStack group={row.group} />
                  : (
                    <CharacterAvatar
                      slug={row.character.together_character_templates.slug}
                      template={row.character.together_character_templates}
                      version={row.character.together_character_versions}
                      size={42}
                    />
                  )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetKicker}>CHAT OPTIONS</Text>
                  <Text style={styles.sheetName}>
                    {row.conversation.title ||
                      row.character.together_character_templates.name}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={onClose}
                  style={styles.sheetClose}
                >
                  <X size={19} color={colors.muted} />
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isConversationPinned(row.conversation) ? "Unpin chat" : "Pin chat"}
                onPress={() => onTogglePinned(row)}
                style={({ pressed }) => [styles.sheetAction, pressed && styles.pressed]}
              >
                <Pin size={19} color={colors.violet} fill={isConversationPinned(row.conversation) ? colors.violet : "transparent"} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetActionTitle}>{isConversationPinned(row.conversation) ? "Unpin chat" : "Pin chat"}</Text>
                  <Text style={styles.sheetActionCopy}>{isConversationPinned(row.conversation) ? "Return it to activity order" : "Keep it at the top of Messages"}</Text>
                </View>
              </Pressable>
              {row.conversation.kind === "group"
                ? (
                  <Pressable
                      accessibilityRole="link"
                      accessibilityLabel="Edit group settings"
                      onPress={() => {
                        onClose();
                        openChatHref(
                          `/group-chat?id=${encodeURIComponent(row.conversation.id)}&settings=1`,
                        );
                      }}
                      style={({ pressed }) => [styles.sheetAction, pressed && styles.pressed]}
                    >
                      <Settings size={19} color={colors.text} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sheetActionTitle}>Edit group settings</Text>
                        <Text style={styles.sheetActionCopy}>
                          Name, language, notifications, replies, and group energy
                        </Text>
                      </View>
                    </Pressable>
                )
                : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit chat settings"
                    onPress={() => onSettings(row)}
                    style={({ pressed }) => [styles.sheetAction, pressed && styles.pressed]}
                  >
                    <Settings size={19} color={colors.text} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sheetActionTitle}>Edit chat settings</Text>
                      <Text style={styles.sheetActionCopy}>
                        Name, response style, text size, language, and voice
                      </Text>
                    </View>
                  </Pressable>
                )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Archive chat"
                onPress={() => onArchive(row)}
                style={(
                  { pressed },
                ) => [styles.sheetAction, pressed && styles.pressed]}
              >
                <Archive size={19} color={colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.sheetActionTitle, { color: colors.danger }]}
                  >
                    Archive chat
                  </Text>
                  <Text style={styles.sheetActionCopy}>
                    Move it out of Messages; restore it for 30 days
                  </Text>
                </View>
              </Pressable>
            </FrostedSurface>
          )
          : null}
      </View>
    </Modal>
  );
}

function openChatHref(href: string) {
  const target = conversationRouteTarget(href);
  // Let the repaired Expo router preserve the active authenticated shell when
  // entering chat from Messages. A document navigation here could bootstrap
  // at `/` and send a valid mobile session back to Home.
  if (target) {
    router.push(target as never);
    return;
  }
  if (Platform.OS === "web" && navigateLocalRouteOnWeb(webConversationHref(href) ?? href)) return;
}
