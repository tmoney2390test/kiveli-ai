import { useEffect, useRef, useState } from 'react';
import { Redirect } from 'expo-router';
import { LoadingSkeleton } from '../src/components';
import { useAuth } from '../src/hooks/useAuth';
import { useTogether } from '../src/store/useTogether';
import { bootstrap } from '../src/lib/api';
import { clearPendingOnboarding, loadPendingOnboarding } from '../src/lib/pendingOnboarding';

export default function Index() {
  const { session, loading: authLoading } = useAuth();
  const { snapshot, loading, refresh, setSnapshot } = useTogether();
  const [resuming, setResuming] = useState(false);
  const attempted = useRef(false);
  useEffect(() => {
    if (!session || snapshot || loading || attempted.current) return;
    attempted.current = true; setResuming(true);
    void loadPendingOnboarding().then(async (pending) => {
      if (pending) { const next = await bootstrap(pending); setSnapshot(next); await clearPendingOnboarding(); }
      else await refresh();
    }).catch(() => refresh()).finally(() => setResuming(false));
  }, [session, snapshot, loading, refresh, setSnapshot]);
  if (authLoading || loading || resuming || (session && !snapshot && !attempted.current)) return <LoadingSkeleton label="Opening City Life…" />;
  if (!session) return <Redirect href="/onboarding" />;
  if (!snapshot?.profile) return <Redirect href="/onboarding" />;
  return <Redirect href="/home" />;
}
