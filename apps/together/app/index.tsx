import { Redirect } from 'expo-router';
import { ErrorState, LoadingSkeleton } from '../src/components';
import { PublicLandingPage } from '../src/components/landing/PublicLandingPage';
import { useAuth } from '../src/hooks/useAuth';
import { useTogether } from '../src/store/useTogether';
import { resolveKivelleAccountStage } from '../src/lib/authRouting';

export default function Index() {
  const { session, loading: authLoading } = useAuth();
  const { snapshot, loading, error, refresh } = useTogether();

  if (authLoading) return <LoadingSkeleton label="Opening Kivelle…" />;
  if (!session) return <PublicLandingPage />;
  if (loading || (!snapshot && !error)) return <LoadingSkeleton label="Opening your world…" />;
  if (error) return <ErrorState message={error} onRetry={() => void refresh()} />;
  const stage = resolveKivelleAccountStage(snapshot?.profile ?? null);
  if (stage === 'age_confirmation') return <Redirect href={'/age-confirmation' as never} />;
  if (stage === 'onboarding') return <Redirect href="/choose-companion" />;
  return <Redirect href="/home" />;
}
