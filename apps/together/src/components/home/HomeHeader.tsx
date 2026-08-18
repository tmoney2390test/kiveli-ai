import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Coins } from 'lucide-react-native';
import { colors, radius } from '../../theme';
import type { SubscriptionStatus } from '../../lib/subscription';
import { KivelleLogo } from '../KivelleLogo';

export function HomeHeader({ status, personaName, onCredits, onProfile }: { status: SubscriptionStatus | null; personaName: string; onCredits: () => void; onProfile: () => void }) {
  const total = status?.creditBalance.total;
  return <View style={styles.header}>
    <KivelleLogo height={35} />
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel={typeof total === 'number' ? `${total.toLocaleString()} Kivelle Credits` : 'Open Kivelle Credits'} onPress={onCredits} style={({ pressed }) => [styles.credits, pressed && styles.pressed]}><View style={styles.coin}><Coins size={14} color={colors.warm} /></View><Text style={styles.creditText}>{typeof total === 'number' ? total.toLocaleString() : 'Credits'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Open your profile" onPress={onProfile} style={({ pressed }) => [styles.profile, pressed && styles.pressed]}><Text style={styles.initial}>{personaName.trim()[0]?.toUpperCase() || 'Y'}</Text></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  credits: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 8, paddingRight: 12, borderRadius: radius.pill, backgroundColor: 'rgba(20,16,24,.82)', borderWidth: 1, borderColor: 'rgba(241,160,120,.16)' },
  coin: { width: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(241,160,120,.09)' },
  creditText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  profile: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.elevated, borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' },
  initial: { color: colors.text, fontSize: 13, fontWeight: '900' },
  pressed: { opacity: .78, transform: [{ scale: .97 }] },
});
