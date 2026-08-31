import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { ScrollView as ScrollViewType } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Brain, Camera, Check, ChevronDown, ChevronRight, CircleAlert, CreditCard, ExternalLink, Gift, Globe2, Heart, History, LockKeyhole, RefreshCw, ShieldCheck, Sparkles, UserRound, Zap } from 'lucide-react-native';
import { GradientButton, KivelleCreditIcon, LoadingSkeleton, Screen } from '../src/components';
import { subscriptionStatusQueryKey, useSubscriptionStatus } from '../src/hooks/useSubscriptionStatus';
import { ApiError, manageSubscription } from '../src/lib/api';
import type { BillingInterval, CheckoutConfirmation, CreditActivityEvent, CreditPack, SubscriptionPlan, SubscriptionStatus, SubscriptionTier } from '../src/lib/subscription';
import { intelligenceLabel } from '../src/lib/subscription';
import { annualSavingsPercentage, billingStatusPresentation, checkoutBackoffDelay, creditActivityPresentation, managementActionLabel, membershipBenefits, membershipMetrics, membershipPageMode, membershipPricePresentation, normalizeSubscriptionIntent, safeSubscriptionReturnTo, shouldShowSubscriptionIntentCallout, subscriptionIntentPresentation } from '../src/lib/subscriptionPresentation';
import { colors, radius, spacing } from '../src/theme';

type Notice = { tone: 'neutral' | 'success' | 'warning' | 'danger'; title: string; body: string; retry?: boolean };
type PlanAction = { label: string; enabled: boolean; reason?: string | null; onPress: () => void };
const discoveryPortalBackground = require('../assets/membership/discovery-portal.webp');
const memberPortalBackground = require('../assets/membership/member-portal.webp');
const maxBenefitsBackground = require('../assets/membership/max-nebula.webp');

