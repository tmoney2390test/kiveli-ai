import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Brain, ChevronRight, MessageCircle, RotateCcw, Trash2 } from 'lucide-react-native';
import { CharacterAvatar, EmptyState, PageTitle, Screen, SectionHeader } from '../src/components';
import { colors, radius } from '../src/theme';
import { useTogether } from '../src/store/useTogether';
import { manageConversation } from '../src/lib/api';
import { confirmAction } from '../src/lib/dialogs';

export default function ConversationControls() {
  const { snapshot, refresh } = useTogether();
  const [resetId, setResetId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  if (!snapshot) return <EmptyState title="Relationships unavailable" body="Reload Kivelle and try again." />;
  const selected = snapshot.characters.find((item) => item.id === resetId);

  const reset = async (characterId: string, mode: 'memory'|'relationship'|'full') => {
    const target = snapshot.characters.find((item) => item.id === characterId);
    setBusy(true);
    try {
      await manageConversation({ action: 'reset', characterInstanceId: characterId, mode });
      await refresh();
      if (mode === 'full' && target) router.replace(`/chat?character=${target.together_character_templates.slug}` as never);
    } catch (caught) {
      Alert.alert('Reset unavailable', caught instanceof Error ? caught.message : 'Nothing was changed.');
    } finally {
      setBusy(false); setResetId(null); setConfirmation('');
    }
  };

  const relationshipReset = (id: string, name: string) => confirmAction({ title: 'Reset relationship progress?', message: `Your messages, memories, Moments, and photos will remain, but your relationship with ${name} will return to the beginning and Dates will relock.`, confirmLabel: 'Review reset', onConfirm: () => confirmAction({ title: 'Reset relationship progress', message: `Completed Date Moments remain part of your history. Reset progression with ${name}?`, confirmLabel: 'Reset progress', destructive: true, onConfirm: () => reset(id, 'relationship') }) });

  return <Screen>
    <View style={styles.header}><Pressable accessibilityLabel="Back" onPress={() => router.back()}><ArrowLeft color={colors.text} /></Pressable><PageTitle>Conversations & resets</PageTitle></View>
    <Text style={styles.lead}>A conversation is not the relationship. Choose exactly what you want to change.</Text>
    <SectionHeader title="Your companions" />
    {snapshot.characters.map((character) => {
      const name = character.together_character_templates.name;
      const conversations = snapshot.conversations.filter((item) => item.character_instance_id === character.id).length;
      const memories = snapshot.memories.filter((item) => item.character_instance_id === character.id).length;
      const moments = snapshot.moments.filter((item) => item.character_instance_id === character.id || item.participant_instance_ids.includes(character.id)).length;
      return <View key={character.id} style={styles.card}>
        <View style={styles.person}><CharacterAvatar slug={character.together_character_templates.slug} size={48} ring /><View style={{ flex: 1 }}><Text style={styles.name}>{name}</Text><Text style={styles.meta}>{character.relationship_stage.replace('_', ' ')} · {conversations} conversations · {memories} memories · {moments} Moments</Text></View></View>
        <Action icon={<MessageCircle size={17} color={colors.rose} />} title="Manage conversations" body="Search, read, rename, or start a new chat." onPress={() => router.push(`/conversations/${character.id}` as never)} />
        <Action icon={<Brain size={17} color={colors.violet} />} title="Manage memories" body={`Review or forget what ${name} remembers.`} onPress={() => router.push(`/memories?character=${character.together_character_templates.slug}` as never)} />
        <Text style={styles.advanced}>ADVANCED</Text>
        <Action icon={<RotateCcw size={17} color={colors.warm} />} title="Reset relationship progress" body="Messages and shared history remain; progression and Dates restart." onPress={() => relationshipReset(character.id, name)} />
        <Action icon={<Trash2 size={17} color={colors.danger} />} title={`Start over with ${name}`} body="Erase your complete shared Kivelle history with this companion." danger onPress={() => { setResetId(character.id); setConfirmation(''); }} />
      </View>;
    })}
    {selected ? <View style={styles.confirm}>
      <Text style={styles.confirmTitle}>Start over with {selected.together_character_templates.name}</Text>
      <Text style={styles.confirmCopy}>Will remove conversations, memories, relationship progress, Dates, Moments, stories, proactive messages, and relationship-generated media.</Text>
      <Text style={styles.confirmCopy}>Will not remove your Kivelle account, profile, static character assets, or other companions.</Text>
      <Text style={styles.confirmLabel}>Type START OVER to confirm</Text>
      <TextInput value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" placeholder="START OVER" placeholderTextColor={colors.dimmed} style={styles.input} />
      <View style={styles.confirmActions}><Pressable onPress={() => setResetId(null)} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable disabled={confirmation !== 'START OVER' || busy} onPress={() => void reset(selected.id, 'full')} style={[styles.dangerButton, (confirmation !== 'START OVER' || busy) && styles.disabled]}><Text style={styles.dangerText}>{busy ? 'Starting over…' : 'Start over'}</Text></Pressable></View>
    </View> : null}
  </Screen>;
}

function Action({ icon, title, body, onPress, danger = false }: { icon: React.ReactNode; title: string; body: string; onPress: () => void; danger?: boolean }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && { opacity: .82 }]}>{icon}<View style={{ flex: 1 }}><Text style={[styles.actionTitle, danger && { color: colors.danger }]}>{title}</Text><Text style={styles.actionBody}>{body}</Text></View><ChevronRight size={17} color={danger ? colors.danger : colors.muted} /></Pressable>; }
const styles = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', gap: 14 }, lead: { color: colors.muted, fontSize: 13, lineHeight: 19 }, card: { gap: 8, padding: 13, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, person: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingBottom: 5 }, name: { color: colors.text, fontFamily: 'Georgia', fontSize: 22 }, meta: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3, textTransform: 'capitalize' }, action: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 62, padding: 11, borderRadius: radius.md, backgroundColor: colors.elevated }, actionTitle: { color: colors.text, fontWeight: '800', fontSize: 13 }, actionBody: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }, advanced: { color: colors.dimmed, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 7 }, confirm: { gap: 12, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(255,107,121,.4)', backgroundColor: 'rgba(255,107,121,.06)' }, confirmTitle: { color: colors.danger, fontFamily: 'Georgia', fontSize: 24 }, confirmCopy: { color: colors.muted, fontSize: 12, lineHeight: 18 }, confirmLabel: { color: colors.text, fontSize: 11, fontWeight: '800' }, input: { minHeight: 48, paddingHorizontal: 13, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, color: colors.text }, confirmActions: { flexDirection: 'row', gap: 9 }, cancel: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, cancelText: { color: colors.text, fontWeight: '800' }, dangerButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.danger }, dangerText: { color: '#fff', fontWeight: '900' }, disabled: { opacity: .4 } });
