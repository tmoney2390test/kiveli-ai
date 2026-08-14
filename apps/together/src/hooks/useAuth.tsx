import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import type { AuthError, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { authErrorMessage } from '../lib/authErrors';
import { createTogetherAccount } from '../lib/api';

type SignUpResult = { needsEmailConfirmation: boolean };
type AuthValue = { session: Session|null; loading: boolean; signIn:(email:string,password:string)=>Promise<void>; signUp:(email:string,password:string)=>Promise<SignUpResult>; resendSignUpConfirmation:(email:string)=>Promise<void>; requestPasswordReset:(email:string)=>Promise<void>; signOut:()=>Promise<void>; signOutOthers:()=>Promise<void>; updateEmail:(email:string)=>Promise<void>; updatePassword:(password:string)=>Promise<void>; resendEmailVerification:()=>Promise<void> };
const AuthContext = createContext<AuthValue|null>(null);

export function authRedirectUrl(path = '/auth/callback') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return new URL(path, window.location.origin).toString();
  return path.includes('reset-password') ? 'together://auth/reset-password' : 'together://auth/callback';
}

function readableAuthError(error: AuthError) {
  return Object.assign(new Error(authErrorMessage(error.code, error.message)), { code: error.code });
}

export function AuthProvider({children}:PropsWithChildren){
  const [session,setSession]=useState<Session|null>(null); const[loading,setLoading]=useState(true);
  useEffect(()=>{let mounted=true;void supabase.auth.getSession().then(({data})=>{if(mounted)setSession(data.session);}).catch(()=>{if(mounted)setSession(null);}).finally(()=>{if(mounted)setLoading(false);});const{data}=supabase.auth.onAuthStateChange((_event,next)=>{if(mounted){setSession(next);setLoading(false);}});return()=>{mounted=false;data.subscription.unsubscribe();};},[]);
  const value=useMemo<AuthValue>(()=>({session,loading,
    signIn:async(email,password)=>{let{data,error}=await supabase.auth.signInWithPassword({email,password});if(error?.code==='email_not_confirmed'){await createTogetherAccount(email,password);({data,error}=await supabase.auth.signInWithPassword({email,password}));}if(error)throw readableAuthError(error);if(!data.session)throw new Error('Sign in could not be completed. Please try again.');},
    signUp:async(email,password)=>{await createTogetherAccount(email,password);const{data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw readableAuthError(error);if(!data.session)throw new Error('Your account was created, but sign in did not finish. Try signing in again.');return{needsEmailConfirmation:false};},
    resendSignUpConfirmation:async(email)=>{const{error}=await supabase.auth.resend({type:'signup',email,options:{emailRedirectTo:authRedirectUrl()}});if(error)throw readableAuthError(error);},
    requestPasswordReset:async(email)=>{const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:authRedirectUrl('/reset-password')});if(error)throw readableAuthError(error);},
    signOut:async()=>{const{error}=await supabase.auth.signOut();if(error)throw readableAuthError(error);},signOutOthers:async()=>{const{error}=await supabase.auth.signOut({scope:'others'});if(error)throw readableAuthError(error);},updateEmail:async(email)=>{const{error}=await supabase.auth.updateUser({email});if(error)throw readableAuthError(error);},updatePassword:async(password)=>{const{error}=await supabase.auth.updateUser({password});if(error)throw readableAuthError(error);},resendEmailVerification:async()=>{if(!session?.user.email)throw new Error('No email is available for this account.');const{error}=await supabase.auth.resend({type:'email_change',email:session.user.email,options:{emailRedirectTo:authRedirectUrl()}});if(error)throw readableAuthError(error);}}),[session,loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth():AuthValue{const value=useContext(AuthContext);if(!value)throw new Error('useAuth must be inside AuthProvider');return value;}
