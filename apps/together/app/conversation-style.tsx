import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AlignLeft, ArrowLeft, Check, MessageCircle } from 'lucide-react-native';
import { FrostedSurface, PageTitle, Screen } from '../src/components';
import { manageAccount } from '../src/lib/api';
import { conversationStyleOptions, resolveClientConversationStyle } from '../src/lib/conversationStyle';
import { useTogether } from '../src/store/useTogether';
import { colors, radius, spacing } from '../src/theme';
import type { ConversationPreferences, ConversationStyle } from '../src/types';

export default function ConversationStyleSettings() {
  const { snapshot, setCoreState } = useTogether();
  const persisted = resolveClientConversationStyle(snapshot?.profile ?? null);
  const [selected, setSelected] = useState<ConversationStyle>(persisted);
  const [busy, setBusy] = useState<ConversationStyle | null>(null);

  useEffect(() => setSelected(persisted), [persisted]);

  const close = () => router.canGoBack() ? router.back() : router.replace('/settings');
  const choose = async (responseStyle: ConversationStyle) => {
    if (!snapshot?.profile || busy || responseStyle === selected) return;
    const previous = selected;
    setSelected(responseStyle);
    setBusy(responseStyle);
    try {
      const result = await manageAccount<{ conversation_preferences: ConversationPreferences }>({ action: 'conversation_style', responseStyle });
      setCoreState({ profile: { ...snapshot.profile, conversation_preferences: result.conversation_preferences } as never });
    } catch (error) {
      setSelected(previous);
      Alert.alert('Could not update conversation style', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return <Screen scroll>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={close} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><ArrowLeft color={colors.text} size={21} /></Pressable>
      <View style={{ flex: 1 }}><PageTitle>Conversation style</PageTitle><Text style={styles.intro}>Choose how companions normally express their responses.</Text></View>
    </View>

    <View accessibilityRole="radiogroup" style={styles.options}>
      {conversationStyleOptions.map((option) => {
        const active = selected === option.value;
        const Icon = option.value === 'texting' ? MessageCircle : AlignLeft;
        return <Pressable
          key={option.value}
          accessibilityRole="radio"
          accessibilityState={{ checked: active, disabled: Boolean(busy) }}
          accessibilityLabel={`${option.title}. ${option.description}`}
          disabled={Boolean(busy)}
          onPress={() => void choose(option.value)}
          style={({ pressed }) => [styles.optionPressable, pressed && styles.pressed]}
        >
          <FrostedSurface intensity={active ? 82 : 68} style={[styles.option, active && styles.optionActive]}>
            <View style={[styles.icon, active && styles.iconActive]}><Icon color={active ? '#F7DFFF' : colors.muted} size={23} /></View>
            <View style={styles.optionCopy}><Text style={styles.optionTitle}>{option.title}</Text><Text style={styles.optionBody}>{option.description}</Text></View>
            <View style={[styles.check, active && styles.checkActive]}>{active ? <Check color="#fff" size={15} strokeWidth={3} /> : null}</View>
          </FrostedSurface>
        </Pressable>;
      })}
    </View>

    <View style={styles.note}><Text style={styles.noteText}>Characters may still say more when the moment calls for it.</Text></View>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.05)', borderWidth: 1, borderColor: colors.border },
  intro: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  options: { gap: spacing.md },
  optionPressable: { borderRadius: radius.lg },
  option: { minHeight: 126, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: 'rgba(24,19,31,.72)', borderColor: colors.border },
  optionActive: { backgroundColor: 'rgba(77,35,91,.66)', borderColor: 'rgba(216,151,255,.62)', shadowColor: colors.violet, shadowOpacity: .24, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.045)', borderWidth: 1, borderColor: colors.border },
  iconActive: { backgroundColor: 'rgba(185,111,230,.18)', borderColor: 'rgba(221,173,255,.36)' },
  optionCopy: { flex: 1 },
  optionTitle: { color: colors.text, fontSize: 19, fontWeight: '900', marginBottom: 7 },
  optionBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  check: { width: 25, height: 25, borderRadius: 13, borderWidth: 1, borderColor: colors.borderBright, alignItems: 'center', justifyContent: 'center' },
  checkActive: { backgroundColor: colors.violet, borderColor: '#DBB5FF' },
  note: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: colors.border },
  noteText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  pressed: { opacity: .78, transform: [{ scale: .995 }] },
});
