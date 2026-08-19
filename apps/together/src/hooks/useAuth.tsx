import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import type { AuthError, Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import { authErrorMessage } from '../lib/authErrors';
import { createTogetherAccount } from '../lib/api';
import { parseOAuthCallbackUrl, resolveSocialAuthCapabilities, socialAuthErrorMessage, type SocialAuthCapabilities, type SocialAuthProvider } from '../lib/socialAuth';

type SignUpResult = { needsEmailConfirmation: boolean };
type AuthValue = { session: Session|null; loading: boolean; socialAuth:SocialAuthCapabilities; signIn:(email:string,password:string)=>Promise<void>; signInWithSocial:(provider:SocialAuthProvider,next?:string|null)=>Promise<void>; signUp:(email:string,password:string)=>Promise<SignUpResult>; resendSignUpConfirmation:(email:string)=>Promise<void>; requestPasswordReset:(email:string)=>Promise<void>; signOut:()=>Promise<void>; signOutOthers:()=>Promise<void>; updateEmail:(email:string)=>Promise<void>; updatePassword:(password:string)=>Promise<void>; resendEmailVerification:()=>Promise<void> };
const AuthContext = createContext<AuthValue|null>(null);
const socialAuth=resolveSocialAuthCapabilities({google:process.env.EXPO_PUBLIC_KIVELLE_GOOGLE_AUTH_ENABLED,apple:process.env.EXPO_PUBLIC_KIVELLE_APPLE_AUTH_ENABLED});
void WebBrowser.maybeCompleteAuthSession();

export function authRedirectUrl(path = '/auth/callback') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return new URL(path, window.location.origin).toString();
  return `together://${path.replace(/^\//,'')}`;
}

function readableAuthError(error: AuthError) {
  return Object.assign(new Error(authErrorMessage(error.code, error.message)), { code: error.code });
}

export function AuthProvider({children}:PropsWithChildren){
  const [session,setSession]=useState<Session|null>(null); const[loading,setLoading]=useState(true);
  useEffect(()=>{let mounted=true;void supabase.auth.getSession().then(({data})=>{if(mounted)setSession(data.session);}).catch(()=>{if(mounted)setSession(null);}).finally(()=>{if(mounted)setLoading(false);});const{data}=supabase.auth.onAuthStateChange((_event,next)=>{if(mounted){setSession(next);setLoading(false);}});return()=>{mounted=false;data.subscription.unsubscribe();};},[]);
  const value=useMemo<AuthValue>(()=>({session,loading,socialAuth,
    signIn:async(email,password)=>{let{data,error}=await supabase.auth.signInWithPassword({email,password});if(error?.code==='email_not_confirmed'){await createTogetherAccount(email,password);({data,error}=await supabase.auth.signInWithPassword({email,password}));}if(error)throw readableAuthError(error);if(!data.session)throw new Error('Sign in could not be completed. Please try again.');},
    signInWithSocial:async(provider,next)=>{
      if(!socialAuth[provider])throw new Error(`${provider==='google'?'Google':'Apple'} sign-in is not configured yet.`);
      try{
        if(provider==='apple'&&Platform.OS==='ios'){
          const available=await AppleAuthentication.isAvailableAsync();if(!available)throw new Error('Apple sign-in is unavailable on this device.');
          const rawNonce=Crypto.randomUUID(),hashedNonce=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,rawNonce);
          const credential=await AppleAuthentication.signInAsync({requestedScopes:[AppleAuthentication.AppleAuthenticationScope.FULL_NAME,AppleAuthentication.AppleAuthenticationScope.EMAIL],nonce:hashedNonce});
          if(!credential.identityToken)throw new Error('Apple did not return an identity token.');
          const{data,error}=await supabase.auth.signInWithIdToken({provider:'apple',token:credential.identityToken,nonce:rawNonce});if(error)throw error;if(!data.session)throw new Error('Apple sign-in did not create a Kivelle session.');
          const displayName=[credential.fullName?.givenName,credential.fullName?.middleName,credential.fullName?.familyName].filter(Boolean).join(' ');if(displayName)await supabase.auth.updateUser({data:{display_name:displayName,given_name:credential.fullName?.givenName,family_name:credential.fullName?.familyName,signup_app:'together'}});
          return;
        }
        const suffix=next?`?next=${encodeURIComponent(next)}`:'',redirectTo=authRedirectUrl(`/auth/callback${suffix}`);
        const{data,error}=await supabase.auth.signInWithOAuth({provider,options:{redirectTo,skipBrowserRedirect:Platform.OS!=='web',queryParams:provider==='google'?{prompt:'select_account'}:undefined}});if(error)throw error;
        if(Platform.OS==='web')return;
        if(!data.url)throw new Error(`${provider==='google'?'Google':'Apple'} sign-in could not be opened.`);
        const result=await WebBrowser.openAuthSessionAsync(data.url,redirectTo,{showTitle:false});if(result.type==='cancel'||result.type==='dismiss')throw new Error('Sign-in was cancelled.');if(result.type!=='success'||!result.url)throw new Error('Sign-in did not complete.');
        const callback=parseOAuthCallbackUrl(result.url);if(callback.error)throw new Error(callback.error);if(!callback.code)throw new Error('Sign-in callback did not include an authorization code.');
        const exchanged=await supabase.auth.exchangeCodeForSession(callback.code);if(exchanged.error)throw exchanged.error;if(!exchanged.data.session)throw new Error('Sign-in did not create a Kivelle session.');
      }catch(error){throw new Error(socialAuthErrorMessage(provider,error));}
    },
    signUp:async(email,password)=>{await createTogetherAccount(email,password);const{data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw readableAuthError(error);if(!data.session)throw new Error('Your account was created, but sign in did not finish. Try signing in again.');return{needsEmailConfirmation:false};},
    resendSignUpConfirmation:async(email)=>{const{error}=await supabase.auth.resend({type:'signup',email,options:{emailRedirectTo:authRedirectUrl()}});if(error)throw readableAuthError(error);},
    requestPasswordReset:async(email)=>{const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:authRedirectUrl('/reset-password')});if(error)throw readableAuthError(error);},
    signOut:async()=>{const{error}=await supabase.auth.signOut();if(error)throw readableAuthError(error);},signOutOthers:async()=>{const{error}=await supabase.auth.signOut({scope:'others'});if(error)throw readableAuthError(error);},updateEmail:async(email)=>{const{error}=await supabase.auth.updateUser({email});if(error)throw readableAuthError(error);},updatePassword:async(password)=>{const{error}=await supabase.auth.updateUser({password});if(error)throw readableAuthError(error);},resendEmailVerification:async()=>{if(!session?.user.email)throw new Error('No email is available for this account.');const{error}=await supabase.auth.resend({type:'email_change',email:session.user.email,options:{emailRedirectTo:authRedirectUrl()}});if(error)throw readableAuthError(error);}}),[session,loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth():AuthValue{const value=useContext(AuthContext);if(!value)throw new Error('useAuth must be inside AuthProvider');return value;}
