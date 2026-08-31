import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Check, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from 'lucide-react-native';
import { GradientButton, PageTitle } from '../src/components';
import { colors, radius, spacing, typography } from '../src/theme';
import { useAuth } from '../src/hooks/useAuth';
import { authProviderState } from '../src/lib/authProviders';
import { passwordCheck, validAccountEmail } from '../src/lib/accountSecurity';

type Notice = { kind: 'success' | 'error'; message: string } | null;

export default function Account() {
  const { session, reauthenticate, updateEmail, updatePassword, resendPendingEmailChange, signOutOthers } = useAuth();
  const provider = authProviderState(session?.user);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState<'email' | 'password' | 'sessions' | 'resend' | null>(null);
  const [emailNotice, setEmailNotice] = useState<Notice>(null);
  const [passwordNotice, setPasswordNotice] = useState<Notice>(null);
  const strength = useMemo(() => passwordCheck(newPassword), [newPassword]);
  const emailReady = validAccountEmail(newEmail) && (!provider.hasPassword || emailPassword.length > 0);
  const passwordReady = strength.valid && newPassword === confirmPassword && (!provider.hasPassword || currentPassword.length > 0);

  const changeEmail = async () => {
    if (!emailReady || busy) return;
    setBusy('email'); setEmailNotice(null);
    try {
      if (provider.hasPassword) await reauthenticate(emailPassword);
      await updateEmail(newEmail.trim().toLowerCase());
      setNewEmail(''); setEmailPassword('');
      setEmailNotice({ kind: 'success', message: 'Confirmation links were sent. Follow the email instructions to finish the change.' });
    } catch (error) {
      setEmailNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Your email could not be updated.' });
    } finally { setBusy(null); }
  };

  const changePassword = async () => {
    if (!passwordReady || busy) return;
    setBusy('password'); setPasswordNotice(null);
    try {
      if (provider.hasPassword) await reauthenticate(currentPassword);
      await updatePassword(newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setPasswordNotice({ kind: 'success', message: provider.hasPassword ? 'Password updated. Other sessions remain signed in unless you sign them out below.' : 'Password added. You can now sign in with email and password.' });
    } catch (error) {
      setPasswordNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Your password could not be updated.' });
    } finally { setBusy(null); }
  };

  const resend = async () => {
    if (busy) return;
    setBusy('resend'); setEmailNotice(null);
    try { await resendPendingEmailChange(); setEmailNotice({ kind: 'success', message: 'A new confirmation link was sent to your pending email address.' }); }
    catch (error) { setEmailNotice({ kind: 'error', message: error instanceof Error ? error.message : 'The confirmation email could not be sent.' }); }
    finally { setBusy(null); }
  };

  const otherSessions = () => Alert.alert('Sign out other sessions?', 'This device will stay signed in. Every other browser and mobile session will need to sign in again.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out other sessions', style: 'destructive', onPress: () => { setBusy('sessions'); void signOutOthers().then(() => Alert.alert('Other sessions signed out', 'This device is still signed in.')).catch((error) => Alert.alert('Could not sign out other sessions', error instanceof Error ? error.message : 'Please try again.')).finally(() => setBusy(null)); } },
  ]);

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Back to settings" hitSlop={10} onPress={() => router.canGoBack() ? router.back() : router.replace('/settings?section=account')} style={styles.back}><ArrowLeft color={colors.text} /></Pressable><PageTitle>Sign-in & security</PageTitle></View>
    <Text style={styles.lead}>Change how you sign in and secure access to your Kivelle account. Your profile is managed separately in Settings.</Text>

    <View style={styles.summary}>
      <View style={styles.summaryIcon}><KeyRound color={colors.violet} /></View><View style={{ flex: 1 }}><Text style={styles.kicker}>{provider.label.toUpperCase()}</Text><Text style={styles.email}>{session?.user.email ?? 'Kivelle account'}</Text><View style={styles.verified}><Check size={13} color={provider.verifiedEmail ? colors.success : colors.warm} /><Text style={{ color: provider.verifiedEmail ? colors.success : colors.warm, fontSize: 12, fontWeight: '800' }}>{provider.verifiedEmail ? 'Verified email' : 'Email verification pending'}</Text></View>{provider.pendingEmail ? <Text style={styles.pending}>Pending change: {provider.pendingEmail}</Text> : null}</View>
    </View>

    <Section title="Email address" body="For password accounts, confirm your current password before changing the sign-in email." />
    <View style={styles.card}>
      <Field label="New email address"><TextInput accessibilityLabel="New email address" value={newEmail} onChangeText={(value) => { setNewEmail(value); setEmailNotice(null); }} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" style={styles.input} placeholder="name@example.com" placeholderTextColor={colors.muted} /></Field>
      {provider.hasPassword ? <Field label="Current password"><View style={styles.passwordField}><TextInput accessibilityLabel="Current password for email change" value={emailPassword} onChangeText={setEmailPassword} secureTextEntry={!showEmailPassword} autoCapitalize="none" textContentType="password" style={styles.passwordInput} placeholder="Confirm your password" placeholderTextColor={colors.muted} /><Pressable accessibilityRole="button" accessibilityLabel={showEmailPassword ? 'Hide current password' : 'Show current password'} hitSlop={8} onPress={() => setShowEmailPassword((value) => !value)}>{showEmailPassword ? <EyeOff size={19} color={colors.muted} /> : <Eye size={19} color={colors.muted} />}</Pressable></View></Field> : null}
      {emailNotice ? <NoticeView notice={emailNotice} /> : null}
      <GradientButton label={busy === 'email' ? 'Updating…' : 'Change email'} disabled={!emailReady || busy !== null} onPress={() => void changeEmail()} />
      {provider.pendingEmail ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy !== null }} disabled={busy !== null} onPress={() => void resend()} style={styles.textButton}><Mail size={17} color={colors.rose} /><Text style={styles.textButtonText}>{busy === 'resend' ? 'Sending…' : 'Resend email-change confirmation'}</Text></Pressable> : null}
    </View>

    <Section title={provider.hasPassword ? 'Password' : 'Add a password'} body={provider.hasPassword ? 'Use a unique password you do not reuse on another service.' : 'Add password sign-in while keeping your connected provider available.'} />
    <View style={styles.card}>
      {provider.hasPassword ? <Field label="Current password"><PasswordInput label="Current password" value={currentPassword} onChange={setCurrentPassword} show={showPasswords} placeholder="Current password" /></Field> : null}
      <Field label="New password"><PasswordInput label="New password" value={newPassword} onChange={(value) => { setNewPassword(value); setPasswordNotice(null); }} show={showPasswords} placeholder="10+ characters" /></Field>
      <Field label="Confirm new password"><PasswordInput label="Confirm new password" value={confirmPassword} onChange={(value) => { setConfirmPassword(value); setPasswordNotice(null); }} show={showPasswords} placeholder="Enter it again" /></Field>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: showPasswords }} onPress={() => setShowPasswords((value) => !value)} style={styles.showRow}>{showPasswords ? <EyeOff size={18} color={colors.violet} /> : <Eye size={18} color={colors.violet} />}<Text style={styles.showText}>{showPasswords ? 'Hide passwords' : 'Show passwords'}</Text></Pressable>
      {newPassword ? <View accessibilityLabel={`Password strength: ${strength.label}`} style={styles.strength}><View style={styles.strengthHeader}><Text style={styles.strengthTitle}>Password strength</Text><Text style={[styles.strengthLabel, strength.valid && { color: colors.success }]}>{strength.label}</Text></View><View style={styles.strengthTrack}>{[0,1,2,3].map((index) => <View key={index} style={[styles.strengthBar, index < strength.score && { backgroundColor: strength.valid ? colors.success : colors.warm }]} />)}</View>{strength.requirements.length ? <Text style={styles.requirements}>Still needed: {strength.requirements.join(', ')}.</Text> : null}{confirmPassword && newPassword !== confirmPassword ? <Text accessibilityRole="alert" style={styles.inlineError}>The new passwords do not match.</Text> : null}</View> : null}
      {passwordNotice ? <NoticeView notice={passwordNotice} /> : null}
      <GradientButton label={busy === 'password' ? 'Updating…' : provider.hasPassword ? 'Update password' : 'Add password'} disabled={!passwordReady || busy !== null} onPress={() => void changePassword()} />
    </View>

    <Section title="Sessions" body="Use this if you signed in on a device you no longer control." />
    <Pressable accessibilityRole="button" accessibilityLabel="Sign out other sessions" accessibilityState={{ disabled: busy !== null }} disabled={busy !== null} onPress={otherSessions} style={styles.sessionRow}><ShieldCheck color={colors.violet} /><View style={{ flex: 1 }}><Text style={styles.sessionTitle}>{busy === 'sessions' ? 'Signing out…' : 'Sign out other sessions'}</Text><Text style={styles.sessionBody}>Keep this device signed in and revoke every other active session.</Text></View></Pressable>
  </ScrollView>;
}

