import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { router } from 'expo-router';
import { GradientButton, KivelleLogo, Screen } from '../src/components';
import { confirmAdultAge } from '../src/lib/api';
import { useTogether } from '../src/store/useTogether';
import { colors, radius, spacing, typography } from '../src/theme';

export default function AgeConfirmation() {
  const setSnapshot = useTogether((state) => state.setSnapshot);
  const [dateOfBirth,setDateOfBirth]=useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const continueToOnboarding = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      setError('Enter your birthdate as YYYY-MM-DD.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const snapshot = await confirmAdultAge(dateOfBirth);
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
        <Text style={styles.title}>Enter your birthdate.</Text>
        <Text style={styles.body}>Kivelle is for adults. Your birthdate is kept private and used to confirm eligibility.</Text>
      </View>
      <TextInput accessibilityLabel="Birthdate" value={dateOfBirth} onChangeText={(value)=>{setDateOfBirth(value);setError('');}} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" placeholder="YYYY-MM-DD" placeholderTextColor={colors.dimmed} maxLength={10} style={styles.input}/>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <GradientButton label={busy ? 'Checking…' : 'Continue'} disabled={busy || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)} onPress={() => void continueToOnboarding()} />
      <Text style={styles.note}>You must be 18 or older to create a Kivelle account.</Text>
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
  input:{minHeight:56,paddingHorizontal:15,borderRadius:radius.md,borderWidth:1,borderColor:colors.borderBright,backgroundColor:colors.background,color:colors.text,fontSize:16},
  error: { color: '#FF9BA7', fontSize: 12, lineHeight: 17 },
  note: { color: colors.dimmed, fontSize: 10, textAlign: 'center' },
});
