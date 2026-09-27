import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BookOpen, CalendarPlus, LockKeyhole, MapPin } from 'lucide-react-native';
import type { CharacterInstance } from '../types';
import { navigateLocalRouteOnWeb } from '../lib/appNavigation';
import { colors } from '../theme';

export function ScenarioScheduleNotice({ character, locationName }: { character: CharacterInstance; locationName?: string }) {
  const scenario = character.scenario_state;
  if (!scenario) return null;
  const open = (planning = false) => {
    const href = `/chat?character=${character.id}&conversationId=${scenario.conversationId}${planning ? '&plan=1' : ''}`;
    if (!navigateLocalRouteOnWeb(href)) router.push(href as never);
  };
  return <View style={styles.card}>
    <View style={styles.row}><LockKeyhole size={19} color={colors.rose} /><Text accessibilityRole="header" style={styles.heading}>Schedule paused during scenario</Text></View>
    <Text style={styles.title}>{scenario.title}</Text>
    <View style={styles.row}><MapPin size={14} color={colors.muted} /><Text style={styles.copy}>{locationName ?? 'Scenario location'}</Text></View>
    <Text style={styles.copy}>Their routine is on hold while this story is active. You can still make plans together.</Text>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Continue scenario" onPress={() => open()} style={styles.action}><BookOpen size={16} color={colors.rose} /><Text style={styles.link}>Continue scenario</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Plan an event" onPress={() => open(true)} style={styles.action}><CalendarPlus size={16} color={colors.rose} /><Text style={styles.link}>Plan an event</Text></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({ card: { gap: 12, padding: 18, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, row: { flexDirection: 'row', alignItems: 'center', gap: 9 }, heading: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '700' }, title: { fontSize: 19, lineHeight: 25, color: colors.text, fontWeight: '700' }, copy: { flexShrink: 1, fontSize: 13, lineHeight: 20, color: colors.muted }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, action: { minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 7 }, link: { color: colors.rose, fontSize: 13, fontWeight: '700' } });