export default function Subscription() {
  const params = useLocalSearchParams<{ checkout?: string; purchase?: string; session_id?: string; billing?: string; intent?: string; source?: string; returnTo?: string; tier?: string }>();
  const queryClient = useQueryClient();
  const query = useSubscriptionStatus();
  const state = query.data ?? null;
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const scrollRef = useRef<ScrollViewType>(null);
  const [plansY, setPlansY] = useState(0);
  const [creditsY, setCreditsY] = useState(0);
  const [compareY, setCompareY] = useState(0);
  const intent = normalizeSubscriptionIntent(params.intent, params.source);
  const intro = subscriptionIntentPresentation(intent);
  const returnTo = safeSubscriptionReturnTo(params.returnTo);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('annual');
  const [selectedCreditPack, setSelectedCreditPack] = useState<CreditPack['key'] | ''>('');
  const [compareOpen, setCompareOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmationRetry, setConfirmationRetry] = useState(0);

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
    setNotice({ tone: 'neutral', title: 'Confirming your purchase', body: 'Your plan or Credits will appear after Kivelli receives the signed billing confirmation.' });
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
    try { const result = await manageSubscription<{ url: string }>({ action: 'checkout', tier, billingInterval, requestId: Crypto.randomUUID() }); await openUrl(result.url); }
    catch (caught) { setNotice({ tone: 'danger', title: 'Could not open checkout', body: billingErrorMessage(caught) }); }
    finally { setBusy(''); }
  };

  const openManagement = async () => {
    if (!state) return;
    if (state.management.manageAction === 'app_store') {
      if (Platform.OS === 'ios') await openUrl('https://apps.apple.com/account/subscriptions');
      else if (Platform.OS === 'android') await openUrl('https://play.google.com/store/account/subscriptions');
      else setNotice({ tone: 'neutral', title: 'Managed in your app store', body: 'Open the subscription settings on the Apple or Android device where you purchased Kivelli.' });
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

  const paidPlans = (['kivelle_plus', 'kivelle_max'] as const).map((tier) => state.catalog.find((plan) => plan.tier === tier)).filter((plan): plan is SubscriptionPlan => Boolean(plan));
  const currentPlan = state.catalog.find((plan) => plan.tier === state.tier) ?? state.capabilities;
  const mode = membershipPageMode(state.tier);
  const checkoutConfiguredFor = (plan: SubscriptionPlan) => billingInterval === 'annual' ? Boolean(state.billingConfiguredAnnual?.[plan.tier as Exclude<SubscriptionTier, 'free'>]) : state.billingConfigured[plan.tier as Exclude<SubscriptionTier, 'free'>];
  const planActionFor = (plan: SubscriptionPlan): PlanAction | null => {
    if (plan.tier === state.tier) return null;
    if (state.tier !== 'free') return { label: managementActionLabel(state.management) || 'Change plan', enabled: state.management.canManageSubscription, reason: state.management.managementReason, onPress: () => void openManagement() };
    return { label: `Choose ${plan.displayName}`, enabled: checkoutConfiguredFor(plan), reason: 'Checkout is temporarily unavailable for this billing interval.', onPress: () => void checkout(plan.tier as Exclude<SubscriptionTier, 'free'>) };
  };
  const maxPlan = paidPlans.find((plan) => plan.tier === 'kivelle_max');

  return (
    <Screen scrollRef={scrollRef} contentStyle={styles.content}>
      <PageHeader returnTo={returnTo} refreshing={query.isFetching} onRefresh={() => void refresh()} />
      <MembershipTitle mode={mode} refreshing={query.isFetching} updatedAt={query.dataUpdatedAt} />
      {notice ? <NoticeCard notice={notice} onRetry={() => { setNotice(null); if (params.checkout === 'success') setConfirmationRetry((value) => value + 1); else void refresh(); }} onContinue={notice.tone === 'success' && returnTo ? () => router.replace(returnTo as never) : undefined} /> : null}
      {query.error && !notice ? <NoticeCard notice={{ tone: 'warning', title: 'Showing your last known billing details', body: 'Kivelli could not refresh this page. Your cached membership remains visible while you reconnect.', retry: true }} onRetry={() => void refresh()} /> : null}
      {state.billing.paymentIssue ? <NoticeCard notice={{ tone: 'warning', title: 'Payment needs attention', body: 'Update your payment method to keep paid benefits active through the grace period.' }} onContinue={state.management.canManageSubscription ? () => void openManagement() : undefined} continueLabel={managementActionLabel(state.management)} /> : null}
      {shouldShowSubscriptionIntentCallout(mode, intent) ? <IntentCallout eyebrow={intro.eyebrow} title={intro.title} body={intro.body} /> : null}

      {mode === 'discovery' ? <>
        <DiscoveryHero compact={compact} onExplore={() => scrollTo(plansY)} onCompare={() => { setCompareOpen(true); scrollTo(compareY); }} />
        <View onLayout={(event) => setPlansY(event.nativeEvent.layout.y)} style={styles.sectionBlock}>
          <SectionHeading kicker="CHOOSE YOUR EXPERIENCE" title="Memberships built around your world" copy="Upgrade anytime. Your account, companions, and permanent Credits stay exactly where you left them." />
          {paidPlans[0] ? <BillingIntervalToggle value={billingInterval} plan={paidPlans[0]} onChange={setBillingInterval} /> : null}
          <View style={[styles.planGrid, compact && styles.stack]}>{paidPlans.map((plan) => <PlanCard key={plan.tier} plan={plan} billingInterval={billingInterval} action={planActionFor(plan)} busy={busy === plan.tier} featured={plan.tier === 'kivelle_max'} />)}</View>
        </View>
        <TrustStrip compact={compact} />
        <View onLayout={(event) => setCreditsY(event.nativeEvent.layout.y)}><CreditWalletCard state={state} showActivity /></View>
      </> : <>
        <MemberHero state={state} plan={currentPlan} compact={compact} busy={busy === 'portal'} onManage={state.management.canManageSubscription ? () => void openManagement() : undefined} onBuyCredits={state.management.canPurchaseCredits ? () => scrollTo(creditsY) : undefined} />
        <MembershipMetrics plan={currentPlan} compact={compact} />
        <View style={[styles.dashboardGrid, compact && styles.stack]}><BenefitsCard plan={currentPlan} /><CreditWalletCard state={state} /></View>
        <View onLayout={(event) => setCreditsY(event.nativeEvent.layout.y)}><CreditShop state={state} selectedKey={selectedCreditPack} busy={busy} onSelect={setSelectedCreditPack} onBuy={(pack) => void buyCredits(pack)} /></View>
        <RecentActivityCard activity={state.creditActivity} />
        {state.tier === 'kivelle_plus' && maxPlan ? <View onLayout={(event) => setPlansY(event.nativeEvent.layout.y)} style={styles.sectionBlock}><SectionHeading kicker="GO DEEPER" title="See what Max adds" copy="Compare your current membership with Kivelli Max before changing anything." /><BillingIntervalToggle value={billingInterval} plan={maxPlan} onChange={setBillingInterval} /><PlanCard plan={maxPlan} billingInterval={billingInterval} action={planActionFor(maxPlan)} busy={busy === 'portal'} featured /></View> : null}
      </>}

      <View onLayout={(event) => setCompareY(event.nativeEvent.layout.y)}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: compareOpen }} accessibilityLabel={`${compareOpen ? 'Hide' : 'Show'} membership comparison`} onPress={() => setCompareOpen((value) => !value)} style={({ pressed }) => [styles.compareToggle, pressed && styles.pressed]}><View style={{ flex: 1 }}><Text style={styles.compareTitle}>Compare all memberships</Text><Text style={styles.compareCopy}>See Kivelli Free, Kivelli+, and Max side by side.</Text></View><View style={{ transform: [{ rotate: compareOpen ? '180deg' : '0deg' }] }}><ChevronDown size={20} color={colors.muted} /></View></Pressable>
        {compareOpen ? <Comparison plans={state.catalog} currentTier={state.tier} compact={compact} /> : null}
      </View>
      <View style={styles.policyLinks}><PolicyLink label="Terms" route="/terms" /><Text style={styles.policyDot}>•</Text><PolicyLink label="Privacy" route="/privacy-policy" /><Text style={styles.policyDot}>•</Text><PolicyLink label="Refunds & cancellation" route="/refund-policy" /><Text style={styles.policyDot}>•</Text><PolicyLink label="Support" route="/support" /></View>
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
  return <View style={[styles.heroCard, compact && styles.heroCardCompact]}><Image source={discoveryPortalBackground} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" cachePolicy="memory-disk" /><View pointerEvents="none" style={[styles.heroImageScrim, compact && styles.heroImageScrimCompact]} /><View style={[styles.heroContent, compact && styles.heroContentCompact]}><StatusPill label="NO ACTIVE MEMBERSHIP" tone="neutral" /><Text accessibilityRole="header" style={[styles.heroTitle, compact && styles.heroTitleCompact]}>Your next world is waiting.</Text><Text style={styles.heroCopy}>Restore deeper memories, receive daily images, meet more companions, and get priority access across every world.</Text><View style={styles.heroActions}><Pressable accessibilityRole="button" onPress={onExplore} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>Explore memberships</Text><ChevronRight size={19} color="#fff" /></Pressable><Pressable accessibilityRole="button" onPress={onCompare} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>Compare benefits</Text><ChevronRight size={17} color={colors.rose} /></Pressable></View><View style={styles.safetyLine}><ShieldCheck size={18} color={colors.success} /><Text style={styles.safetyText}>Your permanent Credits, companions, and memories stay safe.</Text></View></View></View>;
}

