import 'react-native-url-polyfill/auto';
import { createClient, processLock } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { nativeAuthStorage } from './secureAuthStorage';

const configuredSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const configuredSupabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!configuredSupabaseUrl || !configuredSupabasePublishableKey) throw new Error('Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
export const supabaseUrl: string = configuredSupabaseUrl;
export const supabasePublishableKey: string = configuredSupabasePublishableKey;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : nativeAuthStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
    lock: processLock,
  },
  realtime: { params: { eventsPerSecond: 5 } },
});
if (Platform.OS !== 'web') AppState.addEventListener('change', (state) => { if (state === 'active') void supabase.auth.startAutoRefresh(); else void supabase.auth.stopAutoRefresh(); });
