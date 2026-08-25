import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ArrowLeft, Brain, Check, MessageCircle } from 'lucide-react-native';
import { EmptyState, LoadingSkeleton, PageTitle, Screen, resolveCharacterPortraitSource } from '../src/components';
import { setActiveCompanion } from '../src/lib/api';
import { responsiveCompanionGrid } from '../src/lib/responsiveCompanionGrid';
import { selectPortraitVersion } from '../src/lib/selectors';
import { useAppShell } from '../src/shell/AppShellContext';
import { colors, radius } from '../src/theme';
import { useTogether } from '../src/store/useTogether';

export default function Companions() {
  const { snapshot, setSnapshot } = useTogether();
  const { width } = useWindowDimensions();
  const { desktop, sidebarWidth } = useAppShell();
  const [busy, setBusy] = useState('');
  if (!snapshot) return <LoadingSkeleton />;
  const companions = snapshot.characters.filter((item) => item.together_character_templates.can_be_selected && (item.contact_added_at || item.introduced_at));
  if (!companions.length) return <EmptyState title="No established companions yet" body="Meet someone in Discover to begin a relationship." action="Open Discover" onAction={() => router.replace('/(tabs)/singles')} />;
  const { cardWidth } = responsiveCompanionGrid({ viewportWidth: width, desktop, sidebarWidth });
  const activeCompanionId = snapshot.activeContinuity?.active_companion_instance_id ?? snapshot.profile?.active_companion_instance_id;

  return <Screen>
    <View style={styles.header}><Pressable accessibilityLabel="Go back" onPress={() => router.back()}><ArrowLeft color={colors.text} /></Pressable><PageTitle>Your companions</PageTitle></View>
    <Text style={styles.lead}>Switch the relationship in focus, revisit memories, or continue a conversation.</Text>
    <View style={styles.grid}>{companions.map((item) => {
      const template = item.together_character_templates;
      const active = item.id === activeCompanionId;
      const portraitVersion = selectPortraitVersion(snapshot, item);
      const portrait = resolveCharacterPortraitSource(template, portraitVersion, template.slug);
      const working = busy === item.id;
      return <View key={item.id} style={[styles.card, { width: cardWidth }, active && styles.active]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${template.name}'s profile`} onPress={() => router.push(`/character/${template.public_handle ?? template.slug}` as never)} style={({ pressed }) => [styles.portrait, pressed && styles.pressed]}>
          {portrait ? <Image source={portrait} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" cachePolicy="memory-disk" priority="low" recyclingKey={`companion-manager:${item.id}`} /> : <View style={styles.portraitFallback}><Text style={styles.portraitInitial}>{template.name[0]}</Text></View>}
          <View style={styles.portraitShade} />
          <View style={styles.identity}>
            <Text numberOfLines={1} style={styles.name}>{template.name}</Text>
            <Text numberOfLines={2} style={styles.meta}>{item.relationship_stage.replaceAll('_', ' ')} · {item.current_activity}</Text>
          </View>
          {active ? <View style={styles.activePill}><Check size={12} color="#fff" /><Text style={styles.activePillText}>ACTIVE</Text></View> : null}
        </Pressable>
        <View style={styles.actions}>
          <CompactAction
            icon={<Check size={14} color={active ? colors.textSecondary : colors.rose} />}
            label={working ? 'Switching…' : active ? 'Active' : 'Make active'}
            active={active}
            disabled={Boolean(busy) || active}
            onPress={async () => {
              setBusy(item.id);
              try { setSnapshot(await setActiveCompanion(item.id, 'companion_manager')); } finally { setBusy(''); }
            }}
          />
          <CompactAction icon={<MessageCircle size={14} color={colors.rose} />} label="Chat" onPress={() => router.push(`/(tabs)/chat-tab?character=${template.slug}` as never)} />
          <CompactAction icon={<Brain size={14} color={colors.violet} />} label="Memories" onPress={() => router.push(`/memories?character=${template.slug}` as never)} />
        </View>
      </View>;
    })}</View>
    <Pressable onPress={() => router.push('/(tabs)/singles')} style={styles.discover}><Text style={styles.discoverText}>Discover someone new</Text></Pressable>
  </Screen>;
}

function CompactAction({ icon, label, onPress, active = false, disabled = false }: { icon: ReactNode; label: string; onPress: () => void | Promise<void>; active?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected: active }} disabled={disabled} onPress={() => void onPress()} style={({ pressed }) => [styles.action, active && styles.actionActive, disabled && !active && styles.disabled, pressed && styles.pressed]}>{icon}<Text numberOfLines={1} style={[styles.actionText, active && styles.actionTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  lead: { color: colors.muted, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  card: { overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  active: { borderColor: 'rgba(216,62,234,.48)' },
  portrait: { width: '100%', aspectRatio: .8, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: colors.elevated },
  portraitFallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#30203B' },
  portraitInitial: { color: 'rgba(248,241,234,.35)', fontFamily: 'Georgia', fontSize: 104 },
  portraitShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(7,5,11,.08)', borderBottomWidth: 76, borderBottomColor: 'rgba(7,5,11,.58)' },
  identity: { paddingHorizontal: 14, paddingVertical: 13 },
  name: { color: '#fff', fontFamily: 'Georgia', fontSize: 25, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 10 },
  meta: { color: 'rgba(255,255,255,.78)', fontSize: 10, lineHeight: 14, marginTop: 3, textTransform: 'capitalize', textShadowColor: '#000', textShadowRadius: 8 },
  activePill: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(195,50,190,.90)' },
  activePillText: { fontSize: 8, color: '#fff', fontWeight: '900', letterSpacing: .5 },
  actions: { flexDirection: 'row', gap: 6, padding: 8 },
  action: { flex: 1, minWidth: 0, minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 5, borderRadius: radius.sm, backgroundColor: colors.elevated },
  actionActive: { backgroundColor: 'rgba(216,62,234,.13)' },
  actionText: { color: colors.text, fontSize: 9, fontWeight: '800' },
  actionTextActive: { color: colors.textSecondary },
  discover: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  discoverText: { color: colors.rose, fontWeight: '800' },
  pressed: { opacity: .78 },
  disabled: { opacity: .5 },
});
