import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Eye, EyeOff, Sparkles } from 'lucide-react-native';
import { GradientButton, Screen } from '../src/components';
import { cityLifeAsset } from '../src/assets';
import { colors, radius, typography } from '../src/theme';
import { useAuth } from '../src/hooks/useAuth';
import { loadSnapshot } from '../src/lib/api';
import { useTogether } from '../src/store/useTogether';

export default function Auth() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [creating, setCreating] = useState(params.mode !== 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { signIn, signUp, requestPasswordReset } = useAuth();
  const setSnapshot = useTogether((state) => state.setSnapshot);

  const switchMode = (nextCreating: boolean) => {
    setCreating(nextCreating);
    setError('');
    setNotice('');
  };

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Your password needs at least 8 characters.');
      return;
    }
    if (creating && !adult) {
      setError('Confirm that you are 18 or older to continue.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (creating) {
        await signUp(normalizedEmail, password);
        const existing = await loadSnapshot();
        setSnapshot(existing);
        router.replace(existing.profile ? '/home' : '/choose-companion?adultConfirmed=1');
      } else {
        await signIn(normalizedEmail, password);
        router.replace('/');
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : creating ? 'Account creation failed.' : 'Sign in failed.';
      if (creating && (caught as { code?: string })?.code === 'CONFLICT') {
        setCreating(false);
        setError('That email already has an account. Sign in with your password.');
      } else {
        setError(message === 'Failed to fetch' ? 'Kivelle could not reach the server. Check your connection and try again.' : message);
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!email.trim()) {
      setError('Enter your email first.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setNotice('Password reset email sent.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send a password reset email.');
    } finally {
      setBusy(false);
    }
  };

  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen contentStyle={styles.screen}>
      <View style={[styles.shell, wide ? styles.shellWide : styles.shellCompact]}>
        <View style={[styles.hero, wide ? styles.heroWide : styles.heroCompact]}>
          <Image source={cityLifeAsset} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" />
          <View style={styles.heroShade}>
            <View style={styles.heroTop}>
              <Text style={styles.wordmark}>Kivelle.AI</Text>
              <View style={styles.fictionalPill}><Text style={styles.fictionalText}>FICTIONAL AI</Text></View>
            </View>
            <View>
              <View style={styles.liveRow}><View style={styles.liveDot} /><Text style={styles.liveText}>CITY LIFE · NOW</Text></View>
              <Text style={styles.heroTitle}>Juniper City is awake.</Text>
              <Text style={styles.heroBody}>Choose who you want to meet first.</Text>
            </View>
          </View>
        </View>

        <View style={[styles.form, wide && styles.formWide]}>
          <View style={styles.intro}>
            <Text style={styles.title}>{creating ? 'Find your person.' : 'Welcome back.'}</Text>
            <Text style={styles.subtitle}>{creating ? 'Create your account, choose a companion, and start talking.' : 'Your conversations and shared history are waiting.'}</Text>
          </View>

          <View style={styles.tabs}>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: !creating }} onPress={() => switchMode(false)} style={[styles.tab, !creating && styles.tabActive]}>
              <Text style={[styles.tabText, !creating && styles.tabTextActive]}>Sign in</Text>
            </Pressable>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: creating }} onPress={() => switchMode(true)} style={[styles.tab, creating && styles.tabActive]}>
              <Text style={[styles.tabText, creating && styles.tabTextActive]}>Join free</Text>
            </Pressable>
          </View>

          <TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" placeholder="Email address" placeholderTextColor={colors.dimmed} style={styles.input} />
          <View style={styles.password}>
            <TextInput accessibilityLabel={creating ? 'Create a password' : 'Password'} value={password} onChangeText={setPassword} autoCapitalize="none" autoCorrect={false} autoComplete={creating ? 'new-password' : 'current-password'} secureTextEntry={!visible} placeholder={creating ? 'Create a password' : 'Password'} placeholderTextColor={colors.dimmed} style={styles.passwordInput} />
            <Pressable accessibilityLabel={visible ? 'Hide password' : 'Show password'} onPress={() => setVisible(!visible)} style={styles.eye}>{visible ? <EyeOff size={20} color={colors.text} /> : <Eye size={20} color={colors.text} />}</Pressable>
          </View>

          {creating ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: adult }} onPress={() => setAdult(!adult)} style={[styles.age, adult && styles.ageActive]}>
            <View style={[styles.check, adult && styles.checkActive]}>{adult ? <Check size={14} color="#fff" /> : null}</View>
            <View style={styles.ageCopy}>
              <Text style={styles.ageTitle}>I’m 18 or older</Text>
              <Text style={styles.ageBody}>Adult romantic themes · fictional AI characters</Text>
            </View>
          </Pressable> : null}

          {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text></View> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <GradientButton label={busy ? 'Connecting…' : creating ? 'Choose your person' : 'Sign in'} disabled={busy} onPress={() => void submit()} />

          {!creating ? <Pressable disabled={busy} onPress={() => void reset()}><Text style={styles.secondary}>Forgot password?</Text></Pressable> : <View style={styles.instant}><Sparkles size={14} color={colors.violet} /><Text style={styles.instantText}>No setup tour. Personalize later.</Text></View>}
        </View>
      </View>
    </Screen>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  screen: { minHeight: '100%', maxWidth: 920, justifyContent: 'center', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24 },
  shell: { width: '100%', overflow: 'hidden', borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderBright, backgroundColor: colors.surface },
  shellCompact: { flexDirection: 'column' },
  shellWide: { flexDirection: 'row', minHeight: 620 },
  hero: { position: 'relative', backgroundColor: colors.elevated },
  heroCompact: { height: 186, width: '100%' },
  heroWide: { flex: 1.08, minWidth: 0 },
  heroShade: { flex: 1, justifyContent: 'space-between', padding: 18, backgroundColor: 'rgba(7,7,13,.34)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { fontFamily: typography.display, fontSize: 21, fontWeight: '700', color: '#fff' },
  fictionalPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(8,8,14,.66)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)' },
  fictionalText: { color: '#F5DDE6', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  liveRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  liveText: { color: '#F9D9E4', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { fontFamily: typography.display, fontSize: 29, fontWeight: '600', color: '#fff', textShadowColor: '#000', textShadowRadius: 12 },
  heroBody: { color: '#F5E9EE', fontSize: 13, marginTop: 3, textShadowColor: '#000', textShadowRadius: 8 },
  form: { gap: 11, padding: 18 },
  formWide: { flex: 0.92, justifyContent: 'center', padding: 34 },
  intro: { gap: 3, marginBottom: 2 },
  title: { fontFamily: typography.display, fontSize: 31, fontWeight: '600', color: colors.text },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: radius.pill, backgroundColor: colors.background },
  tab: { flex: 1, minHeight: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border },
  tabText: { color: colors.muted, fontWeight: '800', fontSize: 13 },
  tabTextActive: { color: colors.text },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, paddingHorizontal: 15, fontSize: 16 },
  password: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  passwordInput: { flex: 1, minHeight: 48, color: colors.text, paddingHorizontal: 15, fontSize: 16, outlineStyle: 'none' } as never,
  eye: { padding: 13 },
  age: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  ageActive: { borderColor: 'rgba(232,93,140,.55)', backgroundColor: 'rgba(232,93,140,.09)' },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: colors.borderBright, alignItems: 'center', justifyContent: 'center' },
  checkActive: { backgroundColor: colors.rose, borderColor: colors.rose },
  ageCopy: { flex: 1 },
  ageTitle: { color: colors.text, fontWeight: '900', fontSize: 12 },
  ageBody: { color: colors.muted, fontSize: 10, marginTop: 2 },
  errorBox: { borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: 'rgba(255,113,129,.1)', borderWidth: 1, borderColor: 'rgba(255,113,129,.28)' },
  error: { color: '#FF9BA7', fontSize: 12, lineHeight: 17 },
  notice: { color: colors.success, fontSize: 12, textAlign: 'center' },
  secondary: { textAlign: 'center', color: colors.muted, fontWeight: '700', fontSize: 12 },
  instant: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  instantText: { color: colors.muted, fontSize: 11 },
});
