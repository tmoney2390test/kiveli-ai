import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Check, ChevronDown, Coins, CreditCard, Sparkles, Zap } from 'lucide-react-native';
import { GradientButton, LoadingSkeleton, PageTitle, Screen } from '../src/components';
import { manageSubscription } from '../src/lib/api';
import { intelligenceLabel, tierDescription, type SubscriptionPlan, type SubscriptionStatus, type SubscriptionTier } from '../src/lib/subscription';
import { colors, radius, spacing } from '../src/theme';

const tierRank: Record<SubscriptionTier, number> = { free: 0, kivelle_plus: 1, kivelle_max: 2 };

export default function Subscription() {
  const [state, setState] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [compareOpen, setCompareOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try { setState(await manageSubscription<SubscriptionStatus>()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Subscription details could not be loaded.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  if (loading && !state) return <LoadingSkeleton label="Loading Kivelle plans…" />;
  if (!state) return <Screen><View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><ArrowLeft color={colors.text} /></Pressable><PageTitle>Subscription & Credits</PageTitle></View><View style={styles.errorCard}><Text style={styles.error}>{error || 'Subscription details are unavailable.'}</Text><GradientButton label="Try again" onPress={() => void load()} /></View></Screen>;

  const current = state.catalog.find((plan) => plan.tier === state.tier) ?? state.capabilities;
  const orderedPlans = (['kivelle_plus', 'kivelle_max', 'free'] as SubscriptionTier[])
    .map((tier) => state.catalog.find((plan) => plan.tier === tier))
    .filter((plan): plan is SubscriptionPlan => Boolean(plan));
  const nextRefill = state.tier !== 'free' && state.billing.periodEnd ? formatDate(state.billing.periodEnd) : null;

  const checkout = async (tier: Exclude<SubscriptionTier, 'free'>) => {
    if (!state.billingConfigured[tier]) {
      Alert.alert('Checkout not configured', 'The plan is ready in Kivelle, but a live checkout URL has not been configured for this build yet.');
      return;
    }
    setBusy(tier);
    try { const result = await manageSubscription<{ url: string }>({ action: 'checkout', tier }); await Linking.openURL(result.url); }
    catch (caught) { Alert.alert('Could not open checkout', caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { setBusy(''); }
  };

  const openAction = async (action: 'credits_checkout' | 'portal') => {
    const configured = action === 'credits_checkout' ? state.billingConfigured.credits : state.billingConfigured.portal;
    if (!configured) {
      Alert.alert(action === 'portal' ? 'Billing portal not configured' : 'Credit checkout not configured', 'Connect your billing provider URL to enable this action.');
      return;
    }
    setBusy(action);
    try { const result = await manageSubscription<{ url: string }>({ action }); await Linking.openURL(result.url); }
    catch (caught) { Alert.alert('Could not open billing', caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { setBusy(''); }
  };

  return <Screen contentStyle={styles.content}>
    <View style={styles.header}>
      <Pressable accessibilityLabel="Back to Settings" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} style={styles.back}><ArrowLeft color={colors.text} /></Pressable>
      <View style={{ flex: 1 }}><PageTitle>Subscription & Credits</PageTitle><Text style={styles.subtitle}>More continuity, more worlds, and premium media when you want it.</Text></View>
    </View>

    <View style={styles.hero}>
      <View pointerEvents="none" style={styles.glowOne} />
      <View pointerEvents="none" style={styles.glowTwo} />
      <View style={styles.heroTop}>
        <View style={{ flex: 1 }}>
          <View style={styles.eyebrowRow}><Sparkles size={14} color="#F3B7D0" /><Text style={styles.heroEyebrow}>YOUR KIVELLE EXPERIENCE</Text></View>
          <Text style={styles.heroTitle}>Make the relationship feel more alive.</Text>
          <Text style={styles.heroCopy}>Unlock deeper continuity, more Lives and worlds, and monthly Kivelle Credits for premium visual experiences.</Text>
        </View>
        <View style={styles.currentPill}><Check size={12} color="#fff" /><Text style={styles.currentPillText}>{current.displayName.toUpperCase()}</Text></View>
      </View>
      <View style={styles.heroBottom}>
        <View><Text style={styles.metaLabel}>CURRENT PLAN</Text><Text style={styles.metaValue}>{current.displayName}</Text></View>
        <View style={styles.heroDivider} />
        <View><Text style={styles.metaLabel}>AVAILABLE CREDITS</Text><Text style={styles.creditBig}>{state.creditBalance.total.toLocaleString()}</Text></View>
      </View>
    </View>

    <BillingIntervalToggle onYearly={() => Alert.alert('Yearly billing is coming next', 'The interface is ready for yearly plans, but Kivelle will not invent a discount before yearly products are configured.')} />

    <View style={styles.sectionHeading}>
      <View><Text style={styles.sectionKicker}>CHOOSE YOUR EXPERIENCE</Text><Text style={styles.sectionTitle}>Go deeper with Kivelle</Text></View>
      <Text style={styles.sectionHint}>Upgrade anytime</Text>
    </View>

    <View style={styles.plans}>{orderedPlans.map((plan) => {
      const currentPlan = plan.tier === state.tier;
      const downgrade = tierRank[plan.tier] < tierRank[state.tier];
      const checkoutConfigured = plan.tier === 'free' ? true : state.billingConfigured[plan.tier];
      const actionConfigured = downgrade ? state.billingConfigured.portal : checkoutConfigured;
      const actionLabel = downgrade ? 'Manage plan' : plan.tier === 'kivelle_max' ? 'Upgrade to Kivelle Max' : plan.tier === 'kivelle_plus' ? 'Upgrade to Kivelle+' : '';
      const actionBusy = busy === plan.tier || busy === 'portal';
      return <PlanCard key={plan.tier} plan={plan} current={currentPlan} actionLabel={actionLabel} actionConfigured={actionConfigured} busy={actionBusy} onAction={() => {
        if (downgrade) { void openAction('portal'); return; }
        if (plan.tier !== 'free') void checkout(plan.tier);
      }} />;
    })}</View>

    <View style={styles.creditsPanel}>
      <View pointerEvents="none" style={styles.creditGlow} />
      <View style={styles.creditsHeading}>
        <View style={styles.creditIcon}><Coins color="#FFD29B" size={22} /></View>
        <View style={{ flex: 1 }}><Text style={styles.sectionKicker}>KIVELLE CREDITS</Text><Text style={styles.creditsTitle}>Premium generation, on your terms.</Text></View>
      </View>
      <View style={styles.balanceRow}>
        <View><Text style={styles.balanceNumber}>{state.creditBalance.total.toLocaleString()}</Text><Text style={styles.balanceLabel}>AVAILABLE</Text></View>
        <View style={styles.balanceBreakdown}>
          <MiniStat label="Included monthly" value={current.monthlyCreditGrant ? current.monthlyCreditGrant.toLocaleString() : '—'} />
          <MiniStat label="Subscription balance" value={state.creditBalance.subscriptionBalance.toLocaleString()} />
          <MiniStat label="Permanent / welcome" value={state.creditBalance.permanentBalance.toLocaleString()} />
          <MiniStat label="Next refill" value={nextRefill ?? 'No monthly refill'} />
        </View>
      </View>
      <Text style={styles.creditsCopy}>Credits are used for companion photos, alternate looks, and other premium media. Chat, relationships, memories, Plans, Dates, Stories, and Moments never spend credits.</Text>
      <View style={styles.creditActions}>
        <GradientButton disabled={busy === 'credits_checkout'} label={busy === 'credits_checkout' ? 'Opening credits…' : 'Buy Credits'} onPress={() => void openAction('credits_checkout')} />
        <View style={styles.costStrip}>
          <Cost label="Companion photo" value={state.creditCosts.companion_photo ?? 10} />
          <Cost label="Photo variant" value={state.creditCosts.photo_variant ?? 10} />
          <Cost label="4 Creator looks" value={state.creditCosts.creator_appearance_set ?? 40} />
        </View>
      </View>
      <Text style={styles.refundNote}>Failed paid generations refund automatically. Purchased credits do not expire.</Text>
    </View>

    <Pressable onPress={() => setCompareOpen((value) => !value)} style={styles.compareToggle}>
      <View><Text style={styles.compareTitle}>Compare plans</Text><Text style={styles.compareCopy}>See the differences across the full Kivelle experience.</Text></View>
      <View style={{ transform: [{ rotate: compareOpen ? '180deg' : '0deg' }] }}><ChevronDown size={19} color={colors.muted} /></View>
    </Pressable>
    {compareOpen ? <Comparison plans={state.catalog} /> : null}

    {state.tier !== 'free' ? <Pressable onPress={() => void openAction('portal')} style={styles.portal}><CreditCard size={17} color={colors.muted} /><Text style={styles.portalText}>{busy === 'portal' ? 'Opening billing…' : 'Manage billing'}</Text></Pressable> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </Screen>;
}

function BillingIntervalToggle({ onYearly }: { onYearly: () => void }) {
  return <View style={styles.billingWrap}>
    <View style={[styles.billingChoice, styles.billingChoiceActive]}><Text style={[styles.billingText, styles.billingTextActive]}>Monthly</Text></View>
    <Pressable onPress={onYearly} style={styles.billingChoice}><Text style={styles.billingText}>Yearly</Text><View style={styles.soonPill}><Text style={styles.soonText}>SOON</Text></View></Pressable>
  </View>;
}

function PlanCard({ plan, current, actionLabel, actionConfigured, busy, onAction }: { plan: SubscriptionPlan; current: boolean; actionLabel: string; actionConfigured: boolean; busy: boolean; onAction: () => void }) {
  const featured = plan.tier === 'kivelle_plus';
  const max = plan.tier === 'kivelle_max';
  const features = plan.tier === 'free' ? [
    'Core relationship continuity', '1 Life · 1 custom companion', 'Free worlds', 'Welcome credits included',
  ] : [
    plan.chatDailyLimit === null ? 'Unlimited chat' : 'Daily chat',
    intelligenceLabel(plan.intelligenceProfile),
    plan.worldAccess === 'all_standard' ? 'Standard subscription worlds' : 'Free worlds',
    `${plan.maxLives} Lives · ${plan.maxCustomCompanions} custom companions`,
    `${plan.monthlyCreditGrant.toLocaleString()} Kivelle Credits / month`,
    plan.mediaQueue === 'highest' ? 'Highest media priority' : 'Priority media queue',
    ...(plan.earlyWorldAccess ? ['Early access worlds'] : []),
  ];

  return <View style={[styles.plan, featured && styles.planFeatured, max && styles.planMax, current && styles.planCurrent]}>
    {featured ? <View style={styles.popular}><Sparkles size={11} color="#fff" /><Text style={styles.popularText}>MOST POPULAR</Text></View> : null}
    <View style={styles.planTop}>
      <View style={{ flex: 1 }}><Text style={styles.planName}>{plan.displayName}</Text><Text style={styles.planPrice}>{plan.monthlyPriceUsd === 0 ? 'Free' : `$${plan.monthlyPriceUsd.toFixed(2)}`}<Text style={styles.planPeriod}>{plan.monthlyPriceUsd === 0 ? '' : ' / month'}</Text></Text></View>
      {current ? <View style={styles.activeBadge}><Check size={12} color={colors.success} /><Text style={styles.activeBadgeText}>CURRENT</Text></View> : max ? <View style={styles.maxBadge}><Zap size={11} color="#D8C1FF" /><Text style={styles.maxBadgeText}>DEEPEST</Text></View> : null}
    </View>
    <Text style={styles.planCopy}>{tierDescription(plan.tier)}</Text>
    <View style={styles.featureList}>{features.map((feature) => <View key={feature} style={styles.feature}><View style={styles.featureCheck}><Check size={11} color={featured ? '#FFB9D2' : max ? '#D8C1FF' : colors.success} /></View><Text style={styles.featureText}>{feature}</Text></View>)}</View>
    {current ? <View style={styles.currentButton}><Check size={15} color={colors.success} /><Text style={styles.currentButtonText}>Current plan</Text></View> : actionLabel ? <GradientButton disabled={busy || !actionConfigured} label={busy ? 'Opening billing…' : actionConfigured ? actionLabel : 'Checkout not configured'} onPress={onAction} /> : null}
  </View>;
}

function Comparison({ plans }: { plans: SubscriptionPlan[] }) {
  const free = plans.find((plan) => plan.tier === 'free');
  const plus = plans.find((plan) => plan.tier === 'kivelle_plus');
  const max = plans.find((plan) => plan.tier === 'kivelle_max');
  if (!free || !plus || !max) return null;
  const rows: Array<[string, string, string, string]> = [
    ['Chat', free.chatDailyLimit === null ? 'Unlimited' : 'Daily limit', 'Unlimited', 'Unlimited'],
    ['Intelligence', intelligenceLabel(free.intelligenceProfile), intelligenceLabel(plus.intelligenceProfile), intelligenceLabel(max.intelligenceProfile)],
    ['Lives', String(free.maxLives), String(plus.maxLives), String(max.maxLives)],
    ['Custom companions', String(free.maxCustomCompanions), String(plus.maxCustomCompanions), String(max.maxCustomCompanions)],
    ['Worlds', 'Free', 'Standard', 'Standard + early'],
    ['Monthly credits', '—', plus.monthlyCreditGrant.toLocaleString(), max.monthlyCreditGrant.toLocaleString()],
    ['Media priority', 'Standard', 'Priority', 'Highest'],
  ];
  return <View style={styles.compareCard}>
    <View style={styles.compareHeader}><Text style={styles.compareHeaderLabel}>FEATURE</Text><Text style={styles.compareHeaderPlan}>FREE</Text><Text style={styles.compareHeaderPlan}>PLUS</Text><Text style={styles.compareHeaderPlan}>MAX</Text></View>
    {rows.map(([label, freeValue, plusValue, maxValue]) => <View key={label} style={styles.compareRow}><Text style={styles.compareLabel}>{label}</Text><Text style={styles.compareValue}>{freeValue}</Text><Text style={[styles.compareValue, styles.comparePlus]}>{plusValue}</Text><Text style={[styles.compareValue, styles.compareMax]}>{maxValue}</Text></View>)}
  </View>;
}

function MiniStat({ label, value }: { label: string; value: string }) { return <View style={styles.miniStat}><Text style={styles.miniLabel}>{label}</Text><Text style={styles.miniValue}>{value}</Text></View>; }
function Cost({ label, value }: { label: string; value: number }) { return <View style={styles.cost}><Text style={styles.costLabel}>{label}</Text><View style={styles.costValueRow}><Coins size={11} color="#FFD29B" /><Text style={styles.costValue}>{value}</Text></View></View>; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'At renewal' : date.toLocaleDateString([], { month: 'short', day: 'numeric' }); }

const styles = StyleSheet.create({
  content: { gap: spacing.lg, maxWidth: 780, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  hero: { position: 'relative', overflow: 'hidden', gap: 24, padding: 22, borderRadius: radius.xl, backgroundColor: '#1A1124', borderWidth: 1, borderColor: 'rgba(216,62,234,.38)', shadowColor: '#A85CFF', shadowOpacity: .22, shadowRadius: 28, shadowOffset: { width: 0, height: 14 } },
  glowOne: { position: 'absolute', width: 230, height: 230, borderRadius: 115, right: -86, top: -96, backgroundColor: 'rgba(154,99,215,.28)' },
  glowTwo: { position: 'absolute', width: 210, height: 210, borderRadius: 105, left: -105, bottom: -130, backgroundColor: 'rgba(216,62,234,.20)' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heroEyebrow: { color: '#F3B7D0', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  heroTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 31, lineHeight: 37, marginTop: 10, maxWidth: 520 },
  heroCopy: { color: '#CDBFCC', fontSize: 12, lineHeight: 19, marginTop: 9, maxWidth: 560 },
  currentPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(216,62,234,.78)' },
  currentPillText: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: .7 },
  heroBottom: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.10)' },
  heroDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,.11)' },
  metaLabel: { color: '#9E8EA2', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  metaValue: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 4 },
  creditBig: { color: '#FFD3A9', fontFamily: 'Georgia', fontSize: 25, marginTop: 1 },
  billingWrap: { alignSelf: 'center', flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  billingChoice: { minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 17, borderRadius: radius.pill },
  billingChoiceActive: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: 'rgba(216,62,234,.35)' },
  billingText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  billingTextActive: { color: colors.text },
  soonPill: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(154,99,215,.16)' },
  soonText: { color: '#D8C1FF', fontSize: 7, fontWeight: '900', letterSpacing: .6 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  sectionKicker: { color: colors.rose, fontSize: 9, fontWeight: '900', letterSpacing: 1.15 },
  sectionTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 24, marginTop: 4 },
  sectionHint: { color: colors.dimmed, fontSize: 10, fontWeight: '700' },
  plans: { gap: 12 },
  plan: { position: 'relative', overflow: 'hidden', gap: 13, padding: 18, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  planFeatured: { paddingTop: 24, backgroundColor: '#211226', borderColor: 'rgba(216,62,234,.48)', shadowColor: '#D83EEA', shadowOpacity: .16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  planMax: { backgroundColor: '#171321', borderColor: 'rgba(154,99,215,.34)' },
  planCurrent: { borderColor: 'rgba(127,209,170,.48)' },
  popular: { position: 'absolute', top: 0, right: 18, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, backgroundColor: colors.rose },
  popularText: { color: '#fff', fontSize: 7, fontWeight: '900', letterSpacing: .7 },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  planName: { color: colors.text, fontFamily: 'Georgia', fontSize: 27 },
  planPrice: { color: '#F4C4D5', fontFamily: 'Georgia', fontSize: 24, marginTop: 4 },
  planPeriod: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(127,209,170,.11)', borderWidth: 1, borderColor: 'rgba(127,209,170,.24)' },
  activeBadgeText: { color: colors.success, fontSize: 8, fontWeight: '900', letterSpacing: .7 },
  maxBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(154,99,215,.12)' },
  maxBadgeText: { color: '#D8C1FF', fontSize: 8, fontWeight: '900', letterSpacing: .7 },
  planCopy: { color: colors.muted, fontSize: 11, lineHeight: 17, maxWidth: 610 },
  featureList: { gap: 9 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  featureCheck: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.045)' },
  featureText: { flex: 1, color: colors.text, fontSize: 11, fontWeight: '700' },
  currentButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(127,209,170,.22)', backgroundColor: 'rgba(127,209,170,.06)' },
  currentButtonText: { color: colors.success, fontWeight: '900' },
  creditsPanel: { position: 'relative', overflow: 'hidden', gap: 15, padding: 19, borderRadius: radius.xl, backgroundColor: '#17131D', borderWidth: 1, borderColor: 'rgba(233,160,127,.30)' },
  creditGlow: { position: 'absolute', width: 200, height: 200, borderRadius: 100, right: -110, top: -85, backgroundColor: 'rgba(233,160,127,.14)' },
  creditsHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  creditIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(233,160,127,.12)', borderWidth: 1, borderColor: 'rgba(233,160,127,.24)' },
  creditsTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 21, marginTop: 3 },
  balanceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' },
  balanceNumber: { color: '#FFD3A9', fontFamily: 'Georgia', fontSize: 42, lineHeight: 46 },
  balanceLabel: { color: colors.dimmed, fontSize: 8, fontWeight: '900', letterSpacing: 1.1, marginTop: 2 },
  balanceBreakdown: { flex: 1, minWidth: 240, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miniStat: { width: '48%', minWidth: 112, padding: 10, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)' },
  miniLabel: { color: colors.dimmed, fontSize: 8, fontWeight: '800' },
  miniValue: { color: colors.text, fontSize: 12, fontWeight: '800', marginTop: 4 },
  creditsCopy: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  creditActions: { gap: 10 },
  costStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cost: { flex: 1, minWidth: 145, padding: 10, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)' },
  costLabel: { color: colors.muted, fontSize: 9 },
  costValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  costValue: { color: '#FFD3A9', fontSize: 11, fontWeight: '900' },
  refundNote: { color: colors.dimmed, fontSize: 9, lineHeight: 14 },
  compareToggle: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 15, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  compareTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  compareCopy: { color: colors.muted, fontSize: 10, marginTop: 3 },
  compareCard: { overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  compareHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 10, backgroundColor: colors.elevated },
  compareHeaderLabel: { flex: 1.35, color: colors.dimmed, fontSize: 8, fontWeight: '900', letterSpacing: .8 },
  compareHeaderPlan: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 8, fontWeight: '900' },
  compareRow: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingHorizontal: 11, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  compareLabel: { flex: 1.35, color: colors.muted, fontSize: 9, fontWeight: '800' },
  compareValue: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 9, lineHeight: 13 },
  comparePlus: { color: '#F2B4CA', fontWeight: '800' },
  compareMax: { color: '#D8C1FF', fontWeight: '800' },
  portal: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  portalText: { color: colors.muted, fontWeight: '800' },
  errorCard: { gap: 14, padding: 18, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  error: { color: colors.danger, fontSize: 11, textAlign: 'center' },
});
