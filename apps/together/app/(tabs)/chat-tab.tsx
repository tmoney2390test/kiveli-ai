import { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Archive, MoreVertical, Search, Settings, X } from 'lucide-react-native';
import { CharacterAvatar, EmptyState, FrostedSurface } from '../../src/components';
import { ChatSettingsModal } from '../../src/components/ChatSettingsModal';
import { manageConversation } from '../../src/lib/api';
import { confirmAction } from '../../src/lib/dialogs';
import { buildInboxRows, chatHrefFromInboxParams, formatInboxTimestamp, inboxPreview, type ChatLaunchParams, type InboxFilter, type InboxRow } from '../../src/lib/messageInbox';
import { useTogether } from '../../src/store/useTogether';
import { colors, radius, spacing, typography } from '../../src/theme';
import type { Conversation } from '../../src/types';

const demoMode = __DEV__ && process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE === 'true';

export default function MessageInbox() {
  const params = useLocalSearchParams<ChatLaunchParams>();
  const { snapshot, refresh } = useTogether();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [query, setQuery] = useState('');
  const [menuRow, setMenuRow] = useState<InboxRow | null>(null);
  const [settingsRow, setSettingsRow] = useState<InboxRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const chatHref = chatHrefFromInboxParams(params);

  useFocusEffect(useCallback(() => {
    if (chatHref) return;
    const currentSnapshot = useTogether.getState().snapshot;
    if (!currentSnapshot) return;
    const local = currentSnapshot.conversations.filter((conversation) => !conversation.archived_at);
    setConversations(local);
    if (demoMode) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError('');
    void manageConversation<Conversation[]>({ action: 'inbox' })
      .then((items) => { if (!cancelled) setConversations(items); })
      .catch((caught) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Messages could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [chatHref, snapshot?.activeContinuity?.id, reloadKey]));

  const rows = useMemo(() => snapshot ? buildInboxRows(
    conversations,
    snapshot.characters,
    snapshot.favoriteCharacterTemplateIds ?? [],
    query,
    filter,
  ) : [], [conversations, filter, query, snapshot]);

  const openChat = (row: InboxRow) => router.push(`/chat?character=${encodeURIComponent(row.character.together_character_templates.slug)}` as never);
  const openSettings = (row: InboxRow) => {
    setMenuRow(null);
    setSettingsRow(row);
  };
  const archive = (row: InboxRow) => {
    setMenuRow(null);
    confirmAction({
      title: `Archive chat with ${row.character.together_character_templates.name}?`,
      message: 'The conversation will leave Messages but remain available in conversation history. Your relationship and memories will not change.',
      confirmLabel: 'Archive chat',
      onConfirm: async () => {
        setBusyId(row.conversation.id);
        try {
          await manageConversation({ action: 'archive', conversationId: row.conversation.id });
          setConversations((current) => current.filter((conversation) => conversation.id !== row.conversation.id));
          await refresh();
        } catch (caught) {
          Alert.alert('Could not archive chat', caught instanceof Error ? caught.message : 'Please try again.');
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  if (chatHref) return <Redirect href={chatHref} />;
  if (!snapshot) return <EmptyState title="Messages unavailable" body="Reload Kivelle and try again." />;
  return <SafeAreaView edges={['top']} style={styles.screen}>
    <View pointerEvents="none" style={styles.glowTop} />
    <View pointerEvents="none" style={styles.glowBottom} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.header}><Text style={styles.title}>Messages</Text></View>
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
        {query ? <Pressable accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.clearSearch}><X size={17} color={colors.muted} /></Pressable> : null}
      </View>
      <View style={styles.filters}>
        <FilterButton label="Favorites" active={filter === 'favorites'} onPress={() => setFilter('favorites')} />
        <FilterButton label="All chats" active={filter === 'all'} onPress={() => setFilter('all')} />
      </View>
      {error ? <Pressable onPress={() => setReloadKey((value) => value + 1)} style={styles.error}><Text style={styles.errorText}>{error}</Text><Text style={styles.retry}>Tap to retry</Text></Pressable> : null}
      <View style={styles.list}>
        {rows.map((row) => <ConversationRow key={row.conversation.id} row={row} busy={busyId === row.conversation.id} onOpen={() => openChat(row)} onMenu={() => setMenuRow(row)} />)}
        {!rows.length && !loading ? <EmptyState
          title={query ? 'No matching chats' : filter === 'favorites' ? 'No favorite chats yet' : 'No conversations yet'}
          body={query ? 'Try a companion name or another word from the message.' : filter === 'favorites' ? 'Favorite a companion to keep their chat close.' : 'Your conversations will appear here.'}
        /> : null}
        {loading && !rows.length ? <Text style={styles.loading}>Loading messages…</Text> : null}
      </View>
    </ScrollView>
    <ConversationActions row={menuRow} onClose={() => setMenuRow(null)} onArchive={archive} onSettings={openSettings} />
    <ChatSettingsModal
      visible={Boolean(settingsRow)}
      conversation={settingsRow?.conversation ?? null}
      character={settingsRow?.character ?? null}
      onClose={() => setSettingsRow(null)}
      onSaved={(updated) => setConversations((current) => current.map((item) => item.id === updated.id ? updated : item))}
      onHistory={() => settingsRow && router.push(`/conversations/${settingsRow.character.id}` as never)}
      onMemories={() => settingsRow && router.push(`/memories?character=${encodeURIComponent(settingsRow.character.together_character_templates.slug)}` as never)}
      onAdvanced={() => settingsRow && router.push(`/conversation-controls?character=${encodeURIComponent(settingsRow.character.id)}` as never)}
    />
  </SafeAreaView>;
}

function FilterButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.filter, active && styles.filterActive]}><Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text></Pressable>;
}

function ConversationRow({ row, busy, onOpen, onMenu }: { row: InboxRow; busy: boolean; onOpen: () => void; onMenu: () => void }) {
  const { character, conversation } = row;
  const template = character.together_character_templates;
  return <View style={[styles.row, busy && styles.rowBusy]}>
    <Pressable accessibilityLabel={`Open chat with ${template.name}`} onPress={onOpen} disabled={busy} style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
      <CharacterAvatar slug={template.slug} name={template.name} template={template} version={character.together_character_versions} size={58} />
      <View style={styles.rowCopy}>
        <View style={styles.rowTitleLine}><Text style={[styles.name, conversation.unread && styles.unreadName]} numberOfLines={1}>{template.name}</Text><Text style={styles.time}>{formatInboxTimestamp(conversation.last_message_at)}</Text></View>
        <Text style={[styles.preview, conversation.unread && styles.unreadPreview]} numberOfLines={2}>{inboxPreview(conversation)}</Text>
      </View>
    </Pressable>
    <Pressable accessibilityLabel={`Options for ${template.name}`} onPress={onMenu} disabled={busy} hitSlop={10} style={({ pressed }) => [styles.more, pressed && styles.pressed]}><MoreVertical size={22} color={colors.muted} /></Pressable>
  </View>;
}

function ConversationActions({ row, onClose, onArchive, onSettings }: { row: InboxRow | null; onClose: () => void; onArchive: (row: InboxRow) => void; onSettings: (row: InboxRow) => void }) {
  return <Modal transparent visible={Boolean(row)} animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalRoot}>
      <Pressable accessibilityLabel="Close chat options" onPress={onClose} style={StyleSheet.absoluteFill} />
      {row ? <FrostedSurface intensity={88} style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}><CharacterAvatar slug={row.character.together_character_templates.slug} template={row.character.together_character_templates} version={row.character.together_character_versions} size={42} /><View style={{ flex: 1 }}><Text style={styles.sheetKicker}>CHAT OPTIONS</Text><Text style={styles.sheetName}>{row.character.together_character_templates.name}</Text></View><Pressable accessibilityLabel="Close" onPress={onClose} style={styles.sheetClose}><X size={19} color={colors.muted} /></Pressable></View>
        <Pressable onPress={() => onSettings(row)} style={({ pressed }) => [styles.sheetAction, pressed && styles.pressed]}><Settings size={19} color={colors.text} /><View style={{ flex: 1 }}><Text style={styles.sheetActionTitle}>Edit chat settings</Text><Text style={styles.sheetActionCopy}>Name, response style, text size, and conversation tools</Text></View></Pressable>
        <Pressable onPress={() => onArchive(row)} style={({ pressed }) => [styles.sheetAction, pressed && styles.pressed]}><Archive size={19} color={colors.warm} /><View style={{ flex: 1 }}><Text style={[styles.sheetActionTitle, { color: colors.warm }]}>Archive chat</Text><Text style={styles.sheetActionCopy}>Hide it here without deleting your history</Text></View></Pressable>
      </FrostedSurface> : null}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingTop: 18, paddingBottom: 128 },
  glowTop: { position: 'absolute', top: -120, right: -130, width: 370, height: 370, borderRadius: 185, backgroundColor: 'rgba(98,48,126,.14)' },
  glowBottom: { position: 'absolute', bottom: 40, left: -170, width: 420, height: 420, borderRadius: 210, backgroundColor: 'rgba(91,30,75,.09)' },
  header: { minHeight: 68, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 34, fontWeight: '700' },
  search: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, paddingHorizontal: 16, borderRadius: radius.xl, backgroundColor: 'rgba(35,25,42,.78)', borderWidth: 1, borderColor: colors.border },
  searchInput: { minWidth: 0, flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 },
  clearSearch: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', gap: 4, marginTop: 28, marginBottom: 24, padding: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(14,12,20,.62)' },
  filter: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  filterActive: { backgroundColor: 'rgba(66,40,82,.72)', borderWidth: 1, borderColor: 'rgba(190,139,218,.18)' },
  filterText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  filterTextActive: { color: colors.text, fontWeight: '900' },
  list: { gap: 3 },
  row: { minHeight: 92, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,248,244,.055)' },
  rowBusy: { opacity: .48 },
  rowMain: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 15, paddingVertical: 13 },
  rowCopy: { minWidth: 0, flex: 1 },
  rowTitleLine: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { minWidth: 0, flex: 1, color: colors.text, fontSize: 17, fontWeight: '800' },
  unreadName: { color: '#FFFFFF', fontWeight: '900' },
  time: { color: colors.dimmed, fontSize: 12, fontVariant: ['tabular-nums'] },
  preview: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 7 },
  unreadPreview: { color: colors.textSecondary },
  more: { width: 42, height: 50, marginLeft: 4, alignItems: 'flex-end', justifyContent: 'center' },
  error: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 12, padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(255,113,129,.08)', borderWidth: 1, borderColor: 'rgba(255,113,129,.22)' },
  errorText: { minWidth: 0, flex: 1, color: colors.danger, fontSize: 12 },
  retry: { color: colors.text, fontSize: 11, fontWeight: '900' },
  loading: { color: colors.muted, textAlign: 'center', paddingVertical: 46 },
  pressed: { opacity: .7 },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(5,4,9,.64)' },
  sheet: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 34 : 22, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: 'rgba(25,20,32,.96)', borderColor: colors.borderBright },
  sheetHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.22)', marginBottom: 10 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 9 },
  sheetKicker: { color: colors.dimmed, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  sheetName: { color: colors.text, fontFamily: typography.display, fontSize: 22, marginTop: 2 },
  sheetClose: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.045)' },
  sheetAction: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.04)', borderWidth: 1, borderColor: colors.border },
  sheetActionTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  sheetActionCopy: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
});