function Section({ title, body }: { title: string; body: string }) { return <View style={styles.section}><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionBody}>{body}</Text></View>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}</View>; }
function PasswordInput({ label, value, onChange, show, placeholder }: { label: string; value: string; onChange: (value: string) => void; show: boolean; placeholder: string }) { return <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false} textContentType="password" style={styles.input} placeholder={placeholder} placeholderTextColor={colors.muted} />; }
function NoticeView({ notice }: { notice: Exclude<Notice, null> }) { return <View accessibilityRole="alert" style={[styles.notice, notice.kind === 'error' && styles.noticeError]}><Text style={[styles.noticeText, notice.kind === 'error' && styles.noticeErrorText]}>{notice.message}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: spacing.lg, paddingBottom: 90, gap: 16 }, header: { flexDirection: 'row', gap: 12, alignItems: 'center' }, back: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, lead: { color: colors.muted, lineHeight: 21, marginBottom: 2 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, summaryIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(154,104,255,.1)' }, kicker: { color: colors.violet, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 }, email: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 3 }, verified: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }, pending: { color: colors.warm, fontSize: 11, marginTop: 5 },
  section: { gap: 5, marginTop: 8 }, sectionTitle: { color: colors.text, fontFamily: typography.display, fontSize: 25 }, sectionBody: { color: colors.muted, fontSize: 12, lineHeight: 18 }, card: { gap: 15, padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, field: { gap: 7 }, label: { color: colors.text, fontSize: 13, fontWeight: '800' }, input: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated, color: colors.text, paddingHorizontal: 14, paddingVertical: 12 }, passwordField: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated, paddingRight: 14 }, passwordInput: { flex: 1, minHeight: 50, color: colors.text, paddingHorizontal: 14, paddingVertical: 12 },
  textButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, textButtonText: { color: colors.rose, fontWeight: '800', fontSize: 13 }, showRow: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 }, showText: { color: colors.violet, fontSize: 13, fontWeight: '800' }, strength: { gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.025)' }, strengthHeader: { flexDirection: 'row', justifyContent: 'space-between' }, strengthTitle: { color: colors.muted, fontSize: 12, fontWeight: '800' }, strengthLabel: { color: colors.warm, fontSize: 12, fontWeight: '900' }, strengthTrack: { flexDirection: 'row', gap: 5 }, strengthBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border }, requirements: { color: colors.muted, fontSize: 11, lineHeight: 17 }, inlineError: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  notice: { padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(85,194,150,.09)', borderWidth: 1, borderColor: 'rgba(85,194,150,.24)' }, noticeError: { backgroundColor: 'rgba(255,107,121,.07)', borderColor: 'rgba(255,107,121,.28)' }, noticeText: { color: colors.success, fontSize: 12, lineHeight: 18, fontWeight: '700' }, noticeErrorText: { color: colors.danger }, sessionRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, sessionTitle: { color: colors.text, fontWeight: '900' }, sessionBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
});
