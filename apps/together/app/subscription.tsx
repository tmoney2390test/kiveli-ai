import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { ScrollView as ScrollViewType } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Brain, Camera, Check, ChevronRight, CircleAlert, CreditCard, ExternalLink, Gift, Globe2, Heart, History, LockKeyhole, RefreshCw, ShieldCheck, Sparkles, UserRound, Zap } from 'lucide-react-native';
import { GradientButton, KivelleCreditIcon, LoadingSkeleton, Screen } from '../src/components';
import { subscriptionStatusQueryKey, useSubscriptionStatus } from '../src/hooks/useSubscriptionStatus';
import { useAuth } from '../src/hooks/useAuth';
import { ApiError, manageSubscription } from '../src/lib/api';
import { loadNativeProductPrices, nativePurchasesConfigured, purchaseNativeSubscription, restoreNativePurchases } from '../src/lib/nativePurchases';
import { revenueCatPackageIdentifiers, type PurchasableTier } from '../src/lib/revenueCatPurchases';
import { waitForAuthoritativeRestore } from '../src/lib/nativePurchaseSync';
import type { BillingInterval, CheckoutConfirmation, CreditActivityEvent, CreditPack, SubscriptionPlan, SubscriptionStatus, SubscriptionTier } from '../src/lib/subscription';
import { MembershipComparison, type MembershipPlanAction } from '../src/components/membership/MembershipComparison';
import { billingStatusPresentation, checkoutBackoffDelay, creditActivityPresentation, managementActionLabel, membershipBenefits, membershipMetrics, membershipPageMode, membershipPlanName, membershipPricePresentation, normalizeSubscriptionIntent, safeSubscriptionReturnTo, shouldShowSubscriptionIntentCallout, subscriptionIntentPresentation } from '../src/lib/subscriptionPresentation';
import { colors, radius } from '../src/theme';

type Notice = { tone: 'neutral' | 'success' | 'warning' | 'danger'; title: string; body: string; retry?: boolean };
const discoveryPortalBackground = require('../assets/membership/discovery-portal.webp');
const memberPortalBackground = require('../assets/membership/member-portal.webp');
const maxBenefitsBackground = require('../assets/membership/max-nebula.webp');

