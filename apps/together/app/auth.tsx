import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { CircleCheck, Eye, EyeOff, Sparkles } from 'lucide-react-native';
import { GradientButton, KivelleLogo, Screen } from '../src/components';
import { GoogleMark } from '../src/components/GoogleMark';
import { cityLifeAsset } from '../src/assets';
import { colors, radius, typography } from '../src/theme';
import { useAuth } from '../src/hooks/useAuth';
import { useTogether } from '../src/store/useTogether';
import { safeAppReturnPath } from '../src/lib/sessionRouting';
import { resolvePostAuthDestination } from '../src/lib/authRouting';
import type { SocialAuthProvider } from '../src/lib/socialAuth';
import { useWebHydrated } from '../src/hooks/useWebHydrated';
import { confirmAdultAge } from '../src/lib/api';
import { rememberPendingBirthdate,validBirthdateEntry } from '../src/lib/pendingBirthdate';

export default function Auth() {
  const params = useLocalSearchParams<{ mode?: string; next?: string }>();
  const { width } = useWindowDimensions();
  const webHydrated = useWebHydrated();
  const wide = webHydrated && width >= 760;
  const [creating, setCreating] = useState(params.mode !== 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth,setDateOfBirth]=useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [socialBusy,setSocialBusy]=useState<SocialAuthProvider|null>(null);
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [openingError, setOpeningError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [nativeAppleAvailable,setNativeAppleAvailable]=useState(Platform.OS!=='ios');
  const { signIn, signInWithSocial, signUp, resendSignUpConfirmation, requestPasswordReset, signingOut, socialAuth } = useAuth();
  const refresh = useTogether((state) => state.refresh);
  const setSnapshot=useTogether((state)=>state.setSnapshot);

  useEffect(()=>{
    if(Platform.OS!=='ios'||!socialAuth.apple)return;
    let active=true;
    void AppleAuthentication.isAvailableAsync().then((available)=>{if(active)setNativeAppleAvailable(available);}).catch(()=>{if(active)setNativeAppleAvailable(false);});
    return()=>{active=false;};
  },[socialAuth.apple]);

  const openSignedInWorld = async () => {
    setBusy(true);
    setOpeningError('');
    try {
      await refresh({ force: true });
      const state = useTogether.getState();
      if (!state.snapshot) throw new Error(state.error ?? 'Kivelle could not open your world.');
      router.replace(resolvePostAuthDestination({authenticated:true,snapshot:state.snapshot,requestedNext:params.next}) as never);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Kivelle could not open your world.';
      setOpeningError(message === 'Failed to fetch' ? 'Kivelle could not reach the server. Check your connection and try again.' : message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (nextCreating: boolean) => {
    setCreating(nextCreating);
    setError('');
    setNotice('');
  };

  const submit = async () => {
    if (busy || signingOut) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setError('Your password needs at least 8 characters.');
      return;
    }
    if(creating&&!validBirthdateEntry(dateOfBirth)){
      setError('Enter your birthdate as YYYY-MM-DD.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (creating) {
        const result = await signUp(normalizedEmail, password,dateOfBirth);
        if (result.needsEmailConfirmation) {
          setConfirmationEmail(normalizedEmail);
          setNotice('Check your email for a secure link to finish creating your account.');
          return;
        }
      } else {
        await signIn(normalizedEmail, password);
        setSignedIn(true);
        await openSignedInWorld();
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

  const socialSignIn=async(provider:SocialAuthProvider)=>{
    setSocialBusy(provider);setError('');setNotice('');
    try{
      if(creating&&!validBirthdateEntry(dateOfBirth))throw new Error('Enter your birthdate as YYYY-MM-DD.');
      if(creating&&Platform.OS==='web')rememberPendingBirthdate(dateOfBirth);
      const requestedNext=safeAppReturnPath(params.next);
      await signInWithSocial(provider,requestedNext);
      if(Platform.OS==='web')return;
      if(creating)setSnapshot(await confirmAdultAge(dateOfBirth));
      await refresh();const state=useTogether.getState();if(!state.snapshot)throw new Error(state.error??'Kivelle could not open your world.');
      router.replace(resolvePostAuthDestination({authenticated:true,snapshot:state.snapshot,requestedNext}) as never);
    }catch(caught){setError(caught instanceof Error?caught.message:`${provider==='google'?'Google':'Apple'} sign-in failed.`);}finally{setSocialBusy(null);}
  };

  const authBusy = busy || signingOut;
  const socialDisabled=authBusy||Boolean(socialBusy);
  const showApple=socialAuth.apple&&nativeAppleAvailable;

  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Screen contentStyle={styles.screen}>
      <View style={[styles.shell, wide ? styles.shellWide : styles.shellCompact]}>
        <View style={[styles.hero, wide ? styles.heroWide : styles.heroCompact]}>
          <Image source={cityLifeAsset} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" />
          <View style={styles.heroShade}>
            <View style={styles.heroTop}>
              <KivelleLogo height={31} />
              <View style={styles.fictionalPill}><Text style={styles.fictionalText}>FICTIONAL AI</Text></View>
            </View>
            <View>
              <View style={styles.liveRow}><View style={styles.liveDot} /><Text style={styles.liveText}>CITY LIFE · NOW</Text></View>
              <Text style={styles.heroTitle}>Your next world is waiting.</Text>
              <Text style={styles.heroBody}>Choose where your story begins.</Text>
            </View>
          </View>
        </View>

        <View style={[styles.form, wide && styles.formWide, signedIn && styles.formSuccess]}>
          {signedIn ? <View accessibilityRole={openingError ? 'alert' : undefined} accessibilityLiveRegion="assertive" accessibilityLabel={openingError ? `Signed in successfully. ${openingError}` : 'Signed in successfully. Opening your world.'} style={styles.successState}>
            <View style={styles.successIcon}><CircleCheck size={34} strokeWidth={1.8} color={colors.success} /></View>
            <View style={styles.successCopy}>
              <Text style={styles.successEyebrow}>SIGN IN SUCCESSFUL</Text>
              <Text style={styles.successTitle}>You’re signed in.</Text>
              <Text style={styles.successBody}>{openingError ? 'Your session is ready, but your world took too long to open.' : 'Your conversations and shared history are ready. Opening your world now…'}</Text>
            </View>
            {openingError ? <>
              <View style={styles.errorBox}><Text style={styles.error}>{openingError}</Text></View>
              <GradientButton label={busy ? 'Opening your world…' : 'Try opening again'} disabled={busy} onPress={() => void openSignedInWorld()} />
            </> : <View style={styles.successProgress}>
              <ActivityIndicator color={colors.rose} />
              <Text style={styles.successProgressText}>Opening your world…</Text>
            </View>}
          </View> : <>
          <View style={styles.intro}>
            <Text style={styles.title}>{signingOut ? 'Signing you out…' : creating ? 'Find your person.' : 'Welcome back.'}</Text>
            <Text style={styles.subtitle}>{signingOut ? 'Securing this session. You can sign in again in a moment.' : creating ? 'Create your account, choose a world, and meet someone who lives there.' : 'Your conversations and shared history are waiting.'}</Text>
          </View>

          <View style={styles.tabs}>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: !creating, disabled: signingOut }} disabled={signingOut} onPress={() => switchMode(false)} style={[styles.tab, !creating && styles.tabActive]}>
              <Text style={[styles.tabText, !creating && styles.tabTextActive]}>Sign in</Text>
            </Pressable>
            <Pressable accessibilityRole="tab" accessibilityState={{ selected: creating, disabled: signingOut }} disabled={signingOut} onPress={() => switchMode(true)} style={[styles.tab, creating && styles.tabActive]}>
              <Text style={[styles.tabText, creating && styles.tabTextActive]}>Join free</Text>
            </Pressable>
          </View>

          <TextInput accessibilityLabel="Email" editable={!authBusy} value={email} onChangeText={setEmail} onSubmitEditing={()=>{if(password.length)void submit();}} returnKeyType={password.length?'go':'next'} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" placeholder="Email address" placeholderTextColor={colors.dimmed} style={[styles.input,error&&styles.inputError]} />
          <View style={styles.password}>
            <TextInput accessibilityLabel={creating ? 'Create a password' : 'Password'} editable={!authBusy} value={password} onChangeText={setPassword} onSubmitEditing={()=>void submit()} returnKeyType="go" autoCapitalize="none" autoCorrect={false} autoComplete={creating ? 'new-password' : 'current-password'} secureTextEntry={!visible} placeholder={creating ? 'Create a password' : 'Password'} placeholderTextColor={colors.dimmed} style={styles.passwordInput} />
            <Pressable accessibilityLabel={visible ? 'Hide password' : 'Show password'} disabled={authBusy} onPress={() => setVisible(!visible)} style={styles.eye}>{visible ? <EyeOff size={20} color={colors.text} /> : <Eye size={20} color={colors.text} />}</Pressable>
          </View>
          {creating?<View style={styles.birthdateBlock}>
            <TextInput accessibilityLabel="Birthdate" editable={!authBusy} value={dateOfBirth} onChangeText={setDateOfBirth} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" placeholder="Birthdate · YYYY-MM-DD" placeholderTextColor={colors.dimmed} maxLength={10} style={styles.input} />
            <Text style={styles.birthdateHint}>You must be 18 or older. Your birthdate is kept private.</Text>
          </View>:null}

          {error ? <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.errorBox}><Text style={styles.errorTitle}>{creating?'We couldn’t create that account':'We couldn’t sign you in'}</Text><Text style={styles.error}>{error}</Text></View> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {confirmationEmail ? <Pressable disabled={authBusy} onPress={() => void resendSignUpConfirmation(confirmationEmail).then(() => setNotice('A fresh secure sign-in link was sent.')).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not resend the link.'))}><Text style={styles.secondary}>Resend secure sign-in link</Text></Pressable> : null}

          <GradientButton label={signingOut ? 'Finishing sign out…' : busy ? creating ? 'Creating your account…' : 'Signing in…' : creating ? 'Choose your world' : 'Sign in'} disabled={authBusy} onPress={() => void submit()} />

          {socialAuth.google||showApple?<><View style={styles.divider}><View style={styles.dividerLine}/><Text style={styles.dividerText}>OR CONTINUE WITH</Text><View style={styles.dividerLine}/></View><View style={styles.socialRow}>
            {socialAuth.google?<Pressable accessibilityRole="button" accessibilityLabel="Continue with Google" disabled={socialDisabled} onPress={()=>void socialSignIn('google')} style={({pressed})=>[styles.socialButton,pressed&&styles.socialPressed]}><GoogleMark/><Text style={styles.socialText}>{socialBusy==='google'?'Connecting…':'Google'}</Text></Pressable>:null}
            {showApple&&Platform.OS==='ios'?<View accessibilityState={{disabled:socialDisabled}} pointerEvents={socialDisabled?'none':'auto'} style={[styles.nativeAppleSlot,socialDisabled&&styles.socialDisabled]}><AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE} buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE} cornerRadius={12} style={styles.nativeAppleButton} onPress={()=>void socialSignIn('apple')}/></View>:showApple?<Pressable accessibilityRole="button" accessibilityLabel="Continue with Apple" disabled={socialDisabled} onPress={()=>void socialSignIn('apple')} style={({pressed})=>[styles.socialButton,pressed&&styles.socialPressed]}><Text style={styles.providerMark}></Text><Text style={styles.socialText}>{socialBusy==='apple'?'Connecting…':'Apple'}</Text></Pressable>:null}
          </View></>:null}

          {!creating ? <Pressable disabled={authBusy} onPress={() => void reset()}><Text style={styles.secondary}>Forgot password?</Text></Pressable> : <View style={styles.instant}><Sparkles size={14} color={colors.violet} /><Text style={styles.instantText}>No setup tour. Personalize later.</Text></View>}

          <View style={styles.legalLinks}>
            <Pressable accessibilityRole="link" onPress={() => router.push('/terms' as never)}><Text style={styles.legalLink}>Terms</Text></Pressable>
            <Text style={styles.legalDot}>·</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/privacy-policy' as never)}><Text style={styles.legalLink}>Privacy</Text></Pressable>
            <Text style={styles.legalDot}>·</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/community-guidelines' as never)}><Text style={styles.legalLink}>Safety</Text></Pressable>
            <Text style={styles.legalDot}>·</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/help' as never)}><Text style={styles.legalLink}>Help</Text></Pressable>
          </View>
          </>}
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
  fictionalPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(8,8,14,.66)', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)' },
  fictionalText: { color: '#F5DDE6', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  liveRow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  liveText: { color: '#F9D9E4', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { fontFamily: typography.display, fontSize: 29, fontWeight: '600', color: '#fff', textShadowColor: '#000', textShadowRadius: 12 },
  heroBody: { color: '#F5E9EE', fontSize: 13, marginTop: 3, textShadowColor: '#000', textShadowRadius: 8 },
  form: { gap: 11, padding: 18 },
  formWide: { flex: 0.92, justifyContent: 'center', padding: 34 },
  formSuccess: { minHeight: 340 },
  successState: { width: '100%', alignItems: 'center', justifyContent: 'center', gap: 16 },
  successIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(82,211,155,.1)', borderWidth: 1, borderColor: 'rgba(82,211,155,.32)', shadowColor: colors.success, shadowOpacity: .2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  successCopy: { alignItems: 'center', gap: 5 },
  successEyebrow: { color: colors.success, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  successTitle: { color: colors.text, fontFamily: typography.display, fontSize: 31, fontWeight: '600', textAlign: 'center' },
  successBody: { maxWidth: 340, color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  successProgress: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: 'rgba(216,62,234,.08)', borderWidth: 1, borderColor: 'rgba(216,62,234,.22)' },
  successProgressText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  intro: { gap: 3, marginBottom: 2 },
  title: { fontFamily: typography.display, fontSize: 31, fontWeight: '600', color: colors.text },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: radius.pill, backgroundColor: colors.background },
  tab: { flex: 1, minHeight: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border },
  tabText: { color: colors.muted, fontWeight: '800', fontSize: 13 },
  tabTextActive: { color: colors.text },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, paddingHorizontal: 15, fontSize: 16 },
  inputError:{borderColor:'rgba(255,113,129,.52)'},
  password: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  passwordInput: { flex: 1, minHeight: 48, color: colors.text, paddingHorizontal: 15, fontSize: 16, outlineStyle: 'none' } as never,
  eye: { padding: 13 },
  birthdateBlock:{gap:6},
  birthdateHint:{color:colors.dimmed,fontSize:10,lineHeight:14},
  age: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  ageActive: { borderColor: 'rgba(216,62,234,.55)', backgroundColor: 'rgba(216,62,234,.09)' },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: colors.borderBright, alignItems: 'center', justifyContent: 'center' },
  checkActive: { backgroundColor: colors.rose, borderColor: colors.rose },
  ageCopy: { flex: 1 },
  ageTitle: { color: colors.text, fontWeight: '900', fontSize: 12 },
  ageBody: { color: colors.muted, fontSize: 10, marginTop: 2 },
  errorBox: { borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: 'rgba(255,113,129,.1)', borderWidth: 1, borderColor: 'rgba(255,113,129,.28)' },
  errorTitle:{color:'#FFD3D8',fontSize:12,fontWeight:'900',marginBottom:2},
  error: { color: '#FF9BA7', fontSize: 12, lineHeight: 17 },
  notice: { color: colors.success, fontSize: 12, textAlign: 'center' },
  divider:{flexDirection:'row',alignItems:'center',gap:9,marginVertical:2},
  dividerLine:{height:1,flex:1,backgroundColor:colors.border},
  dividerText:{color:colors.dimmed,fontSize:8,fontWeight:'900',letterSpacing:1},
  socialRow:{flexDirection:'row',gap:9},
  socialButton:{minHeight:46,flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,borderRadius:radius.md,borderWidth:1,borderColor:colors.borderBright,backgroundColor:'rgba(255,255,255,.035)'},
  nativeAppleSlot:{height:46,flex:1},
  nativeAppleButton:{width:'100%',height:46},
  socialDisabled:{opacity:.52},
  socialPressed:{opacity:.78,transform:[{scale:.99}]},
  providerMark:{color:colors.text,fontSize:18,fontWeight:'900'},
  socialText:{color:colors.text,fontSize:12,fontWeight:'800'},
  secondary: { textAlign: 'center', color: colors.muted, fontWeight: '700', fontSize: 12 },
  instant: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  instantText: { color: colors.muted, fontSize: 11 },
  legalLinks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 2 },
  legalLink: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  legalDot: { color: colors.dimmed, fontSize: 10 },
});
