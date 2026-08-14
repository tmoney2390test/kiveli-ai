import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://mfysnlghlhxxcwnwpxog.supabase.co';
export const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_Xl2f_VYyGANt363KxCL9Tw_hakKuWEb';
export const supabase = createClient(supabaseUrl, supabasePublishableKey, { auth: { storage: Platform.OS === 'web' ? undefined : AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: Platform.OS === 'web', flowType: 'pkce' }, realtime: { params: { eventsPerSecond: 5 } } });
if (Platform.OS !== 'web') AppState.addEventListener('change', (state) => { if (state === 'active') void supabase.auth.startAutoRefresh(); else void supabase.auth.stopAutoRefresh(); });
