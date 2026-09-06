import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { CircleCheck, Eye, EyeOff } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BirthdateField } from '../src/components/BirthdateField';
import { GradientButton } from '../src/components';
import { GoogleMark } from '../src/components/GoogleMark';
import { colors, radius, typography } from '../src/theme';
import { useAuth } from '../src/hooks/useAuth';
import { useTogether } from '../src/store/useTogether';
import { safeAppReturnPath } from '../src/lib/sessionRouting';
import { resolvePostAuthDestination } from '../src/lib/authRouting';
import type { SocialAuthProvider } from '../src/lib/socialAuth';
import { useWebHydrated } from '../src/hooks/useWebHydrated';
import { validBirthdateEntry } from '../src/lib/pendingBirthdate';
import { publicLandingPrimaryHeroAsset } from '../src/components/landing/publicLandingAssets';

export default function Auth() {
  const params = useLocalSearchParams<{ mode?: string; next?: string }>();
  const { width,height } = useWindowDimensions();
  const insets=useSafeAreaInsets();
  const webHydrated = useWebHydrated();
  const wide = webHydrated && width >= 900;
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
      setError('Choose your birthdate.');
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
      const requestedNext=safeAppReturnPath(params.next);
      await signInWithSocial(provider,requestedNext);
      if(Platform.OS==='web')return;
      await refresh();const state=useTogether.getState();if(!state.snapshot)throw new Error(state.error??'Kivelle could not open your world.');
      router.replace(resolvePostAuthDestination({authenticated:true,snapshot:state.snapshot,requestedNext}) as never);
    }catch(caught){setError(caught instanceof Error?caught.message:`${provider==='google'?'Google':'Apple'} sign-in failed.`);}finally{setSocialBusy(null);}
  };

  const authBusy = busy || signingOut;
  const socialDisabled=authBusy||Boolean(socialBusy);
  const showApple=socialAuth.apple&&nativeAppleAvailable;
  const shortViewport=!wide&&height<720;
  const safeAreaReserve=Math.max(0,insets.bottom-6);
  const mobileFormReserve=(creating?(shortViewport?478:516):(shortViewport?410:438))+safeAreaReserve;
  const mobileHeroHeight=Math.max(80,Math.min(height*.43,height-mobileFormReserve));

  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={[styles.page,{minHeight:height}]}>
      <View style={[styles.shell, wide ? styles.shellWide : styles.shellCompact]}>
        <View style={[styles.hero, wide ? styles.heroWide : {height:mobileHeroHeight}]}>
          <Image accessibilityLabel="Evelyn Harrow in her Vespormoor study" source={publicLandingPrimaryHeroAsset} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={wide?'center':'top'} loading="eager" priority="high" transition={0}/>
          <View pointerEvents="none" style={styles.heroShade}/>
          {Platform.OS==='web'
            ? <View pointerEvents="none" style={[styles.heroFade,wide?styles.heroFadeWideWeb:styles.heroFadeCompactWeb]}/>
            : <View pointerEvents="none" style={[styles.heroFade,wide?styles.heroFadeWideNative:styles.heroFadeCompactNative]}/>
          }
        </View>

        <View style={[
          styles.form,
          shortViewport&&styles.formShort,
          wide ? styles.formWide : styles.formCompact,
          !wide&&shortViewport&&styles.formCompactShort,
          !wide&&{paddingBottom:Math.max(insets.bottom+(shortViewport?8:18),shortViewport?14:24)},
          signedIn && styles.formSuccess,
        ]}>
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
            <Text style={[styles.title,wide?styles.titleWide:styles.titleCompact,shortViewport&&styles.titleShort]}>{signingOut ? 'Signing you out…' : creating ? 'Find your person.' : 'Welcome back.'}</Text>
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
            <BirthdateField disabled={authBusy} hasError={Boolean(error)&&!validBirthdateEntry(dateOfBirth)} value={dateOfBirth} onChange={(value)=>{setDateOfBirth(value);setError('');}} />
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

          {!creating ? <Pressable disabled={authBusy} onPress={() => void reset()}><Text style={styles.secondary}>Forgot password?</Text></Pressable> : null}

          <View accessibilityLabel="Account agreement" style={styles.agreement}>
            <Text style={styles.agreementText}>
              By continuing, you agree to the{' '}
              <Text accessibilityRole="link" onPress={() => router.push('/terms' as never)} style={styles.agreementLink}>Terms of Service</Text>
              {' '}and{' '}
              <Text accessibilityRole="link" onPress={() => router.push('/privacy-policy' as never)} style={styles.agreementLink}>Privacy Policy</Text>.
            </Text>
          </View>
          </>}
        </View>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#05040A' },
  scroll:{flex:1,backgroundColor:'#05040A'},
  page:{width:'100%',backgroundColor:'#05040A'},
  shell: { flex:1,width: '100%', overflow: 'hidden', backgroundColor: '#05040A' },
  shellCompact: { flexDirection: 'column' },
  shellWide: { flexDirection: 'row', minHeight: 620 },
  hero: { position: 'relative', overflow:'hidden',backgroundColor: '#110D13' },
  heroWide: { width:'58%',minHeight:620 },
  heroShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(6,3,7,.08)'},
  heroFade:{position:'absolute'},
  heroFadeWideWeb:{top:0,right:0,bottom:0,width:90,backgroundColor:'transparent',backgroundImage:'linear-gradient(90deg, rgba(5,4,10,0) 0%, #05040A 100%)'} as never,
  heroFadeCompactWeb:{left:0,right:0,bottom:0,height:118,backgroundColor:'transparent',backgroundImage:'linear-gradient(180deg, rgba(5,4,10,0) 0%, #05040A 100%)'} as never,
  heroFadeWideNative:{top:0,right:0,bottom:0,width:42,backgroundColor:'rgba(5,4,10,.66)'},
  heroFadeCompactNative:{left:0,right:0,bottom:0,height:70,backgroundColor:'rgba(5,4,10,.74)'},
  form: { gap: 12,backgroundColor:'#05040A' },
  formShort:{gap:8},
  formCompact:{paddingTop:10,paddingHorizontal:24},
  formCompactShort:{paddingTop:6},
  formWide: { flex: 1,minWidth:390,justifyContent: 'center', paddingHorizontal:'6%',paddingVertical:48 },
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
  title: { fontFamily: typography.display, fontWeight: '500', color: colors.text,letterSpacing:-1.2 },
  titleWide:{fontSize:56,lineHeight:58},
  titleCompact:{fontSize:46,lineHeight:48,textAlign:'center'},
  titleShort:{fontSize:40,lineHeight:42},
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
  agreement:{width:'100%',alignItems:'center'},
  agreementText:{maxWidth:390,color:colors.dimmed,fontSize:10,lineHeight:15,textAlign:'center'},
  agreementLink:{color:colors.muted,fontWeight:'800',textDecorationLine:'underline'},
});
