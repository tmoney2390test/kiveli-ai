import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Film } from 'lucide-react-native';
import { colors } from '../theme';
import { VIDEO_ACCENT } from '../lib/videoCreator';
import { KivelleCreditIcon } from './KivelleCreditIcon';

export function VideoCreateFooter({ cost, balance, disabledReason, submitting, onCreate, onBuyCredits, testID }: {
  cost: number; balance: number | null; disabledReason: string | null; submitting: boolean;
  onCreate: () => void; onBuyCredits?: () => void; testID: string;
}) {
  const validCost = Number.isFinite(cost), short = balance !== null && validCost && balance < cost;
  return <View style={s.footer}>
    <View style={s.row}>
      <View style={s.total} accessibilityLiveRegion="polite">
        <Text style={s.label}>Total</Text>
        <View style={s.amount}><KivelleCreditIcon size={18}/><Text testID={`${testID}-total`} style={s.price}>{validCost ? `${cost} credits` : 'Unavailable'}</Text></View>
        <Text testID={`${testID}-balance`} style={s.balance}>{balance === null ? 'Checking balance…' : `${balance.toLocaleString()} available${validCost && !short ? ` · ${(balance - cost).toLocaleString()} after` : ''}`}</Text>
      </View>
      <Pressable testID={testID} accessibilityRole="button" accessibilityLabel="Create video" accessibilityState={{ disabled: !!disabledReason || !validCost, busy: submitting }} disabled={!!disabledReason || !validCost} onPress={onCreate} style={[s.button, (!!disabledReason || !validCost) && s.disabled]}>
        {submitting ? <ActivityIndicator color="#20172B"/> : <Film size={18} color="#20172B"/>}<Text style={s.buttonText}>{submitting ? 'Starting…' : 'Create video'}</Text>
      </Pressable>
    </View>
    {disabledReason ? <Text accessibilityLiveRegion="polite" style={s.reason}>{disabledReason}</Text> : null}
    {short && onBuyCredits ? <Pressable accessibilityRole="button" onPress={onBuyCredits} style={s.buy}><Text style={s.buyText}>Get {Math.ceil(cost - balance)} more credits</Text></Pressable> : null}
  </View>;
}
const s = StyleSheet.create({
  footer: { width: '100%', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 }, total: { flex: 1 },
  label: { color: colors.muted, fontSize: 11, marginBottom: 5 }, amount: { flexDirection: 'row', alignItems: 'center', gap: 6 }, price: { color: colors.text, fontSize: 15, fontWeight: '700' },
  balance: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 5 },
  button: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: VIDEO_ACCENT, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, buttonText: { color: '#20172B', fontSize: 14, fontWeight: '700' }, disabled: { opacity: .42 },
  reason: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 }, buy: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' }, buyText: { color: VIDEO_ACCENT, fontSize: 12, fontWeight: '600' },
});
