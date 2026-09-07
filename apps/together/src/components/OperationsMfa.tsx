import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { colors } from '../theme';

export function OperationsMfa({ onVerified }: { onVerified: () => Promise<void> }) {
  const [factorId, setFactorId] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  async function loadFactors() {
    setBusy(true);
    setError('');
    try {
      const result = await supabase.auth.mfa.listFactors();
      if (result.error) throw result.error;
      setFactorId(result.data.totp[0]?.id ?? '');
      setReady(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authenticator settings could not be loaded.');
    } finally { setBusy(false); }
  }
  useEffect(() => { void loadFactors(); }, []);
  async function enroll() {
    setBusy(true);
    setError('');
    try {
      // Supabase removes abandoned, unverified enrollments when enrolling again.
      const result = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Kivelli' });
      if (result.error) throw result.error;
      setFactorId(result.data.id);
      setSecret(result.data.totp.secret);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authenticator setup failed.');
    } finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true);
    setError('');
    try {
      const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (result.error) throw result.error;
      setSecret('');
      setCode('');
      await onVerified();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Verification failed. Try a new code.');
    } finally { setBusy(false); }
  }
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text accessibilityRole="header" style={styles.title}>Protect operations access</Text>
    <Text style={styles.text}>{factorId ? 'Enter the six-digit code from your authenticator app.' : 'Set up an authenticator app to access the private operations dashboard.'}</Text>
    {secret ? <>
      <Text style={styles.text}>In your authenticator, add a time-based account named Kivelli using this setup key. Keep the key private.</Text>
      <Text selectable style={styles.secret}>{secret}</Text>
    </> : null}
    {factorId ? <>
      <TextInput accessibilityLabel="Authenticator code" value={code} onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} style={styles.input} onSubmitEditing={() => { if (!busy && code.length === 6) void verify(); }} />
      <Pressable accessibilityRole="button" disabled={busy || code.length !== 6} onPress={() => void verify()} style={styles.button}><Text style={styles.text}>Verify and continue</Text></Pressable>
    </> : ready ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void enroll()} style={styles.button}><Text style={styles.text}>Set up authenticator</Text></Pressable> : !busy ? <Pressable accessibilityRole="button" onPress={() => void loadFactors()} style={styles.button}><Text style={styles.text}>Retry</Text></Pressable> : null}
    {busy ? <ActivityIndicator color={colors.text} /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.text}>{error}</Text> : null}
    <Pressable accessibilityRole="button" onPress={() => router.replace('/settings')} style={styles.button}><Text style={styles.text}>Back to settings</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: colors.background, padding: 28, gap: 20, justifyContent: 'center', alignItems: 'center' },
  title: { color: colors.text, fontSize: 26, fontWeight: '700', textAlign: 'center' },
  text: { color: colors.text, fontSize: 16, lineHeight: 24, maxWidth: 480, textAlign: 'center' },
  secret: { color: colors.text, fontSize: 18, padding: 16, maxWidth: 480 },
  input: { color: colors.text, borderColor: colors.text, borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 24, textAlign: 'center', width: 240 },
  button: { borderColor: colors.text, borderWidth: 1, borderRadius: 12, padding: 14 },
});
