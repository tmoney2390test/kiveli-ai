import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Body, ErrorState, LoadingSkeleton, Screen } from '../../src/components';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/hooks/useAuth';
import { resolvePostAuthDestination } from '../../src/lib/authRouting';
import { useTogether } from '../../src/store/useTogether';

export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string; next?: string }>();
  const { session, loading } = useAuth();
  const refresh = useTogether((state) => state.refresh);
  const processed = useRef(false);
  const routed = useRef(false);
  const [error, setError] = useState(params.error_description ?? params.error ?? '');

  useEffect(() => {
    if (loading || processed.current) return;
    processed.current = true;

    const finish = async () => {
      try {
        if (params.error_description || params.error) throw new Error(params.error_description ?? params.error);
        let authenticated = Boolean(session);
        if (!authenticated) {
          if (!params.code) throw new Error('The confirmation link is incomplete or has expired.');
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
          if (exchangeError) throw exchangeError;
          authenticated = Boolean(data.session);
        }
        if (!authenticated) throw new Error('The confirmation did not create a Kivelle session.');

        await refresh({ force: true });
        const state = useTogether.getState();
        if (!state.snapshot) throw new Error(state.error ?? 'Kivelle could not open your account.');
        const destination = resolvePostAuthDestination({ authenticated: true, snapshot: state.snapshot, requestedNext: params.next });
        if (!destination || routed.current) return;
        routed.current = true;
        router.replace(destination as never);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The sign-in confirmation could not be completed.');
      }
    };

    void finish();
  }, [loading, params.code, params.error, params.error_description, params.next, refresh, session]);

  if (error) return <Screen contentStyle={{ minHeight: '100%', justifyContent: 'center' }}><ErrorState message={error} /><Body muted>Return to sign in to request a fresh confirmation link.</Body></Screen>;
  return <LoadingSkeleton label="Confirming your account…" />;
}
