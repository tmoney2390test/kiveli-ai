import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ShieldCheck } from 'lucide-react-native';
import { router } from 'expo-router';
import { GradientButton, KivelleLogo, Screen } from '../src/components';
import { confirmAdultAge } from '../src/lib/api';
import { useTogether } from '../src/store/useTogether';
import { colors, radius, spacing, typography } from '../src/theme';

export default function AgeConfirmation() {
  const setSnapshot = useTogether((state) => state.setSnapshot);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const continueToOnboarding = async () => {
    if (!confirmed) {
      setError('Confirm that you are 18 or older to continue.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const snapshot = await confirmAdultAge();
      setSnapshot(snapshot);
      router.replace('/choose-companion');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Kivelle could not confirm your age.');
    } finally {
      setBusy(false);
    }
  };

  return <Screen contentStyle={styles.screen}>
    <View style={styles.card}>
      <KivelleLogo height={35} />
      <View style={styles.icon}><ShieldCheck size={26} color={colors.warm} /></View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>BEFORE YOUR STORY BEGINS</Text>
        <Text style={styles.title}>Confirm you’re an adult.</Text>
        <Text style={styles.body}>Kivelle includes fictional romance and adult themes. You must be 18 or older to continue.</Text>
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmed }}
        onPress={() => { setConfirmed((value) => !value); setError(''); }}
        style={[styles.confirmation, confirmed && styles.confirmationActive]}
      >
        <View style={[styles.check, confirmed && styles.checkActive]}>{confirmed ? <Check size={15} color="#fff" /> : null}</View>
        <Text style={styles.confirmationText}>I confirm that I’m 18 or older</Text>
      </Pressable>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <GradientButton label={busy ? 'Confirming…' : 'Continue'} disabled={busy || !confirmed} onPress={() => void continueToOnboarding()} />
      <Text style={styles.note}>This confirmation is saved to your Kivelle account.</Text>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { minHeight: '100%', maxWidth: 540, justifyContent: 'center', paddingHorizontal: 16 },
  card: { gap: spacing.lg, padding: 24, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderBright, backgroundColor: colors.surface },
  icon: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(242,198,125,.1)', borderWidth: 1, borderColor: 'rgba(242,198,125,.25)' },
  copy: { gap: 6 },
  eyebrow: { color: colors.warm, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 32, lineHeight: 38, fontWeight: '600' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  confirmation: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  confirmationActive: { borderColor: 'rgba(216,62,234,.58)', backgroundColor: 'rgba(216,62,234,.09)' },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: colors.borderBright, alignItems: 'center', justifyContent: 'center' },
  checkActive: { backgroundColor: colors.rose, borderColor: colors.rose },
  confirmationText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '900' },
  error: { color: '#FF9BA7', fontSize: 12, lineHeight: 17 },
  note: { color: colors.dimmed, fontSize: 10, textAlign: 'center' },
});
