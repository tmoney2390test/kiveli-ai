import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../theme';
import { chatSettingsPalette as glass } from './chatSettingsPalette';

export type ChatSettingsTab = 'chat' | 'appearance' | 'ai' | 'proactive';

const tabs: ReadonlyArray<{ id: ChatSettingsTab; label: string }> = [
  { id: 'chat', label: 'Chat' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'ai', label: 'AI' },
];

export function ChatSettingsTabs({ value, disabled = false, includeProactive = false, onChange }: { value: ChatSettingsTab; disabled?: boolean; includeProactive?: boolean; onChange: (tab: ChatSettingsTab) => void }) {
  return <View accessibilityRole="tablist" accessibilityLabel="Chat settings sections" style={styles.tabs}>
    {(includeProactive ? [...tabs, { id: 'proactive' as const, label: 'Proactive' }] : tabs).map((tab) => {
      const selected = tab.id === value;
      return <Pressable
        key={tab.id}
        testID={`chat-settings-tab-${tab.id}`}
        accessibilityRole="tab"
        aria-selected={selected}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={() => onChange(tab.id)}
        style={({ pressed }) => [styles.tab, selected && styles.tabSelected, pressed && styles.pressed]}
      >
        <Text style={[styles.label, selected && styles.labelSelected]}>{tab.label}</Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 4, marginHorizontal: 18, marginTop: 14, padding: 4, borderRadius: radius.md, backgroundColor: glass.inset, borderWidth: 1, borderColor: glass.border },
  tab: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  tabSelected: { backgroundColor: glass.selected, borderWidth: 1, borderColor: glass.selectedBorder },
  label: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  labelSelected: { color: colors.text },
  pressed: { opacity: .72 },
});
