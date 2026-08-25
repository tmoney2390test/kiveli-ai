import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Archive, ArrowLeft, Undo2 } from 'lucide-react-native';
import { EmptyState, LoadingSkeleton, PageTitle, Screen } from '../../src/components';
import { colors, radius } from '../../src/theme';
import { manageConversation } from '../../src/lib/api';
import type { Conversation, Message } from '../../src/types';
import { useTogether } from '../../src/store/useTogether';
import { activeConversationFor } from '../../src/lib/conversation';
import { archiveRetentionLabel } from '../../src/lib/chatArchive';

type Page = { messages: Message[]; hasMore: boolean; conversation: Conversation };

export default function ArchivedConversation() {
  const { id, messageId } = useLocalSearchParams<{ id: string; messageId?: string }>();
  const { snapshot, refresh } = useTogether();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [older, setOlder] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');

  const load = async (before?: { createdAt: string; sequence?: number | null }) => {
    if (!id) return;
    if (before) setOlder(true); else setLoading(true);
    try {
      const page = await manageConversation<Page>({ action: 'messages', conversationId: id, ...(before ? { before: before.createdAt, ...(before.sequence ? { beforeSequence: before.sequence } : {}) } : {}), ...(!before && messageId ? { anchorMessageId: messageId } : {}), limit: 50 });
      setConversation(page.conversation);
      setHasMore(page.hasMore);
      const ordered = [...page.messages].reverse();
      setMessages((current) => before ? [...ordered.filter((message) => !current.some((item) => item.id === message.id)), ...current] : ordered);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This conversation could not be loaded.');
    } finally {
      setLoading(false);
      setOlder(false);
    }
  };
  useEffect(() => { void load(); }, [id, messageId]);

  if (loading) return <LoadingSkeleton label="Opening archived conversation…" />;
  if (!conversation) return <EmptyState title="Conversation unavailable" body={error || 'This transcript may have been deleted.'} />;
  const character = snapshot?.characters.find((item) => item.id === conversation.character_instance_id);
  const hasActiveConversation = snapshot ? Boolean(activeConversationFor(snapshot.conversations, conversation.character_instance_id)) : true;
  const startConversation = async () => { if (!character) return; await manageConversation({ action: 'new', characterInstanceId: character.id }); await refresh(); router.replace(`/chat?character=${character.together_character_templates.slug}` as never); };
  const restoreConversation = async () => { if (!character || restoring) return; setRestoring(true); try { await manageConversation({ action: 'restore', conversationId: conversation.id }); await refresh(); router.replace(`/chat?character=${character.together_character_templates.slug}` as never); } catch (caught) { setError(caught instanceof Error ? caught.message : 'This chat could not be restored.'); setRestoring(false); } };
  return <Screen>
    <View style={styles.header}><Pressable accessibilityLabel="Back" onPress={() => router.back()}><ArrowLeft color={colors.text} /></Pressable><View style={{ flex: 1 }}><PageTitle>{conversation.title ?? 'Conversation'}</PageTitle><View style={styles.archived}><Archive size={13} color={colors.violet} /><Text style={styles.archivedText}>{conversation.archived_at ? 'Archived conversation' : 'Current conversation'}</Text></View></View></View>
    {hasMore ? <Pressable disabled={older} onPress={() => { const oldest=messages[0]; if(oldest) void load({createdAt:oldest.created_at,sequence:oldest.conversation_sequence}); }} style={styles.load}><Text style={styles.loadText}>{older ? 'Loading…' : 'Load earlier messages'}</Text></Pressable> : <Text style={styles.start}>Beginning of conversation</Text>}
    <View style={styles.messages}>{messages.map((message) => <View key={message.id} style={[styles.bubble, message.role === 'user' ? styles.user : styles.companion, message.id === messageId && styles.match]}><Text style={styles.text}>{message.content}</Text><Text style={styles.time}>{new Date(message.created_at).toLocaleString()}</Text></View>)}</View>
    {conversation.archived_at ? <View style={styles.notice}><Text style={styles.noticeTitle}>{conversation.user_archived_at?'Deleted chat':'Archived conversation'}</Text><Text style={styles.noticeCopy}>{conversation.user_archived_at?`This transcript is read-only. ${archiveRetentionLabel(conversation.restore_until)}.`:'This transcript is read-only. It is not automatically used as current chat context.'}</Text></View> : null}
    {error?<Text style={styles.error}>{error}</Text>:null}
    {conversation.user_archived_at&&character?<Pressable disabled={restoring} onPress={() => void restoreConversation()} style={[styles.startButton,restoring&&styles.disabled]}><Undo2 size={17} color="#fff"/><Text style={styles.startButtonText}>{restoring?'Restoring…':'Restore this chat'}</Text></Pressable>:null}
    {conversation.archived_at && !conversation.user_archived_at && !hasActiveConversation && character ? <Pressable onPress={() => void startConversation()} style={styles.startButton}><Text style={styles.startButtonText}>Start a new conversation</Text></Pressable> : null}
  </Screen>;
}

const styles = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', gap: 13 }, archived: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }, archivedText: { color: colors.violet, fontSize: 10, fontWeight: '800' }, messages: { gap: 8 }, bubble: { maxWidth: '86%', padding: 12, borderRadius: radius.md }, user: { alignSelf: 'flex-end', backgroundColor: '#A52EB6' }, companion: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, match: { borderWidth: 2, borderColor: colors.warm }, text: { color: colors.text, fontSize: 14, lineHeight: 21 }, time: { color: 'rgba(255,255,255,.45)', fontSize: 9, marginTop: 5 }, load: { alignSelf: 'center', paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface }, loadText: { color: colors.rose, fontSize: 11, fontWeight: '800' }, start: { color: colors.dimmed, fontSize: 10, textAlign: 'center' }, notice: { padding: 14, borderRadius: radius.md, backgroundColor: 'rgba(154,104,255,.08)', borderWidth: 1, borderColor: 'rgba(154,104,255,.2)' }, noticeTitle: { color: colors.text, fontWeight: '800' }, noticeCopy: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }, startButton: { minHeight: 48, flexDirection:'row',gap:7,alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.rose }, startButtonText: { color: '#fff', fontWeight: '900' },error:{color:colors.danger,fontSize:11,textAlign:'center'},disabled:{opacity:.55} });