function MemberHero({ state, plan, compact, busy, onManage, onBuyCredits }: { state: SubscriptionStatus; plan: SubscriptionPlan; compact: boolean; busy: boolean; onManage?: () => void; onBuyCredits?: () => void }) {
  const status = billingStatusPresentation(state);
  const interval = state.billing.billingInterval ?? 'monthly';
  const price = membershipPricePresentation(plan, interval);
  return <View style={[styles.memberHero, compact && styles.memberHeroCompact]}><Image source={memberPortalBackground} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" cachePolicy="memory-disk" /><View pointerEvents="none" style={[styles.memberHeroScrim, compact && styles.memberHeroScrimCompact]} /><View style={[styles.memberHeroLayout, compact && styles.memberHeroLayoutCompact]}><View style={styles.memberPlanColumn}><StatusPill label={status.label.toUpperCase()} tone={status.tone} /><Text accessibilityRole="header" style={styles.memberPlanName}>{plan.displayName}</Text><View style={styles.priceRow}><Text style={styles.memberPrice}>{price.primary}</Text><Text style={styles.memberPeriod}>{price.period}</Text></View><Text style={styles.memberBilling}>{state.management.mode === 'kivelle' ? status.detail : `${price.detail} · ${state.management.label}`}</Text>{status.date && status.dateLabel ? <Text style={styles.renewalLine}>{status.dateLabel} {formatDate(status.date)}</Text> : null}<View style={styles.memberActions}>{onBuyCredits ? <Pressable accessibilityRole="button" onPress={onBuyCredits} style={({ pressed }) => [styles.primaryButton, styles.memberActionButton, pressed && styles.pressed]}><KivelleCreditIcon size={19} /><Text style={styles.primaryButtonText}>Buy more Credits</Text></Pressable> : null}{onManage ? <Pressable accessibilityRole="button" disabled={busy} onPress={onManage} style={({ pressed }) => [styles.secondaryButton, styles.memberActionButton, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>{busy ? 'Opening billing…' : managementActionLabel(state.management)}</Text><ExternalLink size={16} color={colors.text} /></Pressable> : null}</View></View><MemberCreditSummary state={state} plan={plan} /></View></View>;
}

function MemberCreditSummary({ state, plan }: { state: SubscriptionStatus; plan: SubscriptionPlan }) {
  const permanent = Math.max(0, state.creditBalance.permanentBalance);
  const subscription = Math.max(0, state.creditBalance.subscriptionBalance);
  const total = Math.max(0, state.creditBalance.total);
  const nextGrant = plan.monthlyCreditGrant > 0
    ? state.nextCreditGrantAt
      ? `Next monthly grant: ${plan.monthlyCreditGrant.toLocaleString()} Credits on ${formatShortDate(state.nextCreditGrantAt)}`
      : `${plan.monthlyCreditGrant.toLocaleString()} Credits included in your monthly plan`
    : 'No monthly Credit grant on this plan';
  return <View style={styles.memberCreditColumn}><Text style={styles.memberCreditEyebrow}>AVAILABLE CREDITS</Text><View style={styles.memberCreditTotalRow}><Text accessibilityLabel={`${total.toLocaleString()} available Credits`} style={styles.memberCreditTotal}>{total.toLocaleString()}</Text><KivelleCreditIcon size={44} /></View><View accessibilityRole="progressbar" accessibilityLabel={`${permanent.toLocaleString()} permanent Credits and ${subscription.toLocaleString()} plan Credits`} accessibilityValue={{ min: 0, max: Math.max(1, total), now: permanent }} style={styles.memberCreditTrack}>{total > 0 ? <>{permanent > 0 ? <View style={[styles.memberCreditPermanentFill, { flex: permanent }]} /> : null}{subscription > 0 ? <View style={[styles.memberCreditPlanFill, { flex: subscription }]} /> : null}</> : <View style={styles.memberCreditEmptyFill} />}</View><View style={styles.memberCreditBreakdown}><View style={styles.memberCreditBreakdownItem}><View style={[styles.memberCreditDot, styles.memberCreditPermanentDot]} /><View><Text style={styles.memberCreditAmount}>{permanent.toLocaleString()}</Text><Text style={styles.memberCreditKind}>permanent</Text></View></View><View style={styles.memberCreditBreakdownItem}><View style={[styles.memberCreditDot, styles.memberCreditPlanDot]} /><View><Text style={styles.memberCreditAmount}>{subscription.toLocaleString()}</Text><Text style={styles.memberCreditKind}>plan Credits</Text></View></View></View><View style={styles.memberGrantLine}><Gift size={16} color="#F1C9E7" /><Text style={styles.memberGrantText}>{nextGrant}</Text></View></View>;
}

function MembershipMetrics({ plan, compact }: { plan: SubscriptionPlan; compact: boolean }) {
  const icons = { lives: Heart, companions: UserRound, photos: Camera } as const;
  return <View style={[styles.metricsRow, compact && styles.stack]}>{membershipMetrics(plan).map((metric) => { const Icon = icons[metric.key]; return <View key={metric.key} style={styles.metricCard}><Icon size={32} strokeWidth={1.5} color={colors.rose} /><View style={styles.metricRule} /><Text style={styles.metricValue}>{metric.value}</Text><View><Text style={styles.metricLabel}>{metric.label}</Text><Text style={styles.metricDetail}>{metric.detail}</Text></View></View>; })}</View>;
}

function BenefitsCard({ plan }: { plan: SubscriptionPlan }) {
  const icons = [Sparkles, Brain, Camera, Zap, Globe2, ShieldCheck] as const;
  return <View style={[styles.dashboardCard, styles.benefitsCard]}>{plan.tier === 'kivelle_max' ? <><Image source={maxBenefitsBackground} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="center" cachePolicy="memory-disk" /><View pointerEvents="none" style={styles.benefitsImageScrim} /></> : null}<Text style={[styles.dashboardTitle, styles.cardForeground]}>Everything included with {plan.displayName}</Text><View style={[styles.benefitList, styles.cardForeground]}>{membershipBenefits(plan).map((benefit, index) => { const Icon = icons[index] ?? Check; return <View key={benefit} style={styles.benefitRow}><View style={styles.benefitIcon}><Icon size={19} color="#F2C8EA" /></View><Text style={styles.benefitText}>{benefit}</Text><Check size={19} color={colors.success} /></View>; })}</View></View>;
}

