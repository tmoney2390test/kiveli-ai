import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Brain, Check, ChevronRight, MessageCircle } from 'lucide-react-native';
import { CharacterAvatar, EmptyState, LoadingSkeleton, PageTitle, Screen, SpiceBadge } from '../src/components';
import { setActiveCompanion } from '../src/lib/api';
import { colors, radius } from '../src/theme';
import { useTogether } from '../src/store/useTogether';

export default function Companions() {
  const { snapshot, setSnapshot } = useTogether();
  const [busy, setBusy] = useState('');
  if (!snapshot) return <LoadingSkeleton />;
  const companions = snapshot.characters.filter((item) => item.together_character_templates.can_be_selected && (item.contact_added_at || item.introduced_at));
  if (!companions.length) return <EmptyState title="No established companions yet" body="Meet someone in Discover to begin a relationship." action="Open Discover" onAction={() => router.replace('/(tabs)/singles')} />;
  return <Screen>
    <View style={styles.header}><Pressable onPress={() => router.back()}><ArrowLeft color={colors.text} /></Pressable><PageTitle>Your companions</PageTitle></View>
    <Text style={styles.lead}>Switch the relationship in focus, revisit memories, or continue a conversation.</Text>
    {companions.map((item) => {
      const template = item.together_character_templates;
      const active = item.id === snapshot.profile?.active_companion_instance_id;
      return <View key={item.id} style={[styles.card, active && styles.active]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${template.name}'s profile`} onPress={() => router.push(`/character/${template.slug}` as never)} style={styles.person}>
          <View style={styles.avatar}><CharacterAvatar slug={template.slug} name={template.name} size={58} ring={active} /><SpiceBadge level={template.spice_level} overlay compact /></View>
          <View style={{ flex: 1 }}><Text style={styles.name}>{template.name}</Text><Text style={styles.meta}>{item.relationship_stage.replace('_', ' ')} · {item.current_activity}</Text></View>
          {active ? <View style={styles.pill}><Check size={13} color="#fff" /><Text style={styles.pillText}>ACTIVE</Text></View> : <ChevronRight color={colors.muted} />}
        </Pressable>
        <View style={styles.actions}>
          {!active ? <Pressable disabled={Boolean(busy)} onPress={async () => { setBusy(item.id); try { setSnapshot(await setActiveCompanion(item.id, 'companion_manager')); } finally { setBusy(''); } }} style={styles.action}><Check size={16} color={colors.rose} /><Text style={styles.actionText}>{busy === item.id ? 'Switching…' : 'Make active'}</Text></Pressable> : null}
          <Pressable onPress={() => router.push(`/(tabs)/chat-tab?character=${template.slug}` as never)} style={styles.action}><MessageCircle size={16} color={colors.rose} /><Text style={styles.actionText}>Chat</Text></Pressable>
          <Pressable onPress={() => router.push(`/memories?character=${template.slug}` as never)} style={styles.action}><Brain size={16} color={colors.violet} /><Text style={styles.actionText}>Memories</Text></Pressable>
        </View>
      </View>;
    })}
    <Pressable onPress={() => router.push('/(tabs)/singles')} style={styles.discover}><Text style={styles.discoverText}>Discover someone new</Text></Pressable>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: 14, alignItems: 'center' }, lead: { color: colors.muted, lineHeight: 19 },
  card: { padding: 13, gap: 10, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, active: { borderColor: 'rgba(232,93,140,.35)' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 58, height: 58, position: 'relative' },
  name: { fontFamily: 'Georgia', fontSize: 22, color: colors.text }, meta: { color: colors.muted, fontSize: 11, marginTop: 3, textTransform: 'capitalize' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.rose }, pillText: { fontSize: 8, color: '#fff', fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' }, action: { flex: 1, minWidth: 90, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.md, backgroundColor: colors.elevated }, actionText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  discover: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }, discoverText: { color: colors.rose, fontWeight: '800' },
});
