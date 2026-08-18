import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Archive, ArrowLeft, MessageCircle, Search } from 'lucide-react-native';
import { CharacterAvatar, EmptyState, LoadingSkeleton, PageTitle, Screen } from '../../src/components';
import { colors, radius } from '../../src/theme';
import { manageConversation } from '../../src/lib/api';
import { useTogether } from '../../src/store/useTogether';
import type { Conversation, Message } from '../../src/types';

type HistoryItem = Conversation & { message_count: number; last_message_preview?: string | null };
type SearchResult = Pick<Message, 'id' | 'conversation_id' | 'role' | 'content' | 'created_at'>;

export default function ConversationHistory() {
  const { characterInstanceId } = useLocalSearchParams<{ characterInstanceId: string }>();
  const snapshot = useTogether((state) => state.snapshot);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const character = snapshot?.characters.find((item) => item.id === characterInstanceId);

  const load = async () => {
    if (!characterInstanceId) return;
    setLoading(true);
    try { setItems(await manageConversation<HistoryItem[]>({ action: 'history', characterInstanceId })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Conversation history could not be loaded.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [characterInstanceId]);

  const search = async () => {
    if (query.trim().length < 2) { setResults([]); setSearched(false); return; }
    setError(''); setSearched(true);
    try { setResults(await manageConversation<SearchResult[]>({ action: 'search', characterInstanceId, query: query.trim() })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Search is unavailable.'); }
  };

  if (loading) return <LoadingSkeleton label="Opening conversation history…" />;
  if (!character) return <EmptyState title="Companion unavailable" body="This conversation history cannot be opened." />;
  const name = character.together_character_templates.name;
  return <Screen>
    <View style={styles.header}><Pressable accessibilityLabel="Back" onPress={() => router.back()}><ArrowLeft color={colors.text} /></Pressable><CharacterAvatar slug={character.together_character_templates.slug} /><View style={{ flex: 1 }}><PageTitle>Conversation history</PageTitle><Text style={styles.subtitle}>Your conversations with {name}</Text></View></View>
    <View style={styles.search}><Search size={18} color={colors.muted} /><TextInput value={query} onChangeText={(value) => { setQuery(value); if (!value.trim()) { setResults([]); setSearched(false); } }} onSubmitEditing={() => void search()} placeholder="Search conversations" placeholderTextColor={colors.dimmed} style={styles.input} /><Pressable onPress={() => void search()} style={styles.searchButton}><Text style={styles.searchButtonText}>Search</Text></Pressable></View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {searched ? <View style={styles.list}><Text style={styles.section}>{results.length} MATCH{results.length === 1 ? '' : 'ES'}</Text>{results.map((message) => <Pressable key={message.id} onPress={() => router.push(`/conversation/${message.conversation_id}?messageId=${message.id}` as never)} style={styles.result}><Text style={styles.preview} numberOfLines={3}>{message.content}</Text><Text style={styles.meta}>{new Date(message.created_at).toLocaleDateString()}</Text></Pressable>)}{!results.length ? <EmptyState title="No matches" body="Try another word or phrase." /> : null}</View> : <View style={styles.list}>{items.map((conversation) => { const active = !conversation.archived_at; const start = conversation.created_at ? new Date(conversation.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''; const end = conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : start; return <Pressable key={conversation.id} onPress={() => active ? router.push(`/chat?character=${character.together_character_templates.slug}` as never) : router.push(`/conversation/${conversation.id}` as never)} style={styles.card}><View style={styles.cardTop}>{active ? <MessageCircle size={17} color={colors.rose} /> : <Archive size={17} color={colors.violet} />}<Text style={styles.title}>{conversation.title ?? 'Conversation'}</Text><View style={[styles.badge, active && styles.activeBadge]}><Text style={styles.badgeText}>{active ? 'CURRENT' : 'ARCHIVED'}</Text></View></View><Text style={styles.preview} numberOfLines={2}>{conversation.last_message_preview ?? 'No messages in this conversation.'}</Text><Text style={styles.meta}>{start}{end && end !== start ? ` – ${end}` : ''} · {conversation.message_count} messages</Text></Pressable>; })}{!items.length ? <EmptyState title="No conversations yet" body={`Your first conversation with ${name} will appear here.`} /> : null}</View>}
  </Screen>;
}

const styles = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, subtitle: { color: colors.muted, fontSize: 11, marginTop: 3 }, search: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 50, paddingHorizontal: 13, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, input: { flex: 1, color: colors.text }, searchButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.rose }, searchButtonText: { color: '#fff', fontSize: 10, fontWeight: '900' }, list: { gap: 10 }, section: { color: colors.rose, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, card: { padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 7 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { flex: 1, color: colors.text, fontFamily: 'Georgia', fontSize: 19 }, badge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.elevated }, activeBadge: { backgroundColor: 'rgba(216,62,234,.14)' }, badgeText: { color: colors.muted, fontSize: 8, fontWeight: '900' }, preview: { color: colors.muted, fontSize: 12, lineHeight: 18 }, meta: { color: colors.dimmed, fontSize: 10 }, result: { padding: 13, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, error: { color: colors.danger, fontSize: 12 } });
