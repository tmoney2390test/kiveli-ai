import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  Archive,
  ArrowLeft,
  Check,
  ChevronRight,
  GitBranch,
  MessageCircle,
  RotateCcw,
  Users,
} from 'lucide-react-native';
import { PageTitle, Screen } from '../src/components/ui';
import { useAuth } from '../src/hooks/useAuth';
import { manageConversation } from '../src/lib/api/conversations';
import { managePersona } from '../src/lib/api/account';
import {
  type ArchiveChatsResult,
  type ChatCategory,
  chatCategoryCount,
  type ChatManagementPage,
  type ManagedChat,
  managedChatHref,
  managedChatName,
  mergeManagedChats,
  selectableChatIds,
} from '../src/lib/chatManagement';
import { useTogether } from '../src/store/useTogether';
import { colors, radius, typography } from '../src/theme';
import type { Snapshot } from '../src/types';

const tabs: { id: ChatCategory; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'archived', label: 'Archived' },
  { id: 'branches', label: 'Branches' },
];

export default function ManageChats() {
  const { session } = useAuth();
  const [category, setCategory] = useState<ChatCategory>('active');
  const [data, setData] = useState<ChatManagementPage | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const sequence = useRef(0), operation = useRef(false), account = useRef(session?.user.id);
  account.current = session?.user.id;

  const load = useCallback(async (more = false, offset = 0) => {
    const userId = session?.user.id;
    if (!userId) return;
    const request = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const page = await manageConversation<ChatManagementPage>({
        action: 'management',
        category,
        offset,
        limit: 50,
      });
      if (request !== sequence.current || account.current !== userId) return;
      setData((previous) => ({
        ...page,
        items: more ? mergeManagedChats(previous?.items ?? [], page.items) : page.items,
      }));
      if (!more) {
        setSelected((current) =>
          current.filter((id) => selectableChatIds(page.items).includes(id))
        );
      }
    } catch (caught) {
      if (request === sequence.current && account.current === userId) {
        setError(caught instanceof Error ? caught.message : 'Your chats could not be loaded.');
      }
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [category, session?.user.id]);

  useFocusEffect(useCallback(() => {
    setData(null);
    setSelected([]);
    setNotice('');
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]));

  const archive = async () => {
    if (operation.current || !selected.length || loading) return;
    const userId = account.current;
    operation.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await manageConversation<ArchiveChatsResult>({
        action: 'archive_many',
        conversationIds: selected,
      });
      if (account.current !== userId) return;
      setData((current) =>
        current
          ? {
            ...current,
            activeCount: result.activeCount,
            items: current.items.filter((chat) => !result.archivedIds.includes(chat.id)),
          }
          : current
      );
      setSelected(result.busyIds);
      const saved = result.archivedIds.length;
      setNotice(
        [
          saved
            ? `${saved} ${saved === 1 ? 'chat archived' : 'chats archived'}. Your history is saved.`
            : '',
          result.busyIds.length
            ? `${result.busyIds.length} still ${
              result.busyIds.length === 1 ? 'has a reply' : 'have replies'
            } in progress. Try those again when finished.`
            : '',
        ].filter(Boolean).join(' '),
      );
      await useTogether.getState().refresh().catch(() => undefined);
      await load();
    } catch (caught) {
      if (account.current === userId) {
        setError(caught instanceof Error ? caught.message : 'Your chats could not be archived.');
      }
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };

  const open = async (chat: ManagedChat, resume = false) => {
    if (operation.current) return;
    const userId = account.current;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      if (
        chat.continuity_id &&
        useTogether.getState().snapshot?.activeContinuity?.id !== chat.continuity_id
      ) {
        const snapshot = await managePersona<Snapshot>({
          action: 'switch_life',
          continuityId: chat.continuity_id,
        });
        if (account.current !== userId) return;
        useTogether.getState().setSnapshot(snapshot);
      }
      if (resume) {
        await manageConversation({ action: 'resume_saved', conversationId: chat.id });
        if (account.current !== userId) return;
        await useTogether.getState().refresh();
      }
      if (account.current === userId) router.push(managedChatHref(chat, resume) as never);
    } catch (caught) {
      if (account.current === userId) {
        setError(caught instanceof Error ? caught.message : 'This chat could not be opened.');
      }
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };

  const visibleIds = selectableChatIds(data?.items ?? []).slice(0, 50);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const hasMore = data && data.items.length < chatCategoryCount(data, category);
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole='button'
          accessibilityLabel='Back to Messages'
          onPress={() => router.canGoBack() ? router.back() : router.replace('/messages' as never)}
          style={styles.iconButton}
        >
          <ArrowLeft size={21} color={colors.text} />
        </Pressable>
        <View style={styles.grow}>
          <PageTitle>Manage Chats</PageTitle>
          <Text style={styles.subtitle}>Your conversations, across all Lives.</Text>
        </View>
        <Pressable
          accessibilityRole='button'
          accessibilityLabel='Refresh chats'
          disabled={loading || busy}
          onPress={() => void load()}
          style={styles.iconButton}
        >
          <RotateCcw size={19} color={loading || busy ? colors.dimmed : colors.text} />
        </Pressable>
      </View>
      <View style={styles.usage}>
        <Text style={styles.plan}>{data?.planName ?? 'Your membership'}</Text>
        <Text accessibilityLiveRegion='polite' style={styles.count}>
          {data ? `${data.activeCount} of ${data.limit}` : '—'}{' '}
          <Text style={styles.countLabel}>active chats</Text>
        </Text>
        <View style={styles.track}>
          <View
            style={[styles.fill, {
              width: `${
                data ? Math.min(100, data.activeCount / Math.max(1, data.limit) * 100) : 0
              }%`,
            }]}
          />
        </View>
        <Text style={styles.copy}>
          Direct and group chats count. Archived chats and branches don’t.
        </Text>
      </View>
      <View accessibilityRole='tablist' style={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.id}
            accessibilityRole='tab'
            accessibilityState={{ selected: category === tab.id }}
            disabled={busy}
            onPress={() => {
              setCategory(tab.id);
              setSelected([]);
              setNotice('');
            }}
            style={[styles.tab, category === tab.id && styles.tabActive]}
          >
            <Text style={[styles.tabText, category === tab.id && styles.tabTextActive]}>
              {tab.label}
              {data ? ` · ${chatCategoryCount(data, tab.id)}` : ''}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.copy}>
        {category === 'active'
          ? 'Archive chats to free up space. Messages, photos, and shared history stay saved.'
          : category === 'archived'
          ? 'Read any saved conversation, or resume it in Messages. Resuming a direct chat replaces the current thread with that companion and saves the newer thread here.'
          : 'Alternate paths have their own plan allowance. Open a branch to switch paths or manage it from the chat.'}
      </Text>
      {category === 'active' && Boolean(data?.items.length)
        ? (
          <View style={styles.selection}>
            <Pressable
              accessibilityRole='checkbox'
              accessibilityState={{ checked: allSelected, disabled: busy || loading }}
              disabled={busy || loading}
              onPress={() => setSelected(allSelected ? [] : visibleIds)}
              style={styles.selectAll}
            >
              <CheckBox checked={allSelected} />
              <Text style={styles.selectText}>
                {allSelected
                  ? 'Clear selection'
                  : (data?.items.length ?? 0) > 50
                  ? 'Select first 50'
                  : 'Select shown'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={`Archive ${selected.length} selected chats`}
              disabled={busy || loading || !selected.length}
              onPress={() => void archive()}
              style={[
                styles.archiveButton,
                (busy || loading || !selected.length) && styles.disabled,
              ]}
            >
              {busy
                ? <ActivityIndicator size='small' color='#fff' />
                : <Archive size={16} color='#fff' />}
              <Text style={styles.archiveText}>
                Archive{selected.length ? ` (${selected.length})` : ''}
              </Text>
            </Pressable>
          </View>
        )
        : null}
      {notice ? <Text accessibilityLiveRegion='polite' style={styles.notice}>{notice}</Text> : null}
      {error
        ? (
          <View style={styles.error}>
            <Text accessibilityRole='alert' style={styles.errorText}>{error}</Text>
            <Pressable
              accessibilityRole='button'
              disabled={busy || loading}
              onPress={() => void load()}
              style={styles.retry}
            >
              <Text style={styles.link}>Refresh list</Text>
            </Pressable>
          </View>
        )
        : null}
      {loading && !data
        ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.rose} />
            <Text style={styles.copy}>Loading your chats…</Text>
          </View>
        )
        : null}
      {!loading && data && !data.items.length
        ? (
          <View style={styles.empty}>
            <MessageCircle color={colors.violet} size={30} />
            <Text style={styles.emptyTitle}>
              {category === 'active'
                ? 'No active chats'
                : category === 'archived'
                ? 'No archived chats'
                : 'No branches yet'}
            </Text>
            <Text style={styles.copy}>
              {category === 'active'
                ? 'Start a conversation from Messages whenever you’re ready.'
                : category === 'archived'
                ? 'Chats archived here keep their history without a removal timer.'
                : 'You can create a branch from a completed character message.'}
            </Text>
          </View>
        )
        : null}
      <View style={styles.list}>
        {data?.items.map((chat) => {
          const name = managedChatName(chat), checked = selected.includes(chat.id);
          const toggle = () =>
            setSelected((current) =>
              current.includes(chat.id)
                ? current.filter((id) => id !== chat.id)
                : current.length < 50
                ? [...current, chat.id]
                : current
            );
          return (
            <View key={chat.id} style={[styles.card, checked && styles.cardSelected]}>
              {category === 'active'
                ? (
                  <Pressable
                    accessibilityRole='checkbox'
                    accessibilityLabel={`Select ${name}`}
                    accessibilityState={{ checked, disabled: busy || loading }}
                    disabled={busy || loading}
                    onPress={toggle}
                    style={styles.checkTap}
                  >
                    <CheckBox checked={checked} />
                  </Pressable>
                )
                : (
                  <View style={styles.kindIcon}>
                    {chat.is_branch
                      ? <GitBranch size={21} color={colors.violet} />
                      : <Archive size={21} color={colors.violet} />}
                  </View>
                )}
              <Pressable
                accessibilityRole='button'
                accessibilityLabel={`Open ${name}`}
                disabled={busy}
                onPress={() => void open(chat)}
                style={styles.chat}
              >
                <View style={styles.nameRow}>
                  {chat.kind === 'group' ? <Users size={15} color={colors.muted} /> : null}
                  <Text numberOfLines={1} style={styles.name}>{name}</Text>
                  <ChevronRight size={17} color={colors.dimmed} />
                </View>
                <Text numberOfLines={1} style={styles.detail}>
                  {chat.life_title}
                  {chat.kind !== 'group' && chat.title ? ` · ${chat.title}` : ''}
                </Text>
                <Text style={styles.meta}>
                  {chat.last_message_at
                    ? `Last message ${
                      new Date(chat.last_message_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })
                    }`
                    : 'No messages yet'}
                </Text>
              </Pressable>
              {category === 'archived'
                ? (
                  <Pressable
                    accessibilityRole='button'
                    accessibilityLabel={`Resume ${name}`}
                    disabled={busy}
                    onPress={() => void open(chat, true)}
                    style={styles.resume}
                  >
                    <Text style={styles.link}>Resume</Text>
                  </Pressable>
                )
                : null}
            </View>
          );
        })}
      </View>
      {hasMore
        ? (
          <Pressable
            accessibilityRole='button'
            disabled={loading || busy}
            onPress={() => void load(true, data.items.length)}
            style={styles.more}
          >
            {loading
              ? <ActivityIndicator color={colors.rose} />
              : <Text style={styles.link}>Load more</Text>}
          </Pressable>
        )
        : null}
    </Screen>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.checkbox, checked && styles.checkboxSelected]}>
      {checked ? <Check size={15} color='#fff' /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: 800, width: '100%', alignSelf: 'center', paddingBottom: 100, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, minWidth: 0 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: { fontSize: 13, color: colors.muted, marginTop: 4 },
  usage: {
    padding: 20,
    gap: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  plan: { color: colors.violet, fontSize: 13, fontWeight: '700' },
  count: { color: colors.text, fontFamily: typography.display, fontSize: 30 },
  countLabel: { fontSize: 18 },
  track: { height: 5, backgroundColor: colors.elevated, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.rose, borderRadius: 4 },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  tabs: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 4,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  tabActive: { backgroundColor: colors.elevated },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  tabTextActive: { color: colors.text },
  selection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  selectAll: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectText: { color: colors.text, fontSize: 13 },
  archiveButton: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.rose,
  },
  archiveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  disabled: { opacity: .4 },
  notice: { color: colors.violet, fontSize: 13, lineHeight: 20 },
  error: { gap: 8 },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  retry: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  list: { gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 92,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingRight: 12,
  },
  cardSelected: { borderColor: colors.violet, backgroundColor: 'rgba(157,108,210,.09)' },
  checkTap: { width: 52, minHeight: 80, justifyContent: 'center', alignItems: 'center' },
  checkbox: {
    width: 23,
    height: 23,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.dimmed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: colors.rose, borderColor: colors.rose },
  chat: { flex: 1, minWidth: 0, paddingVertical: 15, gap: 5 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  detail: { color: colors.muted, fontSize: 12 },
  meta: { color: colors.dimmed, fontSize: 11 },
  kindIcon: { width: 52, alignItems: 'center' },
  resume: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  link: { color: colors.violet, fontSize: 13, fontWeight: '700' },
  loading: { minHeight: 140, justifyContent: 'center', alignItems: 'center', gap: 12 },
  empty: { paddingVertical: 35, gap: 12, alignItems: 'center' },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  more: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