export default function Subscription() {
  const params = useLocalSearchParams<{ checkout?: string; purchase?: string; session_id?: string; billing?: string; intent?: string; source?: string; returnTo?: string; tier?: string }>();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const query = useSubscriptionStatus();
  const state = query.data ?? null;
  const { width, fontScale } = useWindowDimensions();
  const [contentWidth, setContentWidth] = useState(0);
  const compact = (contentWidth || width - 56) / Math.max(1, fontScale) < 860;
  const scrollRef = useRef<ScrollViewType>(null);
  const [plansY, setPlansY] = useState(0);
  const [creditsY, setCreditsY] = useState(0);
  const intent = normalizeSubscriptionIntent(params.intent, params.source);
  const intro = subscriptionIntentPresentation(intent);
  const returnTo = safeSubscriptionReturnTo(params.returnTo);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('annual');
  const [selectedCreditPack, setSelectedCreditPack] = useState<CreditPack['key'] | ''>('');
  const [compareOpen, setCompareOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmationRetry, setConfirmationRetry] = useState(0);
  const [nativePrices,setNativePrices]=useState<Record<string,string>>({});

  useEffect(()=>{const userId=session?.user.id;if(!userId||Platform.OS==='web'||!nativePurchasesConfigured())return;let active=true;void loadNativeProductPrices(userId).then((prices)=>{if(active)setNativePrices(prices);}).catch(()=>undefined);return()=>{active=false;};},[session?.user.id]);

  const refresh = useCallback(async () => {
    const result = await query.refetch();
    if (result.error) setNotice({ tone: 'danger', title: 'Could not refresh billing', body: result.error instanceof Error ? result.error.message : 'Try again in a moment.', retry: true });
  }, [query.refetch]);

  useEffect(() => {
    const packs = (state?.creditPacks ?? []).filter((pack) => pack.active && pack.checkoutConfigured);
    const preferred = packs.find((pack) => pack.popular) ?? packs[0];
    if (preferred && !packs.some((pack) => pack.key === selectedCreditPack)) setSelectedCreditPack(preferred.key);
  }, [selectedCreditPack, state?.creditPacks]);

  useEffect(() => {
    if (params.checkout === 'cancelled') {
      setNotice({ tone: 'neutral', title: 'Checkout cancelled', body: 'Nothing was charged. Your current plan and Credits are unchanged.' });
      router.setParams({ checkout: undefined, purchase: undefined, session_id: undefined });
      return;
    }
    if (params.billing === 'returned') {
      setNotice({ tone: 'neutral', title: 'Syncing billing changes', body: 'Refreshing your plan and renewal details…' });
      void query.refetch().then(() => setNotice({ tone: 'success', title: 'Billing details refreshed', body: 'Your current plan information is up to date.' })).catch(() => setNotice({ tone: 'warning', title: 'Changes are still syncing', body: 'Your billing provider may need another moment. Tap to refresh.', retry: true }));
      router.setParams({ billing: undefined });
    }
  }, [params.billing, params.checkout, query.refetch]);

  useEffect(() => {
    if (params.checkout !== 'success') return;
    const sessionId = params.session_id;
    if (!sessionId) {
      setNotice({ tone: 'warning', title: 'Purchase is still syncing', body: 'We could not verify the checkout automatically. Refresh your billing status before trying again.', retry: true });
      return;
    }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    setNotice({ tone: 'neutral', title: 'Confirming your purchase', body: 'Your plan or Credits will appear as soon as your payment is confirmed.' });
    const verify = async () => {
      if (disposed) return;
      try {
        const confirmation = await manageSubscription<CheckoutConfirmation>({ action: 'checkout_confirmation', sessionId });
        if (disposed) return;
        queryClient.setQueryData(subscriptionStatusQueryKey, confirmation.state);
        if (confirmation.outcome === 'succeeded') {
          const title = confirmation.purchase?.kind === 'credits' ? `${confirmation.purchase.creditsAdded.toLocaleString()} Credits added` : `${confirmation.state.capabilities.displayName} is active`;
          setNotice({ tone: 'success', title, body: returnTo ? 'Everything is ready. Continue where you left off.' : 'Your purchase is confirmed and ready to use.' });
          AccessibilityInfo.announceForAccessibility(`${title}. Your purchase is confirmed.`);
          router.setParams({ checkout: undefined, purchase: undefined, session_id: undefined });
          return;
        }
        if (confirmation.outcome === 'failed') {
          setNotice({ tone: 'danger', title: 'Payment was not completed', body: confirmation.failureReason ?? 'No plan access or Credits were applied.' });
          router.setParams({ checkout: undefined, purchase: undefined, session_id: undefined });
          return;
        }
      } catch {
        // Keep the current account summary visible while the signed webhook catches up.
      }
      attempt += 1;
      if (attempt < 8) timer = setTimeout(() => void verify(), checkoutBackoffDelay(attempt));
      else setNotice({ tone: 'warning', title: 'Confirmation is taking longer', body: 'Your payment may still be processing. Refresh safely—retries cannot create another purchase.', retry: true });
    };
    timer = setTimeout(() => void verify(), checkoutBackoffDelay(0));
    return () => { disposed = true; if (timer) clearTimeout(timer); };
  }, [confirmationRetry, params.checkout, params.purchase, params.session_id, queryClient, returnTo]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void query.refetch();
      if (params.checkout === 'success') setConfirmationRetry((value) => value + 1);
    });
    return () => subscription.remove();
  }, [params.checkout, query.refetch]);

  const openUrl = async (url: string) => {
    if (Platform.OS === 'web') {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('Your browser could not open the billing page.');
      await Linking.openURL(url);
      return;
    }
    await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET });
    await query.refetch();
  };

  const checkout = async (tier: Exclude<SubscriptionTier, 'free'>) => {
    if (!state) return;
    setBusy(tier); setNotice(null);
    try {
      if (Platform.OS === 'web') throw new Error('New memberships are available in the Kivelli iOS and Android apps. Existing App Store and Google Play memberships still work here.');
      if (!nativePurchasesConfigured()) throw new Error('App-store billing is not configured in this build.');
      const userId=session?.user.id;if(!userId)throw new Error('Sign in before purchasing a membership.');
      const purchase=await purchaseNativeSubscription(userId,tier,billingInterval);
      if(purchase.cancelled){setNotice({tone:'neutral',title:'Purchase cancelled',body:'Nothing was charged and your current membership is unchanged.'});return;}
      if(purchase.pending){setNotice({tone:'neutral',title:'Waiting for store approval',body:'Your purchase is pending. Kivelli will securely activate the membership after the app store confirms it; you do not need to purchase again.'});return;}
      setNotice({tone:'neutral',title:'Confirming your membership',body:'The app store approved the purchase. Kivelli is securely syncing your benefits now.'});
      const synced=await waitForNativeTier(query.refetch,tier);
      setNotice(synced?{tone:'success',title:`${tier==='kivelle_max'?'Kivelli Max':'Kivelli+'} is active`,body:'Your app-store membership and benefits are ready.'}:{tone:'warning',title:'Purchase received',body:'The app store completed your purchase, but your membership is still syncing. Refresh in a moment—trying again will not charge you twice.',retry:true});
    }
    catch (caught) { setNotice({ tone: 'danger', title: 'Could not open checkout', body: billingErrorMessage(caught) }); }
    finally { setBusy(''); }
  };

  const restorePurchases = async () => {
    const userId=session?.user.id;if(!userId)return;
    setBusy('restore');setNotice(null);
    try{
      const storeResult=await restoreNativePurchases(userId);
      setNotice({tone:'neutral',title:'Checking past purchases',body:'The app store finished restoring. Kivelli is checking your membership status.'});
      const result=await waitForAuthoritativeRestore(query.refetch);
      setNotice(result.state==='active'&&result.data?{tone:'success',title:`${result.data.capabilities.displayName} restored`,body:'Your membership and benefits are available again.'}:result.state==='syncing'||storeResult.storeReportsActiveEntitlement?{tone:'warning',title:'Membership is still syncing',body:'The store reported a purchase, but Kivelli is still verifying your membership. Your restore will resume automatically; trying again will not charge you.',retry:true}:{tone:'neutral',title:'Restore complete',body:'After checking the store and your account, no active membership was found for this store account.'});
    }catch(caught){setNotice({tone:'danger',title:'Could not restore purchases',body:billingErrorMessage(caught),retry:true});}
    finally{setBusy('');}
  };

  const openManagement = async () => {
    if (!state) return;
    if (state.management.manageAction === 'app_store') {
      if (state.billing.store === 'app_store') await openUrl('https://apps.apple.com/account/subscriptions');
      else if (state.billing.store === 'play_store') await openUrl('https://play.google.com/store/account/subscriptions');
      else setNotice({ tone: 'neutral', title: 'Managed in the original app store', body: 'Kivelli could not verify which store originated this membership. Open subscriptions in the Apple App Store or Google Play account used for purchase.' });
      return;
    }
    setBusy('portal'); setNotice(null);
    try { const result = await manageSubscription<{ url: string }>({ action: 'portal', requestId: Crypto.randomUUID() }); await openUrl(result.url); }
    catch (caught) { setNotice({ tone: 'danger', title: 'Could not open subscription management', body: billingErrorMessage(caught) }); }
    finally { setBusy(''); }
  };

  const buyCredits = async (pack: CreditPack) => {
    setBusy(pack.key); setNotice(null);
    try { const result = await manageSubscription<{ url: string }>({ action: 'credits_checkout', productKey: pack.key, requestId: Crypto.randomUUID() }); await openUrl(result.url); }
    catch (caught) { setNotice({ tone: 'danger', title: 'Could not open credit checkout', body: billingErrorMessage(caught) }); }
    finally { setBusy(''); }
  };

  const scrollTo = (offset: number) => scrollRef.current?.scrollTo({ y: Math.max(0, offset - 20), animated: true });

  if (query.isPending && !state) return <LoadingSkeleton label="Loading your membership…" />;
  if (!state) return <Screen><PageHeader returnTo={returnTo} refreshing={query.isFetching} onRefresh={() => void refresh()} /><View style={styles.errorCard}><Text style={styles.error}>{query.error instanceof Error ? query.error.message : 'Membership details are unavailable.'}</Text><GradientButton label="Try again" onPress={() => void refresh()} /></View></Screen>;

  const currentPlan = state.capabilities;
  const mode = membershipPageMode(state.tier);
  const nativeStoreCheckout=Platform.OS!=='web'&&nativePurchasesConfigured();
  const planActionFor = (plan: SubscriptionPlan): MembershipPlanAction | null => {
    if (plan.tier === state.tier) return null;
    if (state.tier !== 'free') return { label: plan.tier === 'free' ? 'Manage membership' : plan.tier === 'kivelle_max' ? 'Upgrade to Max' : 'Change plan', enabled: state.management.canManageSubscription, reason: state.management.managementReason, onPress: () => void openManagement() };
    const webStoreOnly=Platform.OS==='web';
    return { label: webStoreOnly?'Join in the app':`Choose ${membershipPlanName(plan)}`, enabled:nativeStoreCheckout, reason:webStoreOnly?'New memberships are available in Kivelli for iOS and Android. Existing App Store and Google Play memberships still work here.':'App-store billing is not configured in this build.', onPress: () => void checkout(plan.tier as Exclude<SubscriptionTier, 'free'>) };
  };
  const comparison = <View onLayout={event => setPlansY(event.nativeEvent.layout.y)}><MembershipComparison plans={state.catalog} currentTier={state.tier} billingInterval={billingInterval} onIntervalChange={setBillingInterval} nativePrices={nativePrices} actionFor={planActionFor} busy={Boolean(busy)} expanded={compareOpen} onExpandedChange={setCompareOpen} /></View>;

  return (
    <Screen scrollRef={scrollRef} contentStyle={styles.content}>
      <View onLayout={event => setContentWidth(event.nativeEvent.layout.width)} style={styles.pageLayout}>
      <PageHeader returnTo={returnTo} refreshing={query.isFetching} onRefresh={() => void refresh()} />
      <MembershipTitle mode={mode} refreshing={query.isFetching} updatedAt={query.dataUpdatedAt} />
      {notice ? <NoticeCard notice={notice} onRetry={() => { setNotice(null); if (params.checkout === 'success') setConfirmationRetry((value) => value + 1); else void refresh(); }} onContinue={notice.tone === 'success' && returnTo ? () => router.replace(returnTo as never) : undefined} /> : null}
      {query.error && !notice ? <NoticeCard notice={{ tone: 'warning', title: 'Showing your last known billing details', body: 'Kivelli could not refresh this page. Your cached membership remains visible while you reconnect.', retry: true }} onRetry={() => void refresh()} /> : null}
      {state.billing.paymentIssue ? <NoticeCard notice={{ tone: 'warning', title: 'Payment needs attention', body: 'Update your payment method to keep paid benefits active through the grace period.' }} onContinue={state.management.canManageSubscription ? () => void openManagement() : undefined} continueLabel={managementActionLabel(state.management)} /> : null}
      {shouldShowSubscriptionIntentCallout(mode, intent) ? <IntentCallout eyebrow={intro.eyebrow} title={intro.title} body={intro.body} /> : null}

      {mode === 'discovery' ? <>
        <DiscoveryHero compact={compact} onExplore={() => scrollTo(plansY)} onCompare={() => { setCompareOpen(true); scrollTo(plansY); }} />
        {comparison}
        <TrustStrip compact={compact} />
        <View onLayout={(event) => setCreditsY(event.nativeEvent.layout.y)}><CreditWalletCard state={state} showActivity /></View>
      </> : <>
        <MemberHero state={state} plan={currentPlan} compact={compact} localizedPrice={state.tier === 'free' ? undefined : nativePrices[revenueCatPackageIdentifiers[state.tier as PurchasableTier][state.billing.billingInterval ?? 'monthly']]} busy={busy === 'portal'} onManage={state.management.canManageSubscription ? () => void openManagement() : undefined} onBuyCredits={state.management.canPurchaseCredits ? () => scrollTo(creditsY) : undefined} />
        <MembershipMetrics plan={currentPlan} compact={compact} />
        <View style={[styles.dashboardGrid, compact && styles.stack]}><BenefitsCard plan={currentPlan} entitlementKeys={state.entitlementKeys} /><CreditWalletCard state={state} /></View>
        <View onLayout={(event) => setCreditsY(event.nativeEvent.layout.y)}><CreditShop state={state} selectedKey={selectedCreditPack} busy={busy} onSelect={setSelectedCreditPack} onBuy={(pack) => void buyCredits(pack)} /></View>
        <RecentActivityCard activity={state.creditActivity} />
        {comparison}
      </>}

      {nativeStoreCheckout?<Pressable accessibilityRole="button" accessibilityLabel="Restore app-store purchases" accessibilityState={{disabled:busy==='restore'}} disabled={busy==='restore'} onPress={()=>void restorePurchases()} style={({pressed})=>[styles.restoreButton,pressed&&styles.pressed,busy==='restore'&&styles.disabled]}><RefreshCw size={16} color={colors.violet}/><Text style={styles.restoreText}>{busy==='restore'?'Restoring purchases…':'Restore purchases'}</Text></Pressable>:null}
      <View style={styles.policyLinks}><PolicyLink label="Terms" route="/terms" /><PolicyLink label="Privacy" route="/privacy-policy" /><PolicyLink label="Refunds & cancellation" route="/refund-policy" /><PolicyLink label="Support" route="/support" /></View>
      </View>
    </Screen>
  );
}

