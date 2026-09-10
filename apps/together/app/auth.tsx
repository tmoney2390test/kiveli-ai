import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { CircleCheck } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientButton } from '../src/components';
import { GoogleMark } from '../src/components/GoogleMark';
import { AppleMark } from '../src/components/AppleMark';
import { colors, radius, typography } from '../src/theme';
import { useAuth } from '../src/hooks/useAuth';
import { useTogether } from '../src/store/useTogether';
import { joinPathFor, safeAppReturnPath, signInPathFor } from '../src/lib/sessionRouting';
import { resolvePostAuthDestination } from '../src/lib/authRouting';
import type { SocialAuthProvider } from '../src/lib/socialAuth';
import { useWebHydrated } from '../src/hooks/useWebHydrated';
import { publicLandingPrimaryHeroAsset, publicLandingPrimaryHeroUri } from '../src/components/landing/publicLandingAssets';
import { EMAIL_CODE_RESEND_SECONDS, emailCodeReady, emailCodeResendSeconds, normalizeEmailAddress, normalizeEmailCode } from '../src/lib/emailCodeAuth';

type EmailAuthStage = 'email' | 'code';

export default function Auth() {
  const params = useLocalSearchParams<{ mode?: string; next?: string }>();
  const { width,height } = useWindowDimensions();
  const insets=useSafeAreaInsets();
  const webHydrated = useWebHydrated();
  const wide = webHydrated && width >= 900;
  const creating = params.mode !== 'signin';
  const [stage, setStage] = useState<EmailAuthStage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [socialBusy,setSocialBusy]=useState<SocialAuthProvider|null>(null);
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [openingError, setOpeningError] = useState('');
  const [notice, setNotice] = useState('');
  const [nativeAppleAvailable,setNativeAppleAvailable]=useState(Platform.OS!=='ios');
  const { requestEmailCode, verifyEmailCode, signInWithSocial, signingOut, socialAuth } = useAuth();
  const refresh = useTogether((state) => state.refresh);

  useEffect(()=>{
    if(Platform.OS!=='ios'||!socialAuth.apple)return;
    let active=true;
    void AppleAuthentication.isAvailableAsync().then((available)=>{if(active)setNativeAppleAvailable(available);}).catch(()=>{if(active)setNativeAppleAvailable(false);});
    return()=>{active=false;};
  },[socialAuth.apple]);

  useEffect(() => {
    if (stage !== 'code' || resendAvailableAt <= Date.now()) return;
    const timer = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [resendAvailableAt, stage]);

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

  const submit = async () => {
    if (busy || signingOut) return;
    const normalizedEmail = normalizeEmailAddress(stage === 'code' ? submittedEmail : email);
    if (!normalizedEmail) {
      setError('Enter your email address so we can send your code.');
      return;
    }
    if (stage === 'code' && !emailCodeReady(code)) {
      setError('Enter the six-digit code from your email.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (stage === 'email') {
        await requestEmailCode(normalizedEmail);
        setSubmittedEmail(normalizedEmail);
        setStage('code');
        setResendAvailableAt(Date.now() + EMAIL_CODE_RESEND_SECONDS * 1_000);
        setClock(Date.now());
      } else {
        await verifyEmailCode(normalizedEmail, normalizeEmailCode(code));
        setSignedIn(true);
        await openSignedInWorld();
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : stage === 'email' ? 'The code could not be sent.' : 'The code could not be verified.';
      setError(message === 'Failed to fetch' ? 'Kivelle could not reach the server. Check your connection and try again.' : message);
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    const remaining = emailCodeResendSeconds(resendAvailableAt, Date.now());
    if (busy || signingOut || remaining > 0 || !submittedEmail) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await requestEmailCode(submittedEmail);
      setResendAvailableAt(Date.now() + EMAIL_CODE_RESEND_SECONDS * 1_000);
      setClock(Date.now());
      setNotice('A new six-digit code is on its way.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'A new code could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  const changeEmail = () => {
    setStage('email');
    setCode('');
    setSubmittedEmail('');
    setResendAvailableAt(0);
    setError('');
    setNotice('');
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
  const mobileFormReserve=(stage==='code'?(shortViewport?354:382):(shortViewport?388:420))+safeAreaReserve;
  const mobileHeroHeight=Math.max(80,Math.min(height*.43,height-mobileFormReserve));
  const resendSeconds=emailCodeResendSeconds(resendAvailableAt,clock);

  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <Head><link rel="preload" as="image" href={publicLandingPrimaryHeroUri} fetchPriority="high" /></Head>
    <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={[styles.page,{minHeight:height}]}>
      <View style={[styles.shell, wide ? styles.shellWide : styles.shellCompact]}>
        <View style={[styles.hero, wide ? styles.heroWide : {height:mobileHeroHeight}]}>
          <Image accessibilityLabel="Evelyn Harrow in her Vespormoor study" source={publicLandingPrimaryHeroAsset} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top center" loading="eager" priority="high" transition={0}/>
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
            <Text style={[styles.title,wide?styles.titleWide:styles.titleCompact,shortViewport&&styles.titleShort]}>{signingOut ? 'Signing you out…' : stage==='code' ? 'Check your email.' : creating ? 'Find your person.' : 'Welcome back.'}</Text>
            {stage==='code'?<Text style={styles.codeLead}>Enter the six-digit code sent to {submittedEmail}.</Text>:null}
          </View>

          {stage==='email'
            ? <TextInput accessibilityLabel="Email address" editable={!authBusy} value={email} onChangeText={(value)=>{setEmail(value);setError('');}} onSubmitEditing={()=>void submit()} returnKeyType="go" autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" placeholder="Email address" placeholderTextColor={colors.dimmed} style={[styles.input,error&&styles.inputError]} />
            : <TextInput accessibilityLabel="Six-digit sign-in code" editable={!authBusy} value={code} onChangeText={(value)=>{setCode(normalizeEmailCode(value));setError('');}} onSubmitEditing={()=>{if(emailCodeReady(code))void submit();}} returnKeyType="go" autoCapitalize="none" autoCorrect={false} autoComplete="one-time-code" keyboardType="number-pad" maxLength={6} placeholder="000000" placeholderTextColor={colors.dimmed} selectTextOnFocus style={[styles.input,styles.codeInput,error&&styles.inputError]} />}

          {error ? <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.errorBox}><Text style={styles.errorTitle}>{stage==='email'?'We couldn’t send the code':'That code didn’t work'}</Text><Text style={styles.error}>{error}</Text></View> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={stage==='email'?'Email me a code':'Continue'}
            accessibilityState={{disabled:authBusy}}
            disabled={authBusy}
            onPress={() => void submit()}
            style={({pressed})=>[styles.emailAction,authBusy&&styles.emailActionDisabled,pressed&&!authBusy&&styles.emailActionPressed]}
          >
            <Text style={styles.emailActionText}>{signingOut ? 'Finishing sign out…' : busy ? stage==='email'?'Sending code…':'Checking code…' : stage==='email'?'Email me a code':'Continue'}</Text>
          </Pressable>

          {stage==='code'?<View style={styles.codeActions}>
            <Pressable accessibilityRole="button" disabled={authBusy} onPress={changeEmail} hitSlop={10}><Text style={styles.secondary}>Use a different email</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{disabled:authBusy||resendSeconds>0}} disabled={authBusy||resendSeconds>0} onPress={()=>void resendCode()} hitSlop={10}><Text style={[styles.secondary,resendSeconds>0&&styles.secondaryDisabled]}>{resendSeconds>0?`Resend in ${resendSeconds}s`:'Resend code'}</Text></Pressable>
          </View>:null}

          {stage==='email'&&(socialAuth.google||showApple)?<><View style={styles.divider}><View style={styles.dividerLine}/><Text style={styles.dividerText}>OR CONTINUE WITH</Text><View style={styles.dividerLine}/></View><View style={styles.socialRow}>
            {socialAuth.google?<Pressable accessibilityRole="button" accessibilityLabel="Continue with Google" disabled={socialDisabled} onPress={()=>void socialSignIn('google')} style={({pressed})=>[styles.socialButton,pressed&&styles.socialPressed]}><GoogleMark/><Text style={styles.socialText}>{socialBusy==='google'?'Connecting…':'Google'}</Text></Pressable>:null}
            {showApple&&Platform.OS==='ios'?<View accessibilityState={{disabled:socialDisabled}} pointerEvents={socialDisabled?'none':'auto'} style={[styles.nativeAppleSlot,socialDisabled&&styles.socialDisabled]}><AppleAuthentication.AppleAuthenticationButton buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE} buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE} cornerRadius={12} style={styles.nativeAppleButton} onPress={()=>void socialSignIn('apple')}/></View>:showApple?<Pressable accessibilityRole="button" accessibilityLabel="Continue with Apple" disabled={socialDisabled} onPress={()=>void socialSignIn('apple')} style={({pressed})=>[styles.socialButton,pressed&&styles.socialPressed]}><AppleMark color={colors.text}/><Text style={styles.socialText}>{socialBusy==='apple'?'Connecting…':'Apple'}</Text></Pressable>:null}
          </View></>:null}

          {stage==='email'?<Pressable
            accessibilityRole="button"
            accessibilityLabel={creating?'Already have an account? Sign in':"Don't have an account? Create one"}
            disabled={authBusy||Boolean(socialBusy)}
            onPress={()=>router.replace((creating?signInPathFor(params.next??''):joinPathFor(params.next)) as never)}
            style={({pressed})=>[styles.createAccountAction,(authBusy||Boolean(socialBusy))&&styles.emailActionDisabled,pressed&&styles.createAccountActionPressed]}
          >
            <Text style={styles.createAccountText}>{creating?'Already have an account? ':"Don’t have an account? "}<Text style={styles.createAccountLink}>{creating?'Sign in':'Create one'}</Text></Text>
          </Pressable>:null}

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
  codeLead:{color:colors.muted,fontSize:13,lineHeight:19,textAlign:'center',marginTop:5},
  tabs: { flexDirection: 'row', padding: 4, borderRadius: radius.pill, backgroundColor: colors.background },
  tab: { flex: 1, minHeight: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border },
  tabText: { color: colors.muted, fontWeight: '800', fontSize: 13 },
  tabTextActive: { color: colors.text },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text, paddingHorizontal: 15, fontSize: 16 },
  codeInput:{fontSize:24,fontWeight:'800',letterSpacing:8,textAlign:'center'},
  emailAction:{minHeight:50,borderRadius:radius.md,borderWidth:1,borderColor:'rgba(201,91,220,0.82)',backgroundColor:'rgba(166,37,189,0.10)',alignItems:'center',justifyContent:'center',paddingHorizontal:18},
  emailActionPressed:{backgroundColor:'rgba(166,37,189,0.18)',transform:[{scale:0.992}]},
  emailActionDisabled:{opacity:0.5},
  emailActionText:{color:'#FFF8FC',fontSize:15,fontWeight:'800'},
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
  socialText:{color:colors.text,fontSize:12,fontWeight:'800'},
  createAccountAction:{minHeight:44,alignItems:'center',justifyContent:'center',paddingHorizontal:12,borderRadius:radius.md,borderWidth:1,borderColor:'rgba(201,91,220,.38)',backgroundColor:'rgba(166,37,189,.035)'},
  createAccountActionPressed:{backgroundColor:'rgba(166,37,189,.10)',borderColor:'rgba(201,91,220,.62)'},
  createAccountText:{color:colors.muted,fontSize:12,lineHeight:17,fontWeight:'700'},
  createAccountLink:{color:'#F2D8F5',fontWeight:'900'},
  secondary: { textAlign: 'center', color: colors.muted, fontWeight: '700', fontSize: 12 },
  secondaryDisabled:{color:colors.dimmed},
  codeActions:{minHeight:32,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:4},
  agreement:{width:'100%',alignItems:'center'},
  agreementText:{maxWidth:390,color:colors.dimmed,fontSize:10,lineHeight:15,textAlign:'center'},
  agreementLink:{color:colors.muted,fontWeight:'800',textDecorationLine:'underline'},
});