function CreditWalletCard({ state, showActivity = false }: { state: SubscriptionStatus; showActivity?: boolean }) {
  const plan = state.catalog.find((item) => item.tier === state.tier) ?? state.capabilities;
  return <View style={styles.dashboardCard}><View style={styles.cardHeading}><View><Text style={styles.dashboardTitle}>Your credit wallet</Text><Text style={styles.cardCopy}>Permanent Credits are always spent after expiring plan Credits.</Text></View><KivelleCreditIcon size={34} /></View><WalletRow label="Permanent Credits" value={state.creditBalance.permanentBalance} detail="No expiration" tone="rose" /><WalletRow label="Plan Credits" value={state.creditBalance.subscriptionBalance} detail={state.creditBalance.subscriptionExpiresAt ? `Available through ${formatDate(state.creditBalance.subscriptionExpiresAt)}` : state.tier === 'free' ? 'Starts with a membership' : `Rollover cap ${plan.subscriptionCreditRolloverCap.toLocaleString()}`} tone="violet" /><WalletRow label="Monthly grant" value={plan.monthlyCreditGrant} detail={state.tier === 'free' ? 'Paused' : state.nextCreditGrantAt ? `Next grant ${formatDate(state.nextCreditGrantAt)}` : 'Included with your plan'} tone="warm" />{showActivity ? <><View style={styles.cardDivider} /><RecentActivity activity={state.creditActivity} /></> : null}</View>;
}

function WalletRow({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: 'rose' | 'violet' | 'warm' }) { return <View style={styles.walletRow}><View style={[styles.walletRowIcon, tone === 'violet' && styles.walletRowViolet, tone === 'warm' && styles.walletRowWarm]}><KivelleCreditIcon size={20} /></View><View style={{ flex: 1 }}><Text style={styles.walletRowLabel}>{label}</Text><Text style={styles.walletRowDetail}>{detail}</Text></View><Text style={styles.walletRowValue}>{value.toLocaleString()}</Text></View>; }

function SectionHeading({ kicker, title, copy }: { kicker: string; title: string; copy: string }) { return <View><Text style={styles.eyebrow}>{kicker}</Text><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionCopy}>{copy}</Text></View>; }

function BillingIntervalToggle({ value, plan, onChange }: { value: BillingInterval; plan: SubscriptionPlan; onChange: (interval: BillingInterval) => void }) {
  const savings = annualSavingsPercentage(plan.monthlyPriceUsd, plan.annualPriceUsd);
  return <View accessibilityRole="radiogroup" accessibilityLabel="Billing interval" style={styles.billingToggle}><Pressable accessibilityRole="radio" accessibilityState={{ checked: value === 'monthly' }} onPress={() => onChange('monthly')} style={[styles.billingChoice, value === 'monthly' && styles.billingChoiceActive]}><Text style={[styles.billingText, value === 'monthly' && styles.billingTextActive]}>Monthly</Text></Pressable><Pressable accessibilityRole="radio" accessibilityState={{ checked: value === 'annual' }} onPress={() => onChange('annual')} style={[styles.billingChoice, value === 'annual' && styles.billingChoiceActive]}><Text style={[styles.billingText, value === 'annual' && styles.billingTextActive]}>Yearly</Text>{savings ? <View style={styles.savePill}><Text style={styles.saveText}>SAVE {savings}%</Text></View> : null}</Pressable></View>;
}

