import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import type { AuthError, Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import { authErrorMessage } from '../lib/authErrors';
import { createTogetherAccount } from '../lib/api';
import { getValidatedPersistedSession } from '../lib/authSession';
import { appleUserMetadata, parseOAuthCallbackUrl, resolveSocialAuthCapabilities, socialAuthErrorMessage, type SocialAuthCapabilities, type SocialAuthProvider } from '../lib/socialAuth';

type SignUpResult = { needsEmailConfirmation: boolean };
type AuthValue = {
  session: Session | null;
  loading: boolean;
  signingOut: boolean;
  socialAuth: SocialAuthCapabilities;
  signIn(email: string, password: string): Promise<void>;
  signInWithSocial(provider: SocialAuthProvider, next?: string | null): Promise<void>;
  signUp(email: string, password: string): Promise<SignUpResult>;
  resendSignUpConfirmation(email: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;
  signOutOthers(): Promise<void>;
  reauthenticate(password: string): Promise<void>;
  updateEmail(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  resendPendingEmailChange(): Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);
const socialAuth = resolveSocialAuthCapabilities({
  // Google is an established production provider. Keep its entry point
  // visible if an Expo environment snapshot omits the rollout flag; Supabase
  // remains authoritative and will still reject a disabled provider.
  google: process.env.EXPO_PUBLIC_KIVELLE_GOOGLE_AUTH_ENABLED ?? 'true',
  apple: process.env.EXPO_PUBLIC_KIVELLE_APPLE_AUTH_ENABLED,
});
void WebBrowser.maybeCompleteAuthSession();

export function authRedirectUrl(path = '/auth/callback') {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return new URL(path, window.location.origin).toString();
  return `kivelli://${path.replace(/^\//, '')}`;
}

function readableAuthError(error: AuthError) {
  return Object.assign(new Error(authErrorMessage(error.code, error.message)), { code: error.code });
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let mounted = true;
    let bootstrapped = false;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (mounted && bootstrapped) {
        setSession(next);
        setLoading(false);
      }
    });
    void getValidatedPersistedSession(supabase.auth)
      .then((next) => {
        if (mounted) {
          setSession(next);
        }
      })
      .catch(() => { if (mounted) setSession(null); })
      .finally(() => {
        bootstrapped = true;
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthValue>(() => ({
    session,
    loading,
    signingOut,
    socialAuth,
    signIn: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw readableAuthError(error);
      if (!data.session) throw new Error('Sign in could not be completed. Please try again.');
    },
    signInWithSocial: async (provider, next) => {
      if (!socialAuth[provider]) throw new Error(`${provider === 'google' ? 'Google' : 'Apple'} sign-in is not configured yet.`);
      try {
        if (provider === 'apple' && Platform.OS === 'ios') {
          const available = await AppleAuthentication.isAvailableAsync();
          if (!available) throw new Error('Apple sign-in is unavailable on this device.');
          const rawNonce = Crypto.randomUUID();
          const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
          const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
            nonce: hashedNonce,
          });
          if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
          const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
          if (error) throw error;
          if (!data.session) throw new Error('Apple sign-in did not create a Kivelle session.');
          let formattedName='';
          if(credential.fullName){
            try{formattedName=AppleAuthentication.formatFullName(credential.fullName);}
            catch{/* Fall back to the individual name components below. */}
          }
          const metadata=appleUserMetadata(credential.fullName,formattedName);
          if (metadata) {
            // Apple returns the name only on the first authorization. Persist it
            // immediately, but never invalidate an otherwise valid session if a
            // transient metadata write fails; onboarding still lets the user set
            // the name they want Kivelle to use.
            await supabase.auth.updateUser({data:metadata});
          }
          return;
        }

        const suffix = next ? `?next=${encodeURIComponent(next)}` : '';
        const redirectTo = authRedirectUrl(`/auth/callback${suffix}`);
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo,
            skipBrowserRedirect: Platform.OS !== 'web',
            queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
          },
        });
        if (error) throw error;
        if (Platform.OS === 'web') return;
        if (!data.url) throw new Error(`${provider === 'google' ? 'Google' : 'Apple'} sign-in could not be opened.`);
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, { showTitle: false });
        if (result.type === 'cancel' || result.type === 'dismiss') throw new Error('Sign-in was cancelled.');
        if (result.type !== 'success' || !result.url) throw new Error('Sign-in did not complete.');
        const callback = parseOAuthCallbackUrl(result.url);
        if (callback.error) throw new Error(callback.error);
        if (!callback.code) throw new Error('Sign-in callback did not include an authorization code.');
        const exchanged = await supabase.auth.exchangeCodeForSession(callback.code);
        if (exchanged.error) throw exchanged.error;
        if (!exchanged.data.session) throw new Error('Sign-in did not create a Kivelle session.');
      } catch (error) {
        throw new Error(socialAuthErrorMessage(provider, error));
      }
    },
    signUp: async (email, password) => {
      await createTogetherAccount(email, password);
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: authRedirectUrl() } });
      if (error) throw readableAuthError(error);
      return { needsEmailConfirmation: true };
    },
    resendSignUpConfirmation: async (email) => {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: authRedirectUrl() } });
      if (error) throw readableAuthError(error);
    },
    requestPasswordReset: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirectUrl('/reset-password') });
      if (error) throw readableAuthError(error);
    },
    signOut: async () => {
      setSigningOut(true);
      try {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) throw readableAuthError(error);
      } finally {
        setSigningOut(false);
      }
    },
    signOutOthers: async () => {
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) throw readableAuthError(error);
    },
    reauthenticate: async (password) => {
      const email = session?.user.email;
      if (!email) throw new Error('This account does not have an email address to verify.');
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw readableAuthError(error);
      if (!data.session) throw new Error('Your password could not be verified.');
    },
    updateEmail: async (email) => {
      const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: authRedirectUrl() });
      if (error) throw readableAuthError(error);
    },
    updatePassword: async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw readableAuthError(error);
    },
    resendPendingEmailChange: async () => {
      const pendingEmail = session?.user.new_email;
      if (!pendingEmail) throw new Error('There is no pending email change for this account.');
      const { error } = await supabase.auth.resend({ type: 'email_change', email: pendingEmail, options: { emailRedirectTo: authRedirectUrl() } });
      if (error) throw readableAuthError(error);
    },
  }), [loading, session, signingOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be inside AuthProvider');
  return value;
}