function PageHeader({ returnTo, refreshing, onRefresh }: { returnTo: string | null; refreshing: boolean; onRefresh: () => void }) {
  return <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={() => returnTo ? router.replace(returnTo as never) : router.canGoBack() ? router.back() : router.replace('/settings')} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><ArrowLeft color={colors.text} /></Pressable><Text style={styles.headerLabel}>SETTINGS / MEMBERSHIP</Text><Pressable accessibilityRole="button" accessibilityLabel={refreshing ? 'Refreshing membership status' : 'Refresh membership status'} accessibilityState={{ disabled: refreshing }} disabled={refreshing} hitSlop={8} onPress={onRefresh} style={({ pressed }) => [styles.iconButton, refreshing && styles.disabled, pressed && styles.pressed]}><RefreshCw size={20} color={colors.text} /></Pressable></View>;
}

function MembershipTitle({ mode, refreshing, updatedAt }: { mode: 'discovery' | 'member'; refreshing: boolean; updatedAt: number }) {
  return <View style={styles.titleBlock}><Text accessibilityRole="header" style={styles.pageTitle}>{mode === 'member' ? 'Your Kivelli membership' : 'Membership'}</Text><View style={styles.titleMeta}><Text style={styles.pageSubtitle}>{mode === 'member' ? 'Everything in your plan, Credits, and billing—at a glance.' : 'Choose how deeply you want to experience Kivelli.'}</Text><Text style={styles.updated}>{refreshing ? 'Refreshing…' : updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Live account details'}</Text></View></View>;
}

function IntentCallout({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <View style={styles.intentCallout}><Sparkles size={18} color={colors.rose} /><View style={{ flex: 1 }}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.intentTitle}>{title}</Text><Text style={styles.intentBody}>{body}</Text></View></View>;
}

function DiscoveryHero({ compact, onExplore, onCompare }: { compact: boolean; onExplore: () => void; onCompare: () => void }) {
  return <View style={[styles.heroCard, compact && styles.heroCardCompact]}><Image source={discoveryPortalBackground} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" cachePolicy="memory-disk" /><View pointerEvents="none" style={[styles.heroImageScrim, compact && styles.heroImageScrimCompact]} /><View style={[styles.heroContent, compact && styles.heroContentCompact]}><StatusPill label="KIVELLI FREE" tone="neutral" /><Text accessibilityRole="header" style={[styles.heroTitle, compact && styles.heroTitleCompact]}>Your next world is waiting.</Text><Text style={styles.heroCopy}>Give your connections more room to grow, with deeper memory, daily photos, and more companions to share your worlds with.</Text><View style={styles.heroActions}><Pressable accessibilityRole="button" onPress={onExplore} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>Explore memberships</Text><ChevronRight size={19} color="#fff" /></Pressable><Pressable accessibilityRole="button" onPress={onCompare} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>Compare benefits</Text><ChevronRight size={17} color={colors.rose} /></Pressable></View><View style={styles.safetyLine}><ShieldCheck size={18} color={colors.success} /><Text style={styles.safetyText}>Your existing connections stay with your account.</Text></View></View></View>;
}

function MemberHero({ state, plan, compact, localizedPrice, busy, onManage, onBuyCredits }: { state: SubscriptionStatus; plan: SubscriptionPlan; compact: boolean; localizedPrice?: string; busy: boolean; onManage?: () => void; onBuyCredits?: () => void }) {
  const status = billingStatusPresentation(state);
  const interval = state.billing.billingInterval ?? 'monthly';
  const price = membershipPricePresentation(plan, interval, localizedPrice);
  return <View style={[styles.memberHero, compact && styles.memberHeroCompact]}><Image source={memberPortalBackground} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" cachePolicy="memory-disk" /><View pointerEvents="none" style={[styles.memberHeroScrim, compact && styles.memberHeroScrimCompact]} /><View style={[styles.memberHeroLayout, compact && styles.memberHeroLayoutCompact]}><View style={styles.memberPlanColumn}><StatusPill label={status.label.toUpperCase()} tone={status.tone} /><Text accessibilityRole="header" style={styles.memberPlanName}>{membershipPlanName(plan)}</Text>{state.management.mode !== 'kivelle' ? <View style={styles.priceRow}><Text style={styles.memberPrice}>{price.primary}</Text><Text style={styles.memberPeriod}>{price.period}</Text></View> : null}<Text style={styles.memberBilling}>{state.management.mode === 'kivelle' ? status.detail : `${price.detail} · ${state.management.label}${!localizedPrice ? ' · USD catalog price' : ''}`}</Text>{status.date && status.dateLabel ? <Text style={styles.renewalLine}>{status.dateLabel} {formatDate(status.date)}</Text> : null}<View style={styles.memberActions}>{onBuyCredits ? <Pressable accessibilityRole="button" onPress={onBuyCredits} style={({ pressed }) => [styles.primaryButton, styles.memberActionButton, pressed && styles.pressed]}><KivelleCreditIcon size={19} /><Text style={styles.primaryButtonText}>Buy more Credits</Text></Pressable> : null}{onManage ? <Pressable accessibilityRole="button" disabled={busy} onPress={onManage} style={({ pressed }) => [styles.secondaryButton, styles.memberActionButton, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>{busy ? 'Opening billing…' : managementActionLabel(state.management)}</Text><ExternalLink size={16} color={colors.text} /></Pressable> : null}</View></View><MemberCreditSummary state={state} plan={plan} compact={compact} /></View></View>;
}

function MemberCreditSummary({ state, plan, compact }: { state: SubscriptionStatus; plan: SubscriptionPlan; compact: boolean }) {
  const permanent = Math.max(0, state.creditBalance.permanentBalance);
  const subscription = Math.max(0, state.creditBalance.subscriptionBalance);
  const total = Math.max(0, state.creditBalance.total);
  const nextGrant = plan.monthlyCreditGrant > 0
    ? state.nextCreditGrantAt
      ? `Next monthly grant: ${plan.monthlyCreditGrant.toLocaleString()} Credits on ${formatShortDate(state.nextCreditGrantAt)}`
      : `${plan.monthlyCreditGrant.toLocaleString()} Credits included in your monthly plan`
    : 'No monthly Credit grant on this plan';
  return <View style={[styles.memberCreditColumn, compact && styles.memberCreditColumnCompact]}><Text style={styles.memberCreditEyebrow}>AVAILABLE CREDITS</Text><View style={styles.memberCreditTotalRow}><Text accessibilityLabel={`${total.toLocaleString()} available Credits`} style={styles.memberCreditTotal}>{total.toLocaleString()}</Text><KivelleCreditIcon size={44} /></View><View accessibilityRole="progressbar" accessibilityLabel={`${permanent.toLocaleString()} permanent Credits and ${subscription.toLocaleString()} plan Credits`} accessibilityValue={{ min: 0, max: Math.max(1, total), now: permanent }} style={styles.memberCreditTrack}>{total > 0 ? <>{permanent > 0 ? <View style={[styles.memberCreditPermanentFill, { flex: permanent }]} /> : null}{subscription > 0 ? <View style={[styles.memberCreditPlanFill, { flex: subscription }]} /> : null}</> : <View style={styles.memberCreditEmptyFill} />}</View><View style={styles.memberCreditBreakdown}><View style={styles.memberCreditBreakdownItem}><View style={[styles.memberCreditDot, styles.memberCreditPermanentDot]} /><View><Text style={styles.memberCreditAmount}>{permanent.toLocaleString()}</Text><Text style={styles.memberCreditKind}>permanent</Text></View></View><View style={styles.memberCreditBreakdownItem}><View style={[styles.memberCreditDot, styles.memberCreditPlanDot]} /><View><Text style={styles.memberCreditAmount}>{subscription.toLocaleString()}</Text><Text style={styles.memberCreditKind}>plan Credits</Text></View></View></View><View style={styles.memberGrantLine}><Gift size={16} color="#F1C9E7" /><Text style={styles.memberGrantText}>{nextGrant}</Text></View></View>;
}

function MembershipMetrics({ plan, compact }: { plan: SubscriptionPlan; compact: boolean }) {
  const icons = { lives: Heart, companions: UserRound, photos: Camera } as const;
  return <View style={[styles.metricsRow, compact && styles.stack]}>{membershipMetrics(plan).map((metric) => { const Icon = icons[metric.key]; return <View key={metric.key} style={styles.metricCard}><Icon size={32} strokeWidth={1.5} color={colors.rose} /><View style={styles.metricRule} /><Text style={styles.metricValue}>{metric.value}</Text><View style={{ flex: 1 }}><Text style={styles.metricLabel}>{metric.label}</Text><Text style={styles.metricDetail}>{metric.detail}</Text></View></View>; })}</View>;
}

function BenefitsCard({ plan, entitlementKeys }: { plan: SubscriptionPlan; entitlementKeys: string[] }) {
  const icons = [Sparkles, Brain, Camera, Zap, Globe2, ShieldCheck] as const;
  return <View style={[styles.dashboardCard, styles.benefitsCard]}>{plan.tier === 'kivelle_max' ? <><Image source={maxBenefitsBackground} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" cachePolicy="memory-disk" /><View pointerEvents="none" style={styles.benefitsImageScrim} /></> : null}<Text style={[styles.dashboardTitle, styles.cardForeground]}>Your membership benefits</Text><View style={[styles.benefitList, styles.cardForeground]}>{membershipBenefits(plan, entitlementKeys).map((benefit, index) => { const Icon = icons[index] ?? Check; return <View key={benefit} style={styles.benefitRow}><View style={styles.benefitIcon}><Icon size={19} color="#F2C8EA" /></View><Text style={styles.benefitText}>{benefit}</Text><Check size={19} color={colors.success} /></View>; })}</View></View>;
}

function CreditWalletCard({ state, showActivity = false }: { state: SubscriptionStatus; showActivity?: boolean }) {
  const plan = state.capabilities;
  return <View style={styles.dashboardCard}><View style={styles.cardHeading}><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.dashboardTitle}>Your credit wallet</Text><Text style={styles.cardCopy}>Permanent Credits are always spent after expiring plan Credits.</Text></View><KivelleCreditIcon size={34} /></View><WalletRow label="Permanent Credits" value={state.creditBalance.permanentBalance} detail="No expiration" tone="rose" /><WalletRow label="Plan Credits" value={state.creditBalance.subscriptionBalance} detail={state.creditBalance.subscriptionExpiresAt ? `Available through ${formatDate(state.creditBalance.subscriptionExpiresAt)}` : state.tier === 'free' ? 'Starts with a membership' : `Rollover cap ${plan.subscriptionCreditRolloverCap.toLocaleString()}`} tone="violet" /><WalletRow label="Monthly grant" value={plan.monthlyCreditGrant} detail={state.tier === 'free' ? 'Paused' : state.nextCreditGrantAt ? `Next grant ${formatDate(state.nextCreditGrantAt)}` : 'Included with your plan'} tone="warm" />{showActivity ? <><View style={styles.cardDivider} /><RecentActivity activity={state.creditActivity} /></> : null}</View>;
}

function WalletRow({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: 'rose' | 'violet' | 'warm' }) { return <View style={styles.walletRow}><View style={[styles.walletRowIcon, tone === 'violet' && styles.walletRowViolet, tone === 'warm' && styles.walletRowWarm]}><KivelleCreditIcon size={20} /></View><View style={{ flex: 1 }}><Text style={styles.walletRowLabel}>{label}</Text><Text style={styles.walletRowDetail}>{detail}</Text></View><Text style={styles.walletRowValue}>{value.toLocaleString()}</Text></View>; }

function TrustStrip({ compact }: { compact: boolean }) {
  const items = [{ icon: RefreshCw, title: 'Cancel anytime', copy: 'Turn off your next renewal.' }, { icon: ShieldCheck, title: 'Permanent Credits stay yours', copy: 'Purchased Credits do not expire.' }, { icon: LockKeyhole, title: 'Secure billing', copy: 'Payments are handled by your billing provider.' }];
  return <View style={[styles.trustStrip, compact && styles.stack]}>{items.map(({ icon: Icon, title, copy }) => <View key={title} style={styles.trustItem}><View style={styles.trustIcon}><Icon size={23} color="#E7D7FF" /></View><View style={{ flex: 1 }}><Text style={styles.trustTitle}>{title}</Text><Text style={styles.trustCopy}>{copy}</Text></View></View>)}</View>;
}

function CreditShop({ state, selectedKey, busy, onSelect, onBuy }: { state: SubscriptionStatus; selectedKey: CreditPack['key'] | ''; busy: string; onSelect: (key: CreditPack['key']) => void; onBuy: (pack: CreditPack) => void }) {
  const packs = state.creditPacks.filter((pack) => pack.active);
  const selected = packs.find((pack) => pack.key === selectedKey);
  return <View style={styles.creditShop}><View style={styles.cardHeading}><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.eyebrow}>ADD KIVELLI CREDITS</Text><Text style={styles.dashboardTitle}>Keep creating</Text><Text style={styles.cardCopy}>Use Credits for generated photos, video, voice, and other priced media actions.</Text></View><KivelleCreditIcon size={40} /></View>{state.management.canPurchaseCredits && packs.length ? <><View accessibilityRole="radiogroup" accessibilityLabel="Credit packs" style={styles.packGrid}>{packs.map((pack) => <Pressable key={pack.key} accessibilityRole="radio" accessibilityState={{ checked: selectedKey === pack.key }} onPress={() => onSelect(pack.key)} style={[styles.packCard, selectedKey === pack.key && styles.packSelected]}>{pack.popular ? <Text style={styles.packBadge}>POPULAR</Text> : null}<View style={styles.packCreditRow}><KivelleCreditIcon size={20} /><Text style={styles.packCredits}>{pack.credits.toLocaleString()}</Text></View><Text style={styles.packPrice}>{pack.displayPrice || formatCurrency(pack.priceUsd)}</Text></Pressable>)}</View>{selected ? <Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={() => onBuy(selected)} style={({ pressed }) => [styles.primaryButton, styles.buyButton, Boolean(busy) && styles.disabled, pressed && styles.pressed]}><CreditCard size={18} color="#fff" /><Text style={styles.primaryButtonText}>{busy === selected.key ? 'Opening secure checkout…' : `Buy ${selected.credits.toLocaleString()} Credits · ${selected.displayPrice || formatCurrency(selected.priceUsd)}`}</Text></Pressable> : null}</> : <View style={styles.unavailableAction}><ShieldCheck size={18} color={colors.success} /><Text style={styles.unavailableText}>{state.management.creditPurchaseReason ?? 'Credit purchases are not available for this account.'}</Text></View>}</View>;
}

