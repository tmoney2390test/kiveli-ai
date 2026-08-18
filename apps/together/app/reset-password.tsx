import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { Body, GradientButton, KivelleLogo, PageTitle, Screen } from '../src/components';
import { colors, radius, spacing } from '../src/theme';
import { supabase } from '../src/lib/supabase';
import { useAuth } from '../src/hooks/useAuth';

export default function ResetPassword() {
  const { code } = useLocalSearchParams<{ code?: string }>(); const { session, updatePassword } = useAuth();
  const [ready, setReady] = useState(Boolean(session)); const [password, setPassword] = useState(''); const [visible, setVisible] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (session) { setReady(true); return; } if (code) void supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => { if (exchangeError) setError(exchangeError.message); else setReady(true); }); else setError('This password reset link is incomplete or has expired.'); }, [code, session]);
  const submit = async () => { setBusy(true); setError(''); try { await updatePassword(password); router.replace('/'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Password could not be updated.'); } finally { setBusy(false); } };
  return <Screen contentStyle={styles.content}><View style={{ gap: spacing.lg }}><KivelleLogo height={36} /><PageTitle>Choose a new password.</PageTitle><Body muted>Use at least eight characters.</Body><View style={styles.password}><TextInput value={password} onChangeText={setPassword} editable={ready} autoComplete="new-password" secureTextEntry={!visible} placeholder="New password" placeholderTextColor={colors.muted} style={styles.input} /><Pressable accessibilityLabel={visible ? 'Hide password' : 'Show password'} onPress={() => setVisible(!visible)} style={styles.eye}>{visible ? <EyeOff color={colors.text} /> : <Eye color={colors.text} />}</Pressable></View>{error ? <Text style={styles.error}>{error}</Text> : null}<GradientButton label={busy ? 'Updating…' : 'Update password'} disabled={!ready || busy || password.length < 8} onPress={() => void submit()} /><Pressable onPress={() => router.replace('/auth')}><Text style={styles.back}>Back to sign in</Text></Pressable></View></Screen>;
}
const styles = StyleSheet.create({ content: { minHeight: '100%', maxWidth: 560, justifyContent: 'center' }, password: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, input: { flex: 1, minHeight: 54, color: colors.text, paddingHorizontal: 16, fontSize: 16 }, eye: { padding: 14 }, error: { color: colors.danger }, back: { textAlign: 'center', color: colors.rose, fontWeight: '700' } });
