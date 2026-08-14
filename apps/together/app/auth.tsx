import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { Body, GradientButton, PageTitle, Screen } from '../src/components';
import { colors, radius, spacing } from '../src/theme';
import { useAuth } from '../src/hooks/useAuth';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [canResend, setCanResend] = useState(false);
  const { signIn, resendSignUpConfirmation, requestPasswordReset } = useAuth();

  const submit = async () => {
    setBusy(true); setError(''); setNotice(''); setCanResend(false);
    try { await signIn(email.trim(), password); router.replace('/'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Sign in failed.'); setCanResend((caught as { code?: string })?.code === 'email_not_confirmed'); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    setBusy(true); setError('');
    try { await resendSignUpConfirmation(email.trim()); setNotice('Confirmation email sent. Check your inbox and spam folder.'); setCanResend(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not resend the confirmation.'); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    if (!email.trim()) { setError('Enter your email first.'); return; }
    setBusy(true); setError('');
    try { await requestPasswordReset(email.trim()); setNotice('Password reset email sent.'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not send a password reset email.'); }
    finally { setBusy(false); }
  };

  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen contentStyle={{ minHeight: '100%', maxWidth: 560, justifyContent: 'center' }}><View style={{ gap: spacing.lg }}>
      <Text style={styles.brand}>Together</Text><PageTitle>Welcome back.</PageTitle><Body muted>City Life kept moving. Let’s see what Maya has been up to.</Body>
      <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="Email" placeholderTextColor={colors.muted} style={styles.input} />
      <View style={styles.password}><TextInput value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete="current-password" secureTextEntry={!visible} placeholder="Password" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1, borderWidth: 0 }]} /><Pressable accessibilityLabel={visible ? 'Hide password' : 'Show password'} onPress={() => setVisible(!visible)} style={{ padding: 14 }}>{visible ? <EyeOff color={colors.text} /> : <Eye color={colors.text} />}</Pressable></View>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}{notice ? <Text style={{ color: colors.success }}>{notice}</Text> : null}
      <GradientButton label={busy ? 'Please wait…' : 'Sign in'} disabled={busy || !email || !password} onPress={() => void submit()} />
      {canResend ? <Pressable disabled={busy} onPress={() => void resend()}><Text style={styles.back}>Resend confirmation email</Text></Pressable> : null}
      <Pressable disabled={busy} onPress={() => void reset()}><Text style={styles.secondary}>Forgot password?</Text></Pressable>
      <Pressable onPress={() => router.replace('/onboarding')}><Text style={styles.back}>Create an account</Text></Pressable>
    </View></Screen>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ brand: { fontFamily: 'Georgia', fontSize: 24, color: colors.rose }, input: { minHeight: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, paddingHorizontal: 16, fontSize: 16 }, password: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, back: { textAlign: 'center', color: colors.rose, fontWeight: '700' }, secondary: { textAlign: 'center', color: colors.muted, fontWeight: '700' } });