function RecentActivityCard({ activity }: { activity: CreditActivityEvent[] }) { return <View style={styles.dashboardCard}><View style={styles.cardHeading}><Text style={styles.dashboardTitle}>Recent credit activity</Text><History size={21} color={colors.rose} /></View><RecentActivity activity={activity} /></View>; }
function RecentActivity({ activity }: { activity: CreditActivityEvent[] }) { if (!activity.length) return <Text style={styles.emptyActivity}>No recent credit activity yet.</Text>; return <View>{activity.slice(0, 8).map((event) => <ActivityRow key={event.id} event={event} />)}</View>; }
function ActivityRow({ event }: { event: CreditActivityEvent }) { const item = creditActivityPresentation(event); return <View style={styles.activityRow}><View style={styles.activityIcon}>{item.amount >= 0 ? <Gift size={17} color={colors.rose} /> : <KivelleCreditIcon size={17} />}</View><View style={{ flex: 1 }}><Text style={styles.activityLabel}>{item.label}</Text><Text style={styles.activityDetail}>{new Date(event.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {item.detail}</Text></View><Text style={[styles.activityAmount, item.amount > 0 && styles.activityPositive]}>{item.amount > 0 ? '+' : ''}{item.amount.toLocaleString()}</Text></View>; }

function StatusPill({ label, tone }: { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }) { return <View style={[styles.statusPill, tone === 'success' && styles.statusSuccess, tone === 'warning' && styles.statusWarning, tone === 'danger' && styles.statusDanger]}><View style={[styles.statusDot, tone === 'success' && styles.statusDotSuccess, tone === 'warning' && styles.statusDotWarning, tone === 'danger' && styles.statusDotDanger]} /><Text style={styles.statusText}>{label}</Text></View>; }

function NoticeCard({ notice, onRetry, onContinue, continueLabel = 'Continue' }: { notice: Notice; onRetry?: () => void; onContinue?: () => void; continueLabel?: string }) {
  return <View accessibilityLiveRegion="polite" style={[styles.notice, notice.tone === 'success' && styles.noticeSuccess, notice.tone === 'warning' && styles.noticeWarning, notice.tone === 'danger' && styles.noticeDanger]}><View style={styles.noticeTop}>{notice.tone === 'danger' || notice.tone === 'warning' ? <CircleAlert size={18} color={notice.tone === 'danger' ? colors.danger : colors.warm} /> : notice.tone === 'success' ? <Check size={18} color={colors.success} /> : <RefreshCw size={17} color={colors.violet} />}<View style={{ flex: 1 }}><Text style={styles.noticeTitle}>{notice.title}</Text><Text style={styles.noticeCopy}>{notice.body}</Text></View></View>{notice.retry && onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={styles.noticeAction}><Text style={styles.noticeActionText}>Refresh status</Text></Pressable> : null}{onContinue && continueLabel ? <Pressable accessibilityRole="button" onPress={onContinue} style={styles.noticeAction}><Text style={styles.noticeActionText}>{continueLabel}</Text><ChevronRight size={16} color="#E5C7F1" /></Pressable> : null}</View>;
}

function PolicyLink({ label, route }: { label: string; route: string }) { return <Pressable accessibilityRole="link" onPress={() => router.push(route as never)} style={({ pressed }) => [styles.policyLinkTarget, pressed && styles.pressed]}><Text style={styles.policyLink}>{label}</Text></Pressable>; }
function formatDate(value: string | null): string { if (!value) return 'Not scheduled'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Not scheduled' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function formatShortDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'your next renewal' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function formatCurrency(value: number): string { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value); } catch { return `$${value.toFixed(2)}`; } }
function billingErrorMessage(caught: unknown): string { if (caught instanceof ApiError) return `${caught.message}${caught.correlationId ? ` Support reference: ${caught.correlationId}.` : ''}`; return caught instanceof Error ? caught.message : 'Please try again.'; }

const styles = StyleSheet.create({
  content: { gap: 28, maxWidth: 1280, paddingBottom: 56 },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerLabel: { flex: 1, color: colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1.2 },
  iconButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: .84, transform: [{ scale: .992 }] },
  disabled: { opacity: .5 },
  titleBlock: { gap: 10, paddingHorizontal: 0 },
  pageTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 40, lineHeight: 50 },
  titleMeta: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  pageSubtitle: { flexShrink: 1, color: colors.muted, fontSize: 16, lineHeight: 24 },
  updated: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  eyebrow: { color: colors.rose, fontSize: 12, fontWeight: "600", letterSpacing: 1.25 },
  intentCallout: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 15, borderRadius: radius.lg, backgroundColor: 'rgba(154,99,215,.09)', borderWidth: 1, borderColor: 'rgba(175,162,255,.24)' },
  intentTitle: { color: colors.text, fontSize: 15, fontWeight: "600", marginTop: 4 },
  intentBody: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 4 },
  heroCard: { position: 'relative', minHeight: 272, overflow: 'hidden', justifyContent: 'center', padding: 32, borderRadius: 24, backgroundColor: '#160B19', borderWidth: 1, borderColor: '#4F375C' },
  heroCardCompact: { minHeight: 320, padding: 24 },
  heroImageScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(7,3,10,.12)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(90deg, rgba(7,3,10,.98) 0%, rgba(12,5,15,.88) 42%, rgba(12,5,15,.15) 72%, rgba(7,3,10,.05) 100%)' } as never) : {}) },
  heroImageScrimCompact: { backgroundColor: 'rgba(7,3,10,.62)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(90deg, rgba(7,3,10,.94), rgba(7,3,10,.55))' } as never) : {}) },
  heroContent: { zIndex: 2, maxWidth: 610, gap: 14 },
  heroContentCompact: { maxWidth: '100%' },
  heroTitle: { color: '#FFF5EC', fontFamily: 'Georgia', fontSize: 41, lineHeight: 62 },
  heroTitleCompact: { fontSize: 34, lineHeight: 51 },
  heroCopy: { maxWidth: 520, color: '#E8DDE4', fontSize: 16, lineHeight: 25 },
  heroActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 3 },
  primaryButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, backgroundColor: '#7D4BAB' },
  primaryButtonText: { flexShrink: 1, color: '#fff', fontSize: 15, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
  secondaryButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,.22)' },
  secondaryButtonText: { flexShrink: 1, color: colors.text, fontSize: 14, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
  safetyLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,.12)' },
  safetyText: { flex: 1, color: colors.muted, fontSize: 14, lineHeight: 21 },
  statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(216,62,234,.16)', borderWidth: 1, borderColor: 'rgba(244,124,181,.18)' },
  statusSuccess: { backgroundColor: 'rgba(42,183,124,.16)', borderColor: 'rgba(91,225,163,.22)' },
  statusWarning: { backgroundColor: 'rgba(222,166,75,.13)', borderColor: 'rgba(233,176,86,.25)' },
  statusDanger: { backgroundColor: 'rgba(211,92,94,.14)', borderColor: 'rgba(211,92,94,.26)' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.rose },
  statusDotSuccess: { backgroundColor: '#4FE19E' },
  statusDotWarning: { backgroundColor: colors.warm },
  statusDotDanger: { backgroundColor: colors.danger },
  statusText: { color: colors.text, fontSize: 12, fontWeight: "600", letterSpacing: .7 },
  stack: { flexDirection: 'column' },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 6 },
  unavailableAction: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)' },
  unavailableText: { flex: 1, color: colors.muted, fontSize: 14, lineHeight: 21 },
  trustStrip: { flexDirection: 'row', gap: 16, paddingVertical: 12 },
  trustItem: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 8 },
  trustIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  trustTitle: { color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  trustCopy: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 4 },
  memberHero: { position: 'relative', minHeight: 330, overflow: 'hidden', justifyContent: 'center', padding: 32, borderRadius: 24, backgroundColor: '#180B1A', borderWidth: 1, borderColor: '#574265' },
  memberHeroCompact: { padding: 24 },
  memberHeroScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(6,3,9,.13)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(90deg, rgba(6,3,9,.99) 0%, rgba(11,5,14,.96) 52%, rgba(11,5,14,.68) 72%, rgba(7,3,10,.04) 100%)' } as never) : {}) },
  memberHeroScrimCompact: { backgroundColor: 'rgba(7,3,10,.72)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(90deg, rgba(7,3,10,.97), rgba(7,3,10,.7))' } as never) : {}) },
  memberHeroLayout: { zIndex: 2, width: '88%', flexDirection: 'row', alignItems: 'stretch', gap: 28 },
  memberHeroLayoutCompact: { width: '100%', flexDirection: 'column', gap: 24 },
  memberPlanColumn: { flex: 1.08, minWidth: 0, gap: 8 },
  memberPlanName: { color: '#FFF5EA', fontFamily: 'Georgia', fontSize: 39, lineHeight: 59 },
  memberPrice: { color: '#FFF5EA', fontFamily: 'Georgia', fontSize: 30 },
  memberPeriod: { color: colors.muted, fontSize: 12 },
  memberBilling: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  renewalLine: { color: '#DCCBD8', fontSize: 14 },
  memberActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  memberActionButton: { flexGrow: 1, flexShrink: 1 },
  memberCreditColumn: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 14, paddingLeft: 28, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,.15)' },
  memberCreditEyebrow: { color: '#E4D4DE', fontSize: 12, fontWeight: "600", letterSpacing: 1.2 },
  memberCreditTotalRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 11 },
  memberCreditTotal: { flexShrink: 1, color: '#FFF5EA', fontSize: 48, lineHeight: 58, fontVariant: ['tabular-nums'] },
  memberCreditTrack: { height: 9, overflow: 'hidden', flexDirection: 'row', borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' },
  memberCreditPermanentFill: { height: '100%', backgroundColor: '#F0519E' },
  memberCreditPlanFill: { height: '100%', backgroundColor: '#A84AE8' },
  memberCreditEmptyFill: { flex: 1, backgroundColor: 'rgba(255,255,255,.05)' },
  memberCreditBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  memberCreditBreakdownItem: { minWidth: 92, flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  memberCreditDot: { width: 8, height: 8, marginTop: 4, borderRadius: 4 },
  memberCreditPermanentDot: { backgroundColor: '#F0519E' },
  memberCreditPlanDot: { backgroundColor: '#A84AE8' },
  memberCreditAmount: { color: '#FFF5EA', fontFamily: 'Georgia', fontSize: 17 },
  memberCreditKind: { color: colors.muted, fontSize: 12, marginTop: 2 },
  memberGrantLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 5 },
  memberGrantText: { flex: 1, color: '#E6D7E2', fontSize: 14, lineHeight: 21 },
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, minWidth: 0, minHeight: 108, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, borderRadius: 18, backgroundColor: '#15121D', borderWidth: 1, borderColor: colors.border },
  metricRule: { width: 1, height: 44, backgroundColor: colors.border },
  metricValue: { color: colors.text, fontSize: 36, lineHeight: 44, fontWeight: '500', fontVariant: ['tabular-nums'] },
  metricLabel: { color: colors.text, fontSize: 14, fontWeight: "600" },
  metricDetail: { color: colors.muted, fontSize: 12, marginTop: 3 },
  dashboardGrid: { flexDirection: 'row', alignItems: 'stretch', gap: 14 },
  dashboardCard: { position: 'relative', flex: 1, minWidth: 0, gap: 16, overflow: 'hidden', padding: 24, borderRadius: 20, backgroundColor: '#15121D', borderWidth: 1, borderColor: colors.border },
  benefitsCard: { backgroundColor: '#190F20', borderColor: 'rgba(244,124,181,.25)' },
  benefitsImageScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(16,9,22,.85)' },
  cardForeground: { zIndex: 1 },
  dashboardTitle: { color: '#FFF5EA', fontFamily: 'Georgia', fontSize: 22 },
  cardHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 },
  cardCopy: { maxWidth: 620, color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 4 },
  benefitList: { gap: 0 },
  benefitRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.075)' },
  benefitIcon: { width: 24, alignItems: 'center' },
  benefitText: { flex: 1, color: colors.textSecondary, fontSize: 15, lineHeight: 23 },
  walletRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.025)' },
  walletRowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,62,234,.11)' },
  walletRowViolet: { backgroundColor: 'rgba(154,99,215,.14)' },
  walletRowWarm: { backgroundColor: 'rgba(233,160,127,.12)' },
  walletRowLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  walletRowDetail: { color: colors.muted, fontSize: 12, marginTop: 3 },
  walletRowValue: { flexShrink: 1, color: colors.text, fontSize: 24, lineHeight: 32, fontWeight: '500', fontVariant: ['tabular-nums'] },
  cardDivider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  creditShop: { gap: 20, padding: 24, borderRadius: 20, backgroundColor: '#15121D', borderWidth: 1, borderColor: '#4C3F43' },
  packGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  packCard: { position: 'relative', overflow: 'hidden', flexGrow: 1, flexBasis: 150, minWidth: 130, alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingTop: 36, paddingBottom: 18, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,.1)' },
  packSelected: { borderColor: 'rgba(244,124,181,.78)', backgroundColor: 'rgba(213,67,139,.1)' },
  packBadge: { position: 'absolute', top: 0, color: '#fff', fontSize: 12, fontWeight: "600", letterSpacing: .7, backgroundColor: 'rgba(213,67,139,.72)', paddingHorizontal: 10, paddingVertical: 4, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  packCreditRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  packCredits: { color: colors.text, fontFamily: 'Georgia', fontSize: 24, fontWeight: "600" },
  packPrice: { color: '#F47CB5', fontSize: 13, fontWeight: "600", marginTop: 4 },
  buyButton: { alignSelf: 'stretch', backgroundColor: '#C73579' },
  activityRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  activityIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.04)' },
  activityLabel: { color: colors.text, fontSize: 14, fontWeight: "600" },
  activityDetail: { color: colors.muted, fontSize: 12, marginTop: 3 },
  activityAmount: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  activityPositive: { color: colors.success },
  emptyActivity: { color: colors.muted, fontSize: 14, paddingVertical: 12 },
  notice: { gap: 10, padding: 15, borderRadius: radius.lg, backgroundColor: 'rgba(154,99,215,.09)', borderWidth: 1, borderColor: 'rgba(175,162,255,.24)' },
  noticeSuccess: { backgroundColor: 'rgba(77,162,116,.09)', borderColor: 'rgba(127,209,170,.26)' },
  noticeWarning: { backgroundColor: 'rgba(222,166,75,.08)', borderColor: 'rgba(233,176,86,.26)' },
  noticeDanger: { backgroundColor: 'rgba(211,92,94,.09)', borderColor: 'rgba(211,92,94,.28)' },
  noticeTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  noticeTitle: { color: colors.text, fontSize: 13, fontWeight: "600" },
  noticeCopy: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 3 },
  noticeAction: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.06)' },
  noticeActionText: { color: '#E5C7F1', fontSize: 12, fontWeight: "600" },
  restoreButton: { alignSelf: 'center', minHeight: 48, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  restoreText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  policyLinks: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 22, rowGap: 4, paddingTop: 24, borderTopWidth: 1, borderTopColor: colors.border },
  policyLink: { color: colors.muted, fontSize: 14, lineHeight: 22, fontWeight: '500' },
  errorCard: { gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  pageLayout: { gap: 28 },
  memberCreditColumnCompact: { paddingLeft: 0, paddingTop: 24, borderLeftWidth: 0, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.15)' },
  policyLinkTarget: { minHeight: 44, justifyContent: 'center' }
});

async function waitForNativeTier(refetch:()=>Promise<{data?:SubscriptionStatus}>,tier:Exclude<SubscriptionTier,'free'>):Promise<boolean>{
  for(const delay of[0,700,1400,2400,4000]){
    if(delay)await new Promise((resolve)=>setTimeout(resolve,delay));
    const result=await refetch();
    if(result.data&&(result.data.tier===tier||tier==='kivelle_plus'&&result.data.tier==='kivelle_max'))return true;
  }
  return false;
}
