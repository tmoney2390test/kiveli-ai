import { Bell, ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatQuietHoursRange } from '../../lib/notificationPreferences';
import { colors, radius } from '../../theme';

export function QuietHoursSettingLink({ start, end, disabled = false, onPress }: {
  start?: string | null;
  end?: string | null;
  disabled?: boolean;
  onPress: () => void;
}) {
  const value = formatQuietHoursRange(start, end);
  return <Pressable
    testID="chat-quiet-hours-setting"
    accessibilityRole="button"
    accessibilityLabel={`Quiet hours: ${value}`}
    accessibilityHint="Opens notification timing settings"
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.row, disabled && styles.disabled, pressed && styles.pressed]}
  >
    <View style={styles.icon}><Bell size={16} color={colors.violet} /></View>
    <Text style={styles.label}>Quiet hours</Text>
    <Text style={styles.value}>{value}</Text>
    <ChevronRight size={17} color={colors.dimmed} />
  </Pressable>;
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.025)', borderWidth: 1, borderColor: colors.border },
  icon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(157,66,228,.14)' },
  label: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '900' },
  value: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
  disabled: { opacity: .5 },
  pressed: { opacity: .72 },
});
