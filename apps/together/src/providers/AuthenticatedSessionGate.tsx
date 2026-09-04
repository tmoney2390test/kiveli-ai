import { useEffect, useRef, type PropsWithChildren } from 'react';
import { router, usePathname } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { ErrorState } from '../components/RouteState';
import { RouteLoadingState } from '../components/RouteLoadingState';
import { resolveKivelleAccountStage } from '../lib/authRouting';
import { authenticatedShellEnabled } from '../lib/desktopNavigation';
import { isAgeConfirmationPath, isCompanionOnboardingPath, isPublicAppPath } from '../lib/sessionRouting';
import { ResponsiveAppShell } from '../shell/ResponsiveAppShell';
import { useTogether } from '../store/useTogether';
import { useAuth } from '../hooks/useAuth';
import { readSessionHeroUri, readSessionSnapshot, writeSessionSnapshot } from '../lib/sessionSnapshotCache';
import { authenticatedRoutePathname, consumeWebEntryHref, initialWebEntryHref, shouldConsumeWebEntry } from '../lib/webEntryRoute';
import { mostRecentlyUsedConversation } from '../lib/conversation';
import { prefetchConversationMessagePage } from '../lib/conversationMessageWarmup';
import { manageConversation } from '../lib/api';
import { prefetchProfileAvatarUrl } from '../hooks/useProfileAvatarUrl';

const demoMode = __DEV__ && process.env.EXPO_PUBLIC_TOGETHER_DEMO_MODE === 'true';

export function AuthenticatedSessionGate({ children }: PropsWithChildren) {
  const routerPathname = usePathname();
  const capturedEntryHref = Platform.OS === 'web' ? initialWebEntryHref() : null;
  const pathname = authenticatedRoutePathname({
    platform: Platform.OS,
    routerPathname,
    browserPathname: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.pathname : null,
    capturedEntryHref,
  });
  const { session }=useAuth();
  const { snapshot, loading, error, refresh, setSnapshot } = useTogether();
  const redirectTarget = useRef<string | null>(null);
  const hydrationUserId=useRef<string|null>(null);
  const publicPath = isPublicAppPath(pathname);
  const agePath = isAgeConfirmationPath(pathname);
  const companionOnboardingPath = isCompanionOnboardingPath(pathname);

  useEffect(() => {
    if (pathname === '/' || pathname === '/home') router.prefetch('/home' as never);
  }, [pathname]);

  useEffect(()=>{
    if(Platform.OS!=='web'||!session?.user.id)return;
    const heroUri=readSessionHeroUri(session.user.id);
    if(heroUri)void Image.prefetch(heroUri,'memory-disk').catch(()=>undefined);
  },[session?.user.id]);

  useEffect(()=>{
    const avatarPath=snapshot?.profile?.avatar_path;
    if(!avatarPath)return;
    let cancelled=false;
    void prefetchProfileAvatarUrl(avatarPath).then((uri)=>{
      if(!cancelled&&uri)return Image.prefetch(uri,'memory-disk').catch(()=>undefined);
      return undefined;
    });
    return()=>{cancelled=true;};
  },[snapshot?.profile?.avatar_path]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !session?.user.id || !snapshot) return;
    const recent = mostRecentlyUsedConversation(snapshot.conversations.filter((conversation) => conversation.kind !== 'group'));
    if (!recent) return;
    const timer = setTimeout(() => prefetchConversationMessagePage(session.user.id, recent.id, () => manageConversation({ action: 'messages', conversationId: recent.id, limit: 50 })), 150);
    return () => clearTimeout(timer);
  }, [session?.user.id, snapshot]);

  useEffect(() => {
    const userId=demoMode?'demo':session?.user.id;
    if(!userId||snapshot||loading||error||hydrationUserId.current===userId)return;
    hydrationUserId.current=userId;
    let cancelled=false;
    void (async()=>{
      const cached=!demoMode&&Platform.OS==='web'?await readSessionSnapshot(userId):null;
      if(cancelled)return;
      if(cached)setSnapshot(cached);
      await refresh({force:Boolean(cached)});
    })();
    return()=>{cancelled=true;};
  }, [error,loading,refresh,session?.user.id,setSnapshot,snapshot]);

  useEffect(()=>{
    const userId=session?.user.id;
    if(demoMode||Platform.OS!=='web'||!userId||!snapshot)return;
    const timer=setTimeout(()=>{void writeSessionSnapshot(userId,snapshot);},500);
    return()=>clearTimeout(timer);
  },[session?.user.id,snapshot]);

  useEffect(()=>{
    if(Platform.OS!=='web'||!snapshot)return;
    if(shouldConsumeWebEntry({entryHref:capturedEntryHref,browserPathname:pathname,routerPathname,snapshotReady:Boolean(snapshot)}))consumeWebEntryHref();
  },[capturedEntryHref,pathname,routerPathname,snapshot]);

  useEffect(() => {
    if (!snapshot || publicPath) return;
    const stage = resolveKivelleAccountStage(snapshot.profile);
    const target = stage === 'age_confirmation'
      ? (agePath ? null : '/age-confirmation')
      : stage === 'onboarding'
        ? (companionOnboardingPath ? null : '/choose-companion')
        : (agePath || companionOnboardingPath ? '/home' : null);
    if (!target) {
      redirectTarget.current = null;
      return;
    }
    if (redirectTarget.current !== target) {
      redirectTarget.current = target;
      if (Platform.OS === 'web') consumeWebEntryHref();
      router.replace(target as never);
    }
  }, [agePath, companionOnboardingPath, publicPath, snapshot]);

  let blocker = null;
  if (!snapshot && !publicPath) {
    blocker = error
      ? <ErrorState message={error} onRetry={() => void refresh()} />
      : <RouteLoadingState pathname={pathname} />;
  } else if (snapshot && !publicPath) {
    const stage = resolveKivelleAccountStage(snapshot.profile);
    if ((stage === 'age_confirmation' && !agePath) || (stage === 'onboarding' && !companionOnboardingPath) || (stage === 'ready' && (agePath || companionOnboardingPath))) {
      blocker = <RouteLoadingState pathname={pathname} label={stage === 'age_confirmation' ? 'Opening age confirmation…' : stage === 'onboarding' ? 'Preparing your first meeting…' : undefined} />;
    }
  }

  const accountStage=snapshot?resolveKivelleAccountStage(snapshot.profile):null;
  const shellEnabled=authenticatedShellEnabled(pathname,accountStage);
  return <>
    <ResponsiveAppShell enabled={shellEnabled}>{children}</ResponsiveAppShell>
    {blocker ? <View style={styles.blocker}>{blocker}</View> : null}
  </>;
}

const styles = StyleSheet.create({
  blocker: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1000, backgroundColor: '#080B13' },
});
