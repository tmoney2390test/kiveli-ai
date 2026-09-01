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
  Link,
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
  RefreshCw,
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
import { manageConversation, manageGroup, setConversationPinned } from "../../src/lib/api";
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
import { cacheInboxGroupSummary } from "../../src/lib/groupDetailCache";
import { useTogether } from "../../src/store/useTogether";
import { colors, radius, spacing, typography } from "../../src/theme";
import type {
  CharacterInstance,
  Conversation,
} from "../../src/types";
import { useAppShell } from "../../src/shell/AppShellContext";
import { useAuth } from "../../src/hooks/useAuth";
import { useNetworkStatus } from "../../src/providers/NetworkStatusProvider";

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
  const { online, phase: connectionPhase } = useNetworkStatus();
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

  const fetchInbox = useCallback(async (mode: "refresh" | "more") => {
    if (chatHref || demoMode) return;
    const currentSnapshot = useTogether.getState().snapshot;
    if (!currentSnapshot) return;
    if (mode === "more" && (!hasMoreRef.current || fetchingMoreRef.current || fetchingRefreshRef.current)) return;
    if (mode === "refresh" && fetchingRefreshRef.current) return;
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
      setLoading(conversationsRef.current.length === 0);
      setRefreshing(conversationsRef.current.length > 0);
      setError("");
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
      if (requestSequence.current === requestId) setError(caught instanceof Error ? caught.message : "Messages could not be loaded.");
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
    const scope = snapshot?.activeContinuity?.id;
    if (!scope) return;
    groups.forEach((group) => cacheInboxGroupSummary(scope, group));
  }, [groups, snapshot?.activeContinuity?.id]);

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
    : refreshing && conversations.length
    ? { icon: <RefreshCw size={15} color={colors.text} />, text: "Updating messages…", tone: "updating" as const }
    : connectionPhase === "reconnected"
    ? { icon: <RefreshCw size={15} color={colors.text} />, text: "Back online · Updating messages", tone: "online" as const }
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
  const unreadCount = conversation.kind === "group" ? conversation.unread_count ?? 0 : 0;
  const href = conversation.kind === "group"
    ? `/group-chat?id=${encodeURIComponent(conversation.id)}`
    : `/chat?character=${encodeURIComponent(template.slug)}`;
  const rowControl = (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${displayName}${conversation.unread ? ", unread messages" : ""}`}
      onPress={conversation.kind === "group" ? () => openGroupHref(href) : undefined}
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
          {inboxPreview(conversation, { draft })}
        </Text>
      </View>
      {unreadCount ? <View accessibilityLabel={`${unreadCount} unread messages`} style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{unreadCount >= 99 ? "99+" : unreadCount}</Text></View> : null}
    </Pressable>
  );
  return (
    <View style={[styles.row, busy && styles.rowBusy]}>
      {conversation.kind === "group" ? rowControl : <Link href={href as never} asChild>{rowControl}</Link>}
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
                        openGroupHref(
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

function openGroupHref(href: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.location.assign(href);
    return;
  }
  router.push(href as never);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: 18,
    paddingBottom: 128,
  },
  contentDesktop: { maxWidth: 920, paddingHorizontal: spacing.xl, paddingTop: 26, paddingBottom: 48 },
  glowTop: {
    position: "absolute",
    top: -120,
    right: -130,
    width: 370,
    height: 370,
    borderRadius: 185,
    backgroundColor: "rgba(98,48,126,.14)",
  },
  glowBottom: {
    position: "absolute",
    bottom: 40,
    left: -170,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: "rgba(91,30,75,.09)",
  },
  header: { minHeight: 68, alignItems: "center", justifyContent: "center" },
  headerSpacer: { position: "absolute", left: 0, width: 42, height: 42 },
  newButton: {
    position: "absolute",
    right: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,.06)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 34,
    fontWeight: "700",
  },
  search: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    paddingHorizontal: 16,
    borderRadius: radius.xl,
    backgroundColor: "rgba(35,25,42,.78)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    minWidth: 0,
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 0,
  },
  clearSearch: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  filtersScroller: { marginTop: 28, marginBottom: 20 },
  filters: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    paddingRight: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(14,12,20,.62)",
  },
  filter: {
    minWidth: 92,
    minHeight: 50,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  filterActive: {
    backgroundColor: "rgba(66,40,82,.72)",
    borderWidth: 1,
    borderColor: "rgba(190,139,218,.18)",
  },
  filterText: { color: colors.muted, fontSize: 14, fontWeight: "700" },
  filterTextActive: { color: colors.text, fontWeight: "900" },
  sectionTitle: {
    color: colors.dimmed,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.25,
    marginTop: 18,
    marginBottom: 4,
    paddingVertical: 5,
    backgroundColor: colors.background,
  },
  row: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,248,244,.055)",
    backgroundColor: colors.background,
  },
  swipeAction: {
    width: 82,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "rgba(154,104,255,.38)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,248,244,.055)",
  },
  swipeActionPinned: { backgroundColor: "rgba(78,61,92,.72)" },
  swipeActionText: { color: colors.text, fontSize: 11, fontWeight: "900" },
  rowBusy: { opacity: .48 },
  rowMain: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    paddingVertical: 13,
  },
  groupAvatarStack: {
    width: 62,
    height: 58,
    position: "relative",
    justifyContent: "center",
  },
  groupAvatar: {
    position: "absolute",
    top: 7,
    borderWidth: 2,
    borderColor: colors.background,
    borderRadius: 24,
  },
  groupAvatarFallback: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(154,104,255,.12)",
    borderWidth: 1,
    borderColor: "rgba(154,104,255,.25)",
  },
  groupBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.wine,
    borderWidth: 2,
    borderColor: colors.background,
  },
  rowCopy: { minWidth: 0, flex: 1 },
  rowTitleLine: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  nameLine: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  name: {
    minWidth: 0,
    flexShrink: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  unreadName: { color: "#FFFFFF", fontWeight: "900" },
  unreadDot: {
    width: 8,
    height: 8,
    flexShrink: 0,
    borderRadius: 4,
    backgroundColor: "#4A9EFF",
    shadowColor: "#4A9EFF",
    shadowOpacity: 0.58,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  time: { color: colors.dimmed, fontSize: 12, fontVariant: ["tabular-nums"] },
  preview: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 7 },
  groupParticipants: { color: colors.dimmed, fontSize: 11, lineHeight: 15, marginTop: 2 },
  unreadPreview: { color: colors.textSecondary },
  unreadBadge: { minWidth: 24, height: 24, paddingHorizontal: 6, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.wine },
  unreadBadgeText: { color: "#fff", fontSize: 10, fontWeight: "900", fontVariant: ["tabular-nums"] },
  more: {
    width: 44,
    height: 50,
    marginLeft: 4,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  status: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 13,
    borderRadius: radius.md,
    backgroundColor: "rgba(91,145,255,.11)",
    borderWidth: 1,
    borderColor: "rgba(91,145,255,.2)",
  },
  statusOffline: { backgroundColor: "rgba(255,180,92,.09)", borderColor: "rgba(255,180,92,.2)" },
  statusText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  error: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,113,129,.08)",
    borderWidth: 1,
    borderColor: "rgba(255,113,129,.22)",
  },
  errorText: { minWidth: 0, flex: 1, color: colors.danger, fontSize: 12 },
  retry: { color: colors.text, fontSize: 11, fontWeight: "900" },
  loadingRow: { minHeight: 150, alignItems: "center", justifyContent: "center", gap: 12 },
  loading: { color: colors.muted, textAlign: "center" },
  loadingMore: { minHeight: 72, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  loadingMoreText: { color: colors.muted, fontSize: 12 },
  undoToast: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 10,
    borderRadius: radius.lg,
    backgroundColor: "rgba(35,28,43,.98)",
    borderWidth: 1,
    borderColor: colors.borderBright,
    shadowColor: "#000",
    shadowOpacity: .35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  undoToastDesktop: { left: undefined, right: undefined, width: 560, alignSelf: "center" },
  undoTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
  undoCopy: { color: colors.muted, fontSize: 11, marginTop: 3 },
  undoButton: { minWidth: 86, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: "rgba(154,104,255,.16)" },
  undoButtonText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  pressed: { opacity: .7 },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(5,4,9,.64)",
  },
  newConversationSheet: {
    width: "100%",
    maxWidth: 620,
    maxHeight: "82%",
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: 18,
    paddingBottom: Platform.OS === "ios" ? 34 : 22,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: "rgba(25,20,32,.97)",
    borderColor: colors.borderBright,
  },
  newConversationGroup: {
    minHeight: 72,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    backgroundColor: "rgba(112,47,126,.3)",
    borderWidth: 1,
    borderColor: "rgba(216,62,234,.28)",
  },
  newConversationIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,62,234,.12)",
  },
  newConversationLabel: {
    color: colors.dimmed,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: 20,
    marginBottom: 5,
  },
  newConversationList: { maxHeight: 360 },
  newConversationPerson: {
    height: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  newConversationName: {
    minWidth: 0,
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  newConversationEmpty: {
    color: colors.muted,
    textAlign: "center",
    paddingVertical: 28,
  },
  sheet: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 34 : 22,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: "rgba(25,20,32,.96)",
    borderColor: colors.borderBright,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,.22)",
    marginBottom: 10,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 9,
  },
  sheetKicker: {
    color: colors.dimmed,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  sheetName: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 22,
    marginTop: 2,
  },
  sheetClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,.045)",
  },
  sheetAction: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,.04)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetActionTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  sheetActionCopy: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
});
