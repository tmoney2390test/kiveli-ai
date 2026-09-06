import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, KeyRound, Mail, ShieldCheck } from 'lucide-react-native';
import { GradientButton, PageTitle } from '../src/components';
import { colors, radius, spacing, typography } from '../src/theme';
import { useAuth } from '../src/hooks/useAuth';
import { authProviderState } from '../src/lib/authProviders';
import { validAccountEmail } from '../src/lib/accountSecurity';
import { manageAccount } from '../src/lib/api';
import { validBirthdateEntry } from '../src/lib/pendingBirthdate';
import { BirthdateField } from '../src/components/BirthdateField';
import { useTogether } from '../src/store/useTogether';

type Notice = { kind: 'success' | 'error'; message: string } | null;
type BirthdateStatus = { dateOfBirth: string | null; canCorrect: boolean; correctedAt: string | null };
type TextPreference = 'standard' | 'mature' | 'explicit';
type PrivacyChoices = { aiDataConsent: { decision: 'accepted' | 'declined' | 'withdrawn' | 'unknown'; recordedAt: string | null }; privateTextPreference: TextPreference | null };

export default function Account() {
  const params = useLocalSearchParams<{ setup?: string }>();
  const setupPrivacy = params.setup === 'privacy';
  const refresh = useTogether((state) => state.refresh);
  const { session, updateEmail, resendPendingEmailChange, signOutOthers } = useAuth();
  const provider = authProviderState(session?.user);
  const [newEmail, setNewEmail] = useState('');
  const [busy, setBusy] = useState<'privacy' | 'birthdate' | 'email' | 'sessions' | 'resend' | null>(null);
  const [birthdateStatus,setBirthdateStatus]=useState<BirthdateStatus|null>(null);
  const [birthdate,setBirthdate]=useState('');
  const [birthdateLoading,setBirthdateLoading]=useState(true);
  const [birthdateNotice,setBirthdateNotice]=useState<Notice>(null);
  const [emailNotice, setEmailNotice] = useState<Notice>(null);
  const [privacyChoices, setPrivacyChoices] = useState<PrivacyChoices | null>(null);
  const [privacyPreference, setPrivacyPreference] = useState<TextPreference>('explicit');
  const [privacyNotice, setPrivacyNotice] = useState<Notice>(null);
  const [privacyLoading, setPrivacyLoading] = useState(true);
  const emailReady = validAccountEmail(newEmail);

  const loadPrivacyChoices = useCallback(async () => {
    setPrivacyLoading(true); setPrivacyNotice(null);
    try {
      const status = await manageAccount<PrivacyChoices>({ action: 'privacy_choices_status' });
      setPrivacyChoices(status);
      setPrivacyPreference(status.privateTextPreference ?? 'explicit');
    } catch (error) {
      setPrivacyNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Your AI choices could not be loaded.' });
    } finally { setPrivacyLoading(false); }
  }, []);

  const loadBirthdate=useCallback(async()=>{
    setBirthdateLoading(true);setBirthdateNotice(null);
    try{const status=await manageAccount<BirthdateStatus>({action:'birthdate_status'});setBirthdateStatus(status);setBirthdate(status.dateOfBirth??'');}
    catch(error){setBirthdateStatus(null);setBirthdateNotice({kind:'error',message:error instanceof Error?error.message:'Your birthdate could not be loaded.'});}
    finally{setBirthdateLoading(false);}
  },[]);

  useEffect(()=>{void loadBirthdate();void loadPrivacyChoices();},[loadBirthdate,loadPrivacyChoices]);

  const savePrivacyChoices = async () => {
    if (busy || privacyLoading) return;
    setBusy('privacy'); setPrivacyNotice(null);
    try {
      const updated = await manageAccount<PrivacyChoices>({ action: 'privacy_choices', aiDataSharing: setupPrivacy ? true : privacyChoices?.aiDataConsent.decision === 'accepted', privateTextPreference: privacyPreference, source: setupPrivacy ? 'onboarding' : 'account' });
      setPrivacyChoices(updated);
      await refresh({ force: true });
      if (setupPrivacy) { router.replace('/choose-companion' as never); return; }
      setPrivacyNotice({ kind: 'success', message: 'Your AI and conversation choices were saved.' });
    } catch (error) {
      setPrivacyNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Your AI choices could not be saved.' });
    } finally { setBusy(null); }
  };

  const changeBirthdate=async()=>{
    if(!birthdateStatus?.canCorrect||!validBirthdateEntry(birthdate)||birthdate===birthdateStatus.dateOfBirth||busy)return;
    setBusy('birthdate');setBirthdateNotice(null);
    try{
      const status=await manageAccount<BirthdateStatus>({action:'birthdate_update',dateOfBirth:birthdate});
      setBirthdateStatus(status);setBirthdate(status.dateOfBirth??'');
      setBirthdateNotice({kind:'success',message:'Your birthdate was updated.'});
    }catch(error){setBirthdateNotice({kind:'error',message:error instanceof Error?error.message:'Your birthdate could not be updated.'});}
    finally{setBusy(null);}
  };

  const changeEmail = async () => {
    if (!emailReady || busy) return;
    setBusy('email'); setEmailNotice(null);
    try {
      await updateEmail(newEmail.trim().toLowerCase());
      setNewEmail('');
      setEmailNotice({ kind: 'success', message: 'Confirmation links were sent. Follow the email instructions to finish the change.' });
    } catch (error) {
      setEmailNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Your email could not be updated.' });
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
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Back to settings" hitSlop={10} onPress={() => router.canGoBack() ? router.back() : router.replace('/settings?section=account')} style={styles.back}><ArrowLeft color={colors.text} /></Pressable><PageTitle>Account & security</PageTitle></View>
    <Text style={styles.lead}>Manage your verified email, birthdate, conversation setting, and active sessions.</Text>

    <View style={styles.summary}>
      <View style={styles.summaryIcon}><KeyRound color={colors.violet} /></View><View style={{ flex: 1 }}><Text style={styles.kicker}>{provider.label.toUpperCase()}</Text><Text style={styles.email}>{session?.user.email ?? 'Kivelle account'}</Text><View style={styles.verified}><Check size={13} color={provider.verifiedEmail ? colors.success : colors.warm} /><Text style={{ color: provider.verifiedEmail ? colors.success : colors.warm, fontSize: 12, fontWeight: '800' }}>{provider.verifiedEmail ? 'Verified email' : 'Email verification pending'}</Text></View>{provider.pendingEmail ? <Text style={styles.pending}>Pending change: {provider.pendingEmail}</Text> : null}</View>
    </View>

    <Section title="Conversation Spiciness" body={setupPrivacy ? 'Choose the upper boundary for private text chats. Explicit is selected by default; nothing is saved until you continue.' : 'Choose the upper boundary for your private text chats.'} />
    <View style={styles.card}>
      {privacyLoading ? <Text style={styles.loadingText}>Loading conversation settings…</Text> : <>
        <View accessibilityRole="radiogroup" accessibilityLabel="Conversation Spiciness" style={styles.choiceRow}>
          {(['standard', 'mature', 'explicit'] as const).map((choice) => <Pressable key={choice} accessibilityRole="radio" accessibilityState={{ checked: privacyPreference === choice, disabled: busy !== null }} disabled={busy !== null} onPress={() => { setPrivacyPreference(choice); setPrivacyNotice(null); }} style={[styles.choiceButton, privacyPreference === choice && styles.choiceButtonSelected]}><Text style={[styles.choiceText, privacyPreference === choice && styles.choiceTextSelected]}>{choice.charAt(0).toUpperCase() + choice.slice(1)}</Text></Pressable>)}
        </View>
        {setupPrivacy ? <Text style={styles.consentCopy}>By continuing, you allow Kivelle to send the conversation context, memories, photos, or audio needed for features you choose to use to its disclosed AI providers. You can withdraw permission later in Privacy.</Text> : null}
        {privacyNotice ? <NoticeView notice={privacyNotice} /> : null}
        <GradientButton label={busy === 'privacy' ? 'Saving…' : setupPrivacy ? 'Allow AI processing & continue' : 'Save conversation setting'} disabled={busy !== null || (!setupPrivacy && privacyChoices?.privateTextPreference === privacyPreference)} onPress={() => void savePrivacyChoices()} />
      </>}
    </View>

    <Section title="Birthdate" body="Used privately to confirm that you are an adult. You can correct a saved date once." />
    <View style={styles.card}>
      {birthdateLoading?<Text style={styles.loadingText}>Loading birthdate…</Text>:birthdateStatus?<>
        <Field label="Your birthdate"><BirthdateField disabled={busy!==null||!birthdateStatus.canCorrect} hasError={birthdateNotice?.kind==='error'} value={birthdate} onChange={(value)=>{setBirthdate(value);setBirthdateNotice(null);}}/></Field>
        <Text style={styles.fieldHint}>{birthdateStatus.canCorrect?'Choose carefully. After this correction, support will need to help with another change.':'To protect age eligibility, further changes are handled by support.'}</Text>
        {birthdateNotice?<NoticeView notice={birthdateNotice}/>:null}
        {birthdateStatus.canCorrect?<GradientButton label={busy==='birthdate'?'Updating…':'Update birthdate'} disabled={busy!==null||!validBirthdateEntry(birthdate)||birthdate===birthdateStatus.dateOfBirth} onPress={()=>void changeBirthdate()}/>:<Pressable accessibilityRole="button" onPress={()=>router.push('/support' as never)} style={styles.textButton}><Text style={styles.textButtonText}>Contact support</Text></Pressable>}
      </>:<>
        {birthdateNotice?<NoticeView notice={birthdateNotice}/>:null}
        <Pressable accessibilityRole="button" onPress={()=>void loadBirthdate()} style={styles.textButton}><Text style={styles.textButtonText}>Try again</Text></Pressable>
      </>}
    </View>

    <Section title="Email address" body="Kivelle sends a private code to this address when you sign in." />
    <View style={styles.card}>
      <Field label="New email address"><TextInput accessibilityLabel="New email address" value={newEmail} onChangeText={(value) => { setNewEmail(value); setEmailNotice(null); }} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" style={styles.input} placeholder="name@example.com" placeholderTextColor={colors.muted} /></Field>
      {emailNotice ? <NoticeView notice={emailNotice} /> : null}
      <GradientButton label={busy === 'email' ? 'Updating…' : 'Change email'} disabled={!emailReady || busy !== null} onPress={() => void changeEmail()} />
      {provider.pendingEmail ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy !== null }} disabled={busy !== null} onPress={() => void resend()} style={styles.textButton}><Mail size={17} color={colors.rose} /><Text style={styles.textButtonText}>{busy === 'resend' ? 'Sending…' : 'Resend email-change confirmation'}</Text></Pressable> : null}
    </View>

    <Section title="Sessions" body="Use this if you signed in on a device you no longer control." />
    <Pressable accessibilityRole="button" accessibilityLabel="Sign out other sessions" accessibilityState={{ disabled: busy !== null }} disabled={busy !== null} onPress={otherSessions} style={styles.sessionRow}><ShieldCheck color={colors.violet} /><View style={{ flex: 1 }}><Text style={styles.sessionTitle}>{busy === 'sessions' ? 'Signing out…' : 'Sign out other sessions'}</Text><Text style={styles.sessionBody}>Keep this device signed in and revoke every other active session.</Text></View></Pressable>
  </ScrollView>;
}