function PlanCard({ plan, billingInterval, action, busy, featured }: { plan: SubscriptionPlan; billingInterval: BillingInterval; action: PlanAction | null; busy: boolean; featured: boolean }) {
  const price = membershipPricePresentation(plan, billingInterval);
  return <View style={[styles.planCard, featured ? styles.planCardFeatured : styles.planCardPlus]}>{featured ? <View style={styles.featuredBadge}><Sparkles size={12} color="#FFD1F0" /><Text style={styles.featuredBadgeText}>MOST IMMERSIVE</Text></View> : null}<Text accessibilityRole="header" style={styles.planName}>{plan.displayName}</Text><View style={styles.priceRow}><Text style={styles.planPrice}>{price.primary}</Text><Text style={styles.planPeriod}>{price.period}</Text></View><Text style={styles.planPriceDetail}>{price.detail}</Text><Text style={styles.planTagline}>{plan.tier === 'kivelle_max' ? 'The deepest Kivelli experience' : 'More connection, every day'}</Text><View style={styles.planBenefits}>{membershipBenefits(plan).map((benefit) => <View key={benefit} style={styles.planBenefit}><Check size={17} color={featured ? '#C9B6FF' : '#F48CBE'} /><Text style={styles.planBenefitText}>{benefit}</Text></View>)}</View>{action ? action.enabled ? <Pressable accessibilityRole="button" disabled={busy} onPress={action.onPress} style={({ pressed }) => [styles.primaryButton, featured ? styles.maxButton : styles.plusButton, busy && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{busy ? 'Opening…' : action.label}</Text><ChevronRight size={19} color="#fff" /></Pressable> : <View style={styles.unavailableAction}><CircleAlert size={17} color={colors.warm} /><Text style={styles.unavailableText}>{action.reason}</Text></View> : <View style={styles.currentPlanStrip}><Check size={18} color={colors.success} /><Text style={styles.currentPlanStripText}>Your current membership</Text></View>}</View>;
}

function TrustStrip({ compact }: { compact: boolean }) {
  const items = [{ icon: RefreshCw, title: 'Cancel anytime', copy: 'No long-term commitment.' }, { icon: ShieldCheck, title: 'Permanent Credits stay yours', copy: 'Safe, secure, and always available.' }, { icon: LockKeyhole, title: 'Secure billing', copy: 'Payments are handled by your billing provider.' }];
  return <View style={[styles.trustStrip, compact && styles.stack]}>{items.map(({ icon: Icon, title, copy }) => <View key={title} style={styles.trustItem}><View style={styles.trustIcon}><Icon size={23} color="#E7D7FF" /></View><View><Text style={styles.trustTitle}>{title}</Text><Text style={styles.trustCopy}>{copy}</Text></View></View>)}</View>;
}

function CreditShop({ state, selectedKey, busy, onSelect, onBuy }: { state: SubscriptionStatus; selectedKey: CreditPack['key'] | ''; busy: string; onSelect: (key: CreditPack['key']) => void; onBuy: (pack: CreditPack) => void }) {
  const packs = state.creditPacks.filter((pack) => pack.active);
  const selected = packs.find((pack) => pack.key === selectedKey);
  return <View style={styles.creditShop}><View style={styles.cardHeading}><View><Text style={styles.eyebrow}>ADD KIVELLI CREDITS</Text><Text style={styles.dashboardTitle}>Keep creating</Text><Text style={styles.cardCopy}>Use Credits for generated photos, video, voice, and other priced media actions.</Text></View><KivelleCreditIcon size={40} /></View>{state.management.canPurchaseCredits && packs.length ? <><View accessibilityRole="radiogroup" accessibilityLabel="Credit packs" style={styles.packGrid}>{packs.map((pack) => <Pressable key={pack.key} accessibilityRole="radio" accessibilityState={{ checked: selectedKey === pack.key }} onPress={() => onSelect(pack.key)} style={[styles.packCard, selectedKey === pack.key && styles.packSelected]}>{pack.popular ? <Text style={styles.packBadge}>POPULAR</Text> : null}<View style={styles.packCreditRow}><KivelleCreditIcon size={20} /><Text style={styles.packCredits}>{pack.credits.toLocaleString()}</Text></View><Text style={styles.packPrice}>{pack.displayPrice || formatCurrency(pack.priceUsd)}</Text></Pressable>)}</View>{selected ? <Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={() => onBuy(selected)} style={({ pressed }) => [styles.primaryButton, styles.buyButton, Boolean(busy) && styles.disabled, pressed && styles.pressed]}><CreditCard size={18} color="#fff" /><Text style={styles.primaryButtonText}>{busy === selected.key ? 'Opening secure checkout…' : `Buy ${selected.credits.toLocaleString()} Credits · ${selected.displayPrice || formatCurrency(selected.priceUsd)}`}</Text></Pressable> : null}</> : <View style={styles.unavailableAction}><ShieldCheck size={18} color={colors.success} /><Text style={styles.unavailableText}>{state.management.creditPurchaseReason ?? 'Credit purchases are not available for this account.'}</Text></View>}</View>;
}

function RecentActivityCard({ activity }: { activity: CreditActivityEvent[] }) { return <View style={styles.dashboardCard}><View style={styles.cardHeading}><Text style={styles.dashboardTitle}>Recent credit activity</Text><History size={21} color={colors.rose} /></View><RecentActivity activity={activity} /></View>; }
function RecentActivity({ activity }: { activity: CreditActivityEvent[] }) { if (!activity.length) return <Text style={styles.emptyActivity}>No recent credit activity yet.</Text>; return <View>{activity.slice(0, 8).map((event) => <ActivityRow key={event.id} event={event} />)}</View>; }
function ActivityRow({ event }: { event: CreditActivityEvent }) { const item = creditActivityPresentation(event); return <View style={styles.activityRow}><View style={styles.activityIcon}>{item.amount >= 0 ? <Gift size={17} color={colors.rose} /> : <KivelleCreditIcon size={17} />}</View><View style={{ flex: 1 }}><Text style={styles.activityLabel}>{item.label}</Text><Text style={styles.activityDetail}>{new Date(event.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · {item.detail}</Text></View><Text style={[styles.activityAmount, item.amount > 0 && styles.activityPositive]}>{item.amount > 0 ? '+' : ''}{item.amount.toLocaleString()}</Text></View>; }

function StatusPill({ label, tone }: { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }) { return <View style={[styles.statusPill, tone === 'success' && styles.statusSuccess, tone === 'warning' && styles.statusWarning, tone === 'danger' && styles.statusDanger]}><View style={[styles.statusDot, tone === 'success' && styles.statusDotSuccess, tone === 'warning' && styles.statusDotWarning, tone === 'danger' && styles.statusDotDanger]} /><Text style={styles.statusText}>{label}</Text></View>; }

function NoticeCard({ notice, onRetry, onContinue, continueLabel = 'Continue' }: { notice: Notice; onRetry?: () => void; onContinue?: () => void; continueLabel?: string }) {
  return <View accessibilityLiveRegion="polite" style={[styles.notice, notice.tone === 'success' && styles.noticeSuccess, notice.tone === 'warning' && styles.noticeWarning, notice.tone === 'danger' && styles.noticeDanger]}><View style={styles.noticeTop}>{notice.tone === 'danger' || notice.tone === 'warning' ? <CircleAlert size={18} color={notice.tone === 'danger' ? colors.danger : colors.warm} /> : notice.tone === 'success' ? <Check size={18} color={colors.success} /> : <RefreshCw size={17} color={colors.violet} />}<View style={{ flex: 1 }}><Text style={styles.noticeTitle}>{notice.title}</Text><Text style={styles.noticeCopy}>{notice.body}</Text></View></View>{notice.retry && onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={styles.noticeAction}><Text style={styles.noticeActionText}>Refresh status</Text></Pressable> : null}{onContinue && continueLabel ? <Pressable accessibilityRole="button" onPress={onContinue} style={styles.noticeAction}><Text style={styles.noticeActionText}>{continueLabel}</Text><ChevronRight size={16} color="#E5C7F1" /></Pressable> : null}</View>;
}

function Comparison({ plans, currentTier, compact }: { plans: SubscriptionPlan[]; currentTier: SubscriptionTier; compact: boolean }) {
  return <View style={[styles.compareGrid, !compact && styles.compareGridWide]}>{plans.map((plan) => <View key={plan.tier} style={[styles.compareCard, compact && styles.compareCardCompact]}><View style={styles.compareCardTop}><Text style={styles.comparePlan}>{plan.displayName}</Text>{plan.tier === currentTier ? <Text style={styles.compareCurrent}>CURRENT</Text> : null}</View><CompareRow label="Conversations" value={plan.chatDailyLimit ? `${plan.chatDailyLimit} per day` : 'Unlimited'} /><CompareRow label="Continuity" value={intelligenceLabel(plan.intelligenceProfile)} /><CompareRow label="Included photos" value={plan.includedCompanionPhotoDailyLimit ? `${plan.includedCompanionPhotoDailyLimit} per day` : 'Credits'} /><CompareRow label="Monthly Credits" value={plan.monthlyCreditGrant ? plan.monthlyCreditGrant.toLocaleString() : '—'} /><CompareRow label="Lives / custom companions" value={`${plan.maxLives} / ${plan.maxCustomCompanions}`} /><CompareRow label="Worlds" value={plan.worldAccess === 'all_standard' ? 'Every standard world' : 'Published free worlds'} /><CompareRow label="Media priority" value={plan.mediaQueue} /></View>)}</View>;
}
function CompareRow({ label, value }: { label: string; value: string }) { return <View style={styles.compareRow}><Text style={styles.compareLabel}>{label}</Text><Text style={styles.compareValue}>{value}</Text></View>; }
function PolicyLink({ label, route }: { label: string; route: string }) { return <Text accessibilityRole="link" onPress={() => router.push(route as never)} style={styles.policyLink}>{label}</Text>; }
function formatDate(value: string | null): string { if (!value) return 'Not scheduled'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Not scheduled' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function formatShortDate(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'your next renewal' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function formatCurrency(value: number): string { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(value); } catch { return `$${value.toFixed(2)}`; } }
function billingErrorMessage(caught: unknown): string { if (caught instanceof ApiError) return `${caught.message}${caught.correlationId ? ` Support reference: ${caught.correlationId}.` : ''}`; return caught instanceof Error ? caught.message : 'Please try again.'; }

const styles = StyleSheet.create({
  content: { gap: spacing.lg, maxWidth: 1180, paddingBottom: spacing.xxxl }, header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }, headerLabel: { flex: 1, color: colors.dimmed, fontSize: 10, fontWeight: '900', letterSpacing: 1.45 }, iconButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, pressed: { opacity: .84, transform: [{ scale: .992 }] }, disabled: { opacity: .5 },
  titleBlock: { gap: 7, paddingHorizontal: 5 }, pageTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 45, lineHeight: 53 }, titleMeta: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }, pageSubtitle: { flexShrink: 1, color: colors.muted, fontSize: 14, lineHeight: 21 }, updated: { color: colors.dimmed, fontSize: 9, fontWeight: '700' }, eyebrow: { color: colors.rose, fontSize: 9, fontWeight: '900', letterSpacing: 1.25 },
  intentCallout: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 15, borderRadius: radius.lg, backgroundColor: 'rgba(154,99,215,.09)', borderWidth: 1, borderColor: 'rgba(175,162,255,.24)' }, intentTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 4 }, intentBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  heroCard: { position: 'relative', minHeight: 286, overflow: 'hidden', justifyContent: 'center', padding: 32, borderRadius: radius.xl, backgroundColor: '#160B19', borderWidth: 1, borderColor: 'rgba(235,93,184,.46)' }, heroCardCompact: { minHeight: 390, padding: 20 }, heroImageScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(7,3,10,.12)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(90deg, rgba(7,3,10,.98) 0%, rgba(12,5,15,.88) 42%, rgba(12,5,15,.15) 72%, rgba(7,3,10,.05) 100%)' } as never) : {}) }, heroImageScrimCompact: { backgroundColor: 'rgba(7,3,10,.62)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(90deg, rgba(7,3,10,.94), rgba(7,3,10,.55))' } as never) : {}) }, heroContent: { zIndex: 2, maxWidth: 610, gap: 14 }, heroContentCompact: { maxWidth: '100%' }, heroTitle: { color: '#FFF5EC', fontFamily: 'Georgia', fontSize: 41, lineHeight: 48 }, heroTitleCompact: { fontSize: 34, lineHeight: 40 }, heroCopy: { maxWidth: 560, color: '#E8DDE4', fontSize: 15, lineHeight: 23 }, heroActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 3 }, primaryButton: { minHeight: 50, minWidth: 190, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 20, borderRadius: radius.md, backgroundColor: '#C62DB9', shadowColor: colors.rose, shadowOpacity: .28, shadowRadius: 17, shadowOffset: { width: 0, height: 7 }, elevation: 4, ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(100deg, #E81AA7 0%, #B622D0 52%, #641DE1 100%)' } as never) : {}) }, primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' }, secondaryButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.025)', borderWidth: 1, borderColor: 'rgba(255,255,255,.22)' }, secondaryButtonText: { color: colors.text, fontSize: 13, fontWeight: '900' }, safetyLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,.12)' }, safetyText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 },
  statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(216,62,234,.16)', borderWidth: 1, borderColor: 'rgba(244,124,181,.18)' }, statusSuccess: { backgroundColor: 'rgba(42,183,124,.16)', borderColor: 'rgba(91,225,163,.22)' }, statusWarning: { backgroundColor: 'rgba(222,166,75,.13)', borderColor: 'rgba(233,176,86,.25)' }, statusDanger: { backgroundColor: 'rgba(211,92,94,.14)', borderColor: 'rgba(211,92,94,.26)' }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.rose }, statusDotSuccess: { backgroundColor: '#4FE19E' }, statusDotWarning: { backgroundColor: colors.warm }, statusDotDanger: { backgroundColor: colors.danger }, statusText: { color: colors.text, fontSize: 9, fontWeight: '900', letterSpacing: .7 },
  sectionBlock: { gap: 16 }, sectionTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 27, marginTop: 5 }, sectionCopy: { maxWidth: 690, color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 }, billingToggle: { alignSelf: 'flex-end', width: '100%', maxWidth: 350, flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.lg, backgroundColor: 'rgba(17,15,25,.82)', borderWidth: 1, borderColor: colors.border }, billingChoice: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, borderRadius: radius.md }, billingChoiceActive: { backgroundColor: 'rgba(216,62,234,.17)', borderWidth: 1, borderColor: 'rgba(244,124,181,.34)' }, billingText: { color: colors.muted, fontSize: 11, fontWeight: '800' }, billingTextActive: { color: colors.text }, savePill: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(216,62,234,.24)' }, saveText: { color: '#FFB9D2', fontSize: 7, fontWeight: '900', letterSpacing: .45 },
  planGrid: { flexDirection: 'row', alignItems: 'stretch', gap: 14 }, stack: { flexDirection: 'column' }, planCard: { position: 'relative', flex: 1, minWidth: 0, gap: 10, overflow: 'hidden', padding: 22, borderRadius: radius.xl, borderWidth: 1 }, planCardPlus: { backgroundColor: 'rgba(24,15,27,.96)', borderColor: 'rgba(244,124,181,.31)' }, planCardFeatured: { backgroundColor: 'rgba(26,12,31,.98)', borderColor: 'rgba(246,73,193,.77)', shadowColor: '#E133C6', shadowOpacity: .22, shadowRadius: 19, shadowOffset: { width: 0, height: 7 }, elevation: 5 }, featuredBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(190,29,140,.28)' }, featuredBadgeText: { color: '#FFD1F0', fontSize: 8, fontWeight: '900', letterSpacing: .65 }, planName: { color: '#FFF5E9', fontFamily: 'Georgia', fontSize: 30 }, priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 }, planPrice: { color: '#FFF5E9', fontFamily: 'Georgia', fontSize: 25 }, planPeriod: { color: colors.muted, fontSize: 11 }, planPriceDetail: { color: colors.dimmed, fontSize: 9 }, planTagline: { color: '#E9DCE5', fontSize: 12, marginBottom: 4 }, planBenefits: { flex: 1, gap: 9, marginVertical: 4 }, planBenefit: { flexDirection: 'row', alignItems: 'center', gap: 9 }, planBenefitText: { flex: 1, color: colors.text, fontSize: 11, lineHeight: 17 }, plusButton: { backgroundColor: '#A62B7B' }, maxButton: { backgroundColor: '#7A25D9' }, unavailableAction: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)' }, unavailableText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 }, currentPlanStrip: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, backgroundColor: 'rgba(127,209,170,.07)', borderWidth: 1, borderColor: 'rgba(127,209,170,.18)' }, currentPlanStripText: { color: colors.success, fontSize: 12, fontWeight: '900' },
  trustStrip: { flexDirection: 'row', gap: 0, padding: 12, borderRadius: radius.xl, backgroundColor: '#141019', borderWidth: 1, borderColor: colors.border }, trustItem: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 9 }, trustIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.violet }, trustTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 15 }, trustCopy: { color: colors.muted, fontSize: 9, marginTop: 3 },
  memberHero: { position: 'relative', minHeight: 310, overflow: 'hidden', justifyContent: 'center', padding: 30, borderRadius: radius.xl, backgroundColor: '#180B1A', borderWidth: 1, borderColor: 'rgba(244,124,181,.5)' }, memberHeroCompact: { minHeight: 570, padding: 20 }, memberHeroScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(6,3,9,.13)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(90deg, rgba(6,3,9,.99) 0%, rgba(11,5,14,.96) 52%, rgba(11,5,14,.68) 72%, rgba(7,3,10,.04) 100%)' } as never) : {}) }, memberHeroScrimCompact: { backgroundColor: 'rgba(7,3,10,.72)', ...(Platform.OS === 'web' ? ({ backgroundImage: 'linear-gradient(90deg, rgba(7,3,10,.97), rgba(7,3,10,.7))' } as never) : {}) }, memberHeroLayout: { zIndex: 2, width: '72%', flexDirection: 'row', alignItems: 'stretch', gap: 22 }, memberHeroLayoutCompact: { width: '100%', flexDirection: 'column', gap: 24 }, memberPlanColumn: { flex: 1.08, minWidth: 0, gap: 8 }, memberPlanName: { color: '#FFF5EA', fontFamily: 'Georgia', fontSize: 39, lineHeight: 46 }, memberPrice: { color: '#FFF5EA', fontFamily: 'Georgia', fontSize: 30 }, memberPeriod: { color: colors.muted, fontSize: 12 }, memberBilling: { color: colors.muted, fontSize: 11, lineHeight: 17 }, renewalLine: { color: '#DCCBD8', fontSize: 11 }, memberActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }, memberActionButton: { minWidth: 170 }, memberCreditColumn: { flex: .92, minWidth: 230, justifyContent: 'center', gap: 11, paddingLeft: 22, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,.13)' }, memberCreditEyebrow: { color: '#E4D4DE', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, memberCreditTotalRow: { flexDirection: 'row', alignItems: 'center', gap: 11 }, memberCreditTotal: { color: '#FFF5EA', fontFamily: 'Georgia', fontSize: 48, lineHeight: 55 }, memberCreditTrack: { height: 9, overflow: 'hidden', flexDirection: 'row', borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' }, memberCreditPermanentFill: { height: '100%', backgroundColor: '#F0519E' }, memberCreditPlanFill: { height: '100%', backgroundColor: '#A84AE8' }, memberCreditEmptyFill: { flex: 1, backgroundColor: 'rgba(255,255,255,.05)' }, memberCreditBreakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 }, memberCreditBreakdownItem: { minWidth: 92, flexDirection: 'row', alignItems: 'flex-start', gap: 7 }, memberCreditDot: { width: 8, height: 8, marginTop: 4, borderRadius: 4 }, memberCreditPermanentDot: { backgroundColor: '#F0519E' }, memberCreditPlanDot: { backgroundColor: '#A84AE8' }, memberCreditAmount: { color: '#FFF5EA', fontFamily: 'Georgia', fontSize: 17 }, memberCreditKind: { color: colors.muted, fontSize: 9, marginTop: 2 }, memberGrantLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 5 }, memberGrantText: { flex: 1, color: '#E6D7E2', fontSize: 10, lineHeight: 15 },
  metricsRow: { flexDirection: 'row', gap: 10 }, metricCard: { flex: 1, minWidth: 0, minHeight: 90, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, backgroundColor: '#17111C', borderWidth: 1, borderColor: 'rgba(244,124,181,.24)' }, metricRule: { width: 1, height: 44, backgroundColor: colors.border }, metricValue: { color: '#FFF5EA', fontFamily: 'Georgia', fontSize: 37 }, metricLabel: { color: colors.text, fontSize: 11, fontWeight: '900' }, metricDetail: { color: colors.muted, fontSize: 9, marginTop: 3 },
  dashboardGrid: { flexDirection: 'row', alignItems: 'stretch', gap: 14 }, dashboardCard: { position: 'relative', flex: 1, minWidth: 0, gap: 11, overflow: 'hidden', padding: 22, borderRadius: radius.xl, backgroundColor: '#17111C', borderWidth: 1, borderColor: colors.border }, benefitsCard: { backgroundColor: '#190F20', borderColor: 'rgba(244,124,181,.25)' }, benefitsImageScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,5,23,.34)' }, cardForeground: { zIndex: 1 }, dashboardTitle: { color: '#FFF5EA', fontFamily: 'Georgia', fontSize: 22 }, cardHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }, cardCopy: { maxWidth: 620, color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 }, benefitList: { gap: 0 }, benefitRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.12)' }, benefitIcon: { width: 24, alignItems: 'center' }, benefitText: { flex: 1, color: colors.text, fontSize: 11, lineHeight: 17 }, walletRow: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.025)', borderWidth: 1, borderColor: colors.border }, walletRowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(216,62,234,.11)' }, walletRowViolet: { backgroundColor: 'rgba(154,99,215,.14)' }, walletRowWarm: { backgroundColor: 'rgba(233,160,127,.12)' }, walletRowLabel: { color: colors.text, fontSize: 11, fontWeight: '800' }, walletRowDetail: { color: colors.muted, fontSize: 8, marginTop: 3 }, walletRowValue: { color: '#FFF5EA', fontFamily: 'Georgia', fontSize: 23 }, cardDivider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  creditShop: { gap: 16, padding: 22, borderRadius: radius.xl, backgroundColor: '#17111C', borderWidth: 1, borderColor: 'rgba(233,160,127,.3)' }, packGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, packCard: { position: 'relative', overflow: 'hidden', flexGrow: 1, flexBasis: 150, minWidth: 130, alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 18, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,.1)' }, packSelected: { borderColor: 'rgba(244,124,181,.78)', backgroundColor: 'rgba(213,67,139,.1)' }, packBadge: { position: 'absolute', top: 0, color: '#fff', fontSize: 7, fontWeight: '900', letterSpacing: .7, backgroundColor: 'rgba(213,67,139,.72)', paddingHorizontal: 10, paddingVertical: 4, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }, packCreditRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 }, packCredits: { color: colors.text, fontFamily: 'Georgia', fontSize: 24, fontWeight: '900' }, packPrice: { color: '#F47CB5', fontSize: 13, fontWeight: '900', marginTop: 4 }, buyButton: { alignSelf: 'stretch', backgroundColor: '#C73579' },
  activityRow: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, activityIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.04)' }, activityLabel: { color: colors.text, fontSize: 11, fontWeight: '900' }, activityDetail: { color: colors.dimmed, fontSize: 9, marginTop: 3 }, activityAmount: { color: colors.muted, fontSize: 13, fontWeight: '900' }, activityPositive: { color: colors.success }, emptyActivity: { color: colors.dimmed, fontSize: 10, paddingVertical: 12 },
  compareToggle: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 17, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, compareTitle: { color: colors.text, fontSize: 13, fontWeight: '900' }, compareCopy: { color: colors.muted, fontSize: 10, marginTop: 3 }, compareGrid: { gap: 10, marginTop: 10 }, compareGridWide: { flexDirection: 'row', alignItems: 'stretch' }, compareCard: { flex: 1, minWidth: 0, overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, compareCardCompact: { width: '100%' }, compareCardTop: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 12, backgroundColor: colors.elevated }, comparePlan: { color: colors.text, fontFamily: 'Georgia', fontSize: 17 }, compareCurrent: { color: colors.success, fontSize: 7, fontWeight: '900', letterSpacing: .6 }, compareRow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, compareLabel: { color: colors.dimmed, fontSize: 8, fontWeight: '900', letterSpacing: .4 }, compareValue: { color: colors.text, fontSize: 10, fontWeight: '800', marginTop: 3, textTransform: 'capitalize' },
  notice: { gap: 10, padding: 15, borderRadius: radius.lg, backgroundColor: 'rgba(154,99,215,.09)', borderWidth: 1, borderColor: 'rgba(175,162,255,.24)' }, noticeSuccess: { backgroundColor: 'rgba(77,162,116,.09)', borderColor: 'rgba(127,209,170,.26)' }, noticeWarning: { backgroundColor: 'rgba(222,166,75,.08)', borderColor: 'rgba(233,176,86,.26)' }, noticeDanger: { backgroundColor: 'rgba(211,92,94,.09)', borderColor: 'rgba(211,92,94,.28)' }, noticeTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, noticeTitle: { color: colors.text, fontSize: 13, fontWeight: '900' }, noticeCopy: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3 }, noticeAction: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.06)' }, noticeActionText: { color: '#E5C7F1', fontSize: 12, fontWeight: '900' },
  policyLinks: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6 }, policyLink: { minHeight: 44, textAlignVertical: 'center', color: colors.muted, fontSize: 10, fontWeight: '800', textDecorationLine: 'underline' }, policyDot: { color: colors.dimmed, fontSize: 9 }, errorCard: { gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, error: { color: colors.danger, fontSize: 11, textAlign: 'center' },
});
