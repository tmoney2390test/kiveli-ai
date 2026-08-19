import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Body, ErrorState, LoadingSkeleton, Screen } from '../../src/components';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { safeAppReturnPath } from '../../src/lib/sessionRouting';

export default function AuthCallback() {
  const { code, error_description: errorDescription,next } = useLocalSearchParams<{ code?: string; error_description?: string;next?:string }>();
  const { session, loading } = useAuth();
  const [error, setError] = useState(errorDescription ?? '');
  useEffect(() => {
    if (loading) return;
    if (session) { router.replace((safeAppReturnPath(next)??'/') as never); return; }
    if (!code) { setError(errorDescription ?? 'The confirmation link is incomplete or has expired.'); return; }
    void supabase.auth.exchangeCodeForSession(code).then(({ error: exchangeError }) => { if (exchangeError) setError(exchangeError.message); else router.replace((safeAppReturnPath(next)??'/') as never); });
  }, [code, errorDescription, loading, next, session]);
  if (error) return <Screen contentStyle={{ minHeight: '100%', justifyContent: 'center' }}><ErrorState message={error} /><Body muted>Return to sign in to request a fresh confirmation link.</Body></Screen>;
  return <LoadingSkeleton label="Confirming your account…" />;
}
