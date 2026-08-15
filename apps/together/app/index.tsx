import { useEffect, useRef, useState } from 'react';
import { Redirect } from 'expo-router';
import { ErrorState, LoadingSkeleton } from '../src/components';
import { useAuth } from '../src/hooks/useAuth';
import { useTogether } from '../src/store/useTogether';
import { loadSnapshot } from '../src/lib/api';

export default function Index() {
  const { session, loading: authLoading } = useAuth();
  const { snapshot, setSnapshot } = useTogether();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsCompanion, setNeedsCompanion] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (!session || attempted.current) return;
    attempted.current = true;
    setLoading(true);
    void loadSnapshot()
      .then((existing) => {
        setSnapshot(existing);
        setNeedsCompanion(!existing.profile);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Kivelle could not open Juniper City.'))
      .finally(() => setLoading(false));
  }, [session, setSnapshot]);

  if (authLoading || loading || (session && !snapshot && !error)) return <LoadingSkeleton label="Opening Juniper City…" />;
  if (error) return <ErrorState message={error} />;
  if (!session) return <Redirect href="/auth" />;
  if (needsCompanion || !snapshot?.profile) return <Redirect href="/choose-companion" />;
  return <Redirect href="/home" />;
}