function Section({ title, body }: { title: string; body: string }) { return <View style={styles.section}><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionBody}>{body}</Text></View>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}</View>; }
function NoticeView({ notice }: { notice: Exclude<Notice, null> }) { return <View accessibilityRole="alert" style={[styles.notice, notice.kind === 'error' && styles.noticeError]}><Text style={[styles.noticeText, notice.kind === 'error' && styles.noticeErrorText]}>{notice.message}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: spacing.lg, paddingBottom: 90, gap: 16 }, header: { flexDirection: 'row', gap: 12, alignItems: 'center' }, back: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, lead: { color: colors.muted, lineHeight: 21, marginBottom: 2 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, summaryIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(154,104,255,.1)' }, kicker: { color: colors.violet, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 }, email: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 3 }, verified: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }, pending: { color: colors.warm, fontSize: 11, marginTop: 5 },
  section: { gap: 5, marginTop: 8 }, sectionTitle: { color: colors.text, fontFamily: typography.display, fontSize: 25 }, sectionBody: { color: colors.muted, fontSize: 12, lineHeight: 18 }, card: { gap: 15, padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, field: { gap: 7 }, label: { color: colors.text, fontSize: 13, fontWeight: '800' }, input: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated, color: colors.text, paddingHorizontal: 14, paddingVertical: 12 }, passwordField: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.elevated, paddingRight: 14 }, passwordInput: { flex: 1, minHeight: 50, color: colors.text, paddingHorizontal: 14, paddingVertical: 12 },
  loadingText:{color:colors.muted,fontSize:13},fieldHint:{color:colors.muted,fontSize:11,lineHeight:17},choiceRow:{flexDirection:'row',gap:8},choiceButton:{flex:1,minHeight:46,alignItems:'center',justifyContent:'center',paddingHorizontal:10,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.elevated},choiceButtonSelected:{borderColor:colors.rose,backgroundColor:'rgba(229,74,163,.14)'},choiceText:{color:colors.muted,fontSize:12,fontWeight:'800'},choiceTextSelected:{color:colors.text},consentCopy:{color:colors.muted,fontSize:11,lineHeight:17},
  textButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, textButtonText: { color: colors.rose, fontWeight: '800', fontSize: 13 }, showRow: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 }, showText: { color: colors.violet, fontSize: 13, fontWeight: '800' }, strength: { gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.025)' }, strengthHeader: { flexDirection: 'row', justifyContent: 'space-between' }, strengthTitle: { color: colors.muted, fontSize: 12, fontWeight: '800' }, strengthLabel: { color: colors.warm, fontSize: 12, fontWeight: '900' }, strengthTrack: { flexDirection: 'row', gap: 5 }, strengthBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border }, requirements: { color: colors.muted, fontSize: 11, lineHeight: 17 }, inlineError: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  notice: { padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(85,194,150,.09)', borderWidth: 1, borderColor: 'rgba(85,194,150,.24)' }, noticeError: { backgroundColor: 'rgba(255,107,121,.07)', borderColor: 'rgba(255,107,121,.28)' }, noticeText: { color: colors.success, fontSize: 12, lineHeight: 18, fontWeight: '700' }, noticeErrorText: { color: colors.danger }, sessionRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, sessionTitle: { color: colors.text, fontWeight: '900' }, sessionBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
});
