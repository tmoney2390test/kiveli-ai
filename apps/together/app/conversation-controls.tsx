import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Brain, ChevronRight, MessageCircle, RotateCcw, Trash2 } from 'lucide-react-native';
import { CharacterAvatar, EmptyState, PageTitle, Screen, SectionHeader } from '../src/components';
import { colors, radius } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { manageConversation, previewCharacterReset, startOverCharacter } from '../src/lib/api';
import { confirmAction } from '../src/lib/dialogs';
import { createClientRequestId } from '../src/lib/requestId';
import type { CharacterResetPreview, CharacterResetResult } from '../src/types';

export default function ConversationControls() {
  const params = useLocalSearchParams<{ character?: string }>();
  const { snapshot, refresh } = useTogether();
  const [resetId, setResetId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<CharacterResetPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [startOverRequestId, setStartOverRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!resetId) { setPreview(null); setStartOverRequestId(null); return; }
    setStartOverRequestId(createClientRequestId());
    let cancelled = false;
    setPreviewLoading(true);
    void previewCharacterReset(resetId)
      .then((value) => { if (!cancelled) setPreview(value); })
      .catch((caught) => { if (!cancelled) Alert.alert('Reset unavailable', caught instanceof Error ? caught.message : 'The reset preview could not be loaded.'); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [resetId]);

  if (!snapshot) return <EmptyState title="Relationships unavailable" body="Reload Kivelle and try again." />;
  const selected = snapshot.characters.find((item) => item.id === resetId);
  const focused = params.character ? snapshot.characters.find((item) => item.id === params.character || item.together_character_templates.slug === params.character) : undefined;
  const meaningful = focused ? [focused] : snapshot.characters.filter((item) => item.contact_added_at || item.introduced_at || item.relationship_stage !== 'stranger' || snapshot.conversations.some((conversation) => conversation.character_instance_id === item.id && !conversation.user_archived_at && (conversation.message_count ?? 0) > 0));

  const reset = async (characterId: string, mode: 'memory'|'relationship'|'full') => {
    const target = snapshot.characters.find((item) => item.id === characterId);
    setBusy(true);
    let completed = false;
    try {
      let result: CharacterResetResult | null = null;
      if (mode === 'full') {
        result = await startOverCharacter(characterId, startOverRequestId ?? createClientRequestId());
      } else {
        await manageConversation({ action: 'reset', characterInstanceId: characterId, mode });
      }
      await refresh();
      if (mode === 'full' && result?.becameActive) {
        router.replace(`/(tabs)/chat-tab?character=${encodeURIComponent(result.characterHandle)}` as never);
      } else if (mode === 'full' && result && target) {
        Alert.alert('Ready to meet again', `${target.together_character_templates.name} now has a fresh relationship in this Life. Your active companion was not changed.`);
      }
      completed = true;
    } catch (caught) {
      Alert.alert('Reset unavailable', caught instanceof Error ? caught.message : 'Nothing was changed.');
    } finally {
      setBusy(false); if (completed || mode !== 'full') { setResetId(null); setConfirmation(''); setPreview(null); setStartOverRequestId(null); }
    }
  };

  const relationshipReset = (id: string, name: string) => confirmAction({ title: 'Reset relationship progress?', message: `Your messages, memories, Moments, and photos will remain, but your relationship with ${name} will return to the beginning and Dates will relock.`, confirmLabel: 'Review reset', onConfirm: () => confirmAction({ title: 'Reset relationship progress', message: `Completed Date Moments remain part of your history. Reset progression with ${name}?`, confirmLabel: 'Reset progress', destructive: true, onConfirm: () => reset(id, 'relationship') }) });

  return <Screen>
    <View style={styles.header}><Pressable accessibilityLabel="Back" onPress={() => router.back()}><ArrowLeft color={colors.text} /></Pressable><PageTitle>{focused ? `${focused.together_character_templates.name} chat settings` : 'Conversations & resets'}</PageTitle></View>
    <Text style={styles.lead}>{focused ? 'Manage this chat without changing the relationship unless you choose an advanced reset.' : 'A conversation is not the relationship. Choose exactly what you want to change.'}</Text>
    <SectionHeader title={focused ? 'Conversation' : 'Your companions'} />
    {meaningful.map((character) => {
      const name = character.together_character_templates.name;
      const conversations = snapshot.conversations.filter((item) => item.character_instance_id === character.id && !item.user_archived_at).length;
      const memories = snapshot.memoryCounts?.[character.id] ?? snapshot.memories.filter((item) => item.character_instance_id === character.id).length;
      const moments = snapshot.moments.filter((item) => item.character_instance_id === character.id || item.participant_instance_ids.includes(character.id)).length;
      return <View key={character.id} style={styles.card}>
        <View style={styles.person}><CharacterAvatar slug={character.together_character_templates.slug} size={48} ring /><View style={{ flex: 1 }}><Text style={styles.name}>{name}</Text><Text style={styles.meta}>{character.relationship_stage.replace('_', ' ')} Â· {conversations} conversations Â· {memories} memories Â· {moments} Moments</Text></View></View>
        <Action icon={<MessageCircle size={17} color={colors.rose} />} title="Manage conversations" body="Search, read, rename, or start a new chat." onPress={() => router.push(`/conversations/${character.id}` as never)} />
        <Action icon={<Brain size={17} color={colors.violet} />} title="Manage memories" body={`Review or forget what ${name} remembers.`} onPress={() => router.push(`/memories?character=${character.together_character_templates.slug}` as never)} />
        <Text style={styles.advanced}>ADVANCED</Text>
        <Action icon={<RotateCcw size={17} color={colors.warm} />} title="Reset relationship progress" body="Messages and shared history remain; progression and Dates restart." onPress={() => relationshipReset(character.id, name)} />
        <Action icon={<Trash2 size={17} color={colors.danger} />} title={`Start over with ${name}`} body="Erase your complete shared Kivelle history with this companion." danger onPress={() => { setResetId(character.id); setConfirmation(''); }} />
      </View>;
    })}
    {selected ? <View style={styles.confirm}>
      <Text style={styles.confirmTitle}>Start over with {selected.together_character_templates.name}</Text>
      <Text style={styles.confirmCopy}>This permanently replaces this relationship. It removes conversations, memories, active and past plans, Dates, Moments, stories, scenes, and relationship-generated photos.</Text>
      {previewLoading ? <Text style={styles.previewText}>Loading what will be removed…</Text> : preview ? <View style={styles.previewBox}>
        <Text style={styles.previewTitle}>This Life will lose</Text>
        <Text style={styles.previewText}>{preview.counts.conversations} conversations · {preview.counts.memories} memories · {preview.counts.upcomingPlans} upcoming plans</Text>
        <Text style={styles.previewText}>{preview.counts.historicalPlans} past plans · {preview.counts.dates} Dates · {preview.counts.moments} Moments</Text>
        <Text style={styles.previewText}>{preview.counts.photos} photos · {preview.counts.stories} stories</Text>
      </View> : null}
      <Text style={styles.confirmCopy}>Your account, Persona, Life, world access, reusable character, and other companions are preserved.</Text>
      <Text style={styles.confirmLabel}>Type START OVER to confirm</Text>
      <TextInput value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" placeholder="START OVER" placeholderTextColor={colors.dimmed} style={styles.input} />
      <View style={styles.confirmActions}><Pressable onPress={() => setResetId(null)} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable disabled={confirmation !== 'START OVER' || busy || previewLoading || !preview} onPress={() => void reset(selected.id, 'full')} style={[styles.dangerButton, (confirmation !== 'START OVER' || busy || previewLoading || !preview) && styles.disabled]}><Text style={styles.dangerText}>{busy ? 'Starting over…' : 'Start over'}</Text></Pressable></View>
    </View> : null}
  </Screen>;
}

function Action({ icon, title, body, onPress, danger = false }: { icon: React.ReactNode; title: string; body: string; onPress: () => void; danger?: boolean }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && { opacity: .82 }]}>{icon}<View style={{ flex: 1 }}><Text style={[styles.actionTitle, danger && { color: colors.danger }]}>{title}</Text><Text style={styles.actionBody}>{body}</Text></View><ChevronRight size={17} color={danger ? colors.danger : colors.muted} /></Pressable>; }
const styles = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', gap: 14 }, lead: { color: colors.muted, fontSize: 13, lineHeight: 19 }, card: { gap: 8, padding: 13, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, person: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingBottom: 5 }, name: { color: colors.text, fontFamily: 'Georgia', fontSize: 22 }, meta: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3, textTransform: 'capitalize' }, action: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 62, padding: 11, borderRadius: radius.md, backgroundColor: colors.elevated }, actionTitle: { color: colors.text, fontWeight: '800', fontSize: 13 }, actionBody: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }, advanced: { color: colors.dimmed, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 7 }, confirm: { gap: 12, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,107,121,.4)', backgroundColor: 'rgba(255,107,121,.06)' }, confirmTitle: { color: colors.danger, fontFamily: 'Georgia', fontSize: 24 }, confirmCopy: { color: colors.muted, fontSize: 12, lineHeight: 18 }, previewBox: { gap: 4, padding: 11, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.04)', borderWidth: 1, borderColor: colors.border }, previewTitle: { color: colors.text, fontWeight: '900', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }, previewText: { color: colors.muted, fontSize: 11, lineHeight: 17 }, confirmLabel: { color: colors.text, fontSize: 11, fontWeight: '800' }, input: { minHeight: 48, paddingHorizontal: 13, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text }, confirmActions: { flexDirection: 'row', gap: 9 }, cancel: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, cancelText: { color: colors.text, fontWeight: '800' }, dangerButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.danger }, dangerText: { color: '#fff', fontWeight: '900' }, disabled: { opacity: .4 } });
