import { Redirect } from 'expo-router';
import { ErrorState, LoadingSkeleton } from '../src/components';
import { PublicLandingPage } from '../src/components/landing/PublicLandingPage';
import { useAuth } from '../src/hooks/useAuth';
import { useTogether } from '../src/store/useTogether';

export default function Index() {
  const { session, loading: authLoading } = useAuth();
  const { snapshot, loading, error, refresh } = useTogether();

  if (authLoading) return <LoadingSkeleton label="Opening Kivelle…" />;
  if (!session) return <PublicLandingPage />;
  if (loading || (!snapshot && !error)) return <LoadingSkeleton label="Opening your world…" />;
  if (error) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!snapshot?.profile) return <Redirect href="/choose-companion" />;
  return <Redirect href="/home" />;
}
