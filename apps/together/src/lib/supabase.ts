import 'react-native-url-polyfill/auto';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { nativeAuthStorage } from './secureAuthStorage';

// Browser traffic deliberately uses the Kivelli gateway so it can receive a
// short-lived, server-signed web-surface assertion. Native builds use the
// direct Supabase origin and can never acquire that assertion by spoofing a
// header, query parameter, local setting, or user agent.
const configuredSupabaseUrl = Platform.OS === 'web'
  ? (process.env.EXPO_PUBLIC_SUPABASE_WEB_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL)
  : process.env.EXPO_PUBLIC_SUPABASE_NATIVE_URL;
const configuredSupabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!configuredSupabaseUrl || !configuredSupabasePublishableKey) throw new Error('Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_WEB_URL for web, EXPO_PUBLIC_SUPABASE_NATIVE_URL for iOS/Android, and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
if (Platform.OS !== 'web' && /(^|\.)kivelli\.app$/i.test(new URL(configuredSupabaseUrl).hostname)) throw new Error('Native builds must use the direct Supabase project URL, not the web gateway.');
export const supabaseUrl: string = configuredSupabaseUrl;
export const supabasePublishableKey: string = configuredSupabasePublishableKey;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : nativeAuthStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Expo Router owns the web callback pages. Auto-detection would race the
    // explicit exchange in /auth/callback and /reset-password, allowing one
    // exchange to consume the PKCE verifier while the other reports that it
    // is missing. Keep one deterministic owner for every callback instead.
    detectSessionInUrl: false,
    flowType: 'pkce',
    lock: processLock,
  },
  realtime: { params: { eventsPerSecond: 5 } },
});
if (Platform.OS !== 'web') AppState.addEventListener('change', (state) => { if (state === 'active') void supabase.auth.startAutoRefresh(); else void supabase.auth.stopAutoRefresh(); });
