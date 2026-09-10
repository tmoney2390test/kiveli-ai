import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Check, ChevronDown, ChevronRight, Globe2, Minus, Smartphone, Sparkles } from 'lucide-react-native';
import { hasOpenBuildWorldAccess } from '@together/domain/src/world-access';
import type { BillingInterval, SubscriptionPlan, SubscriptionTier } from '../../lib/subscription';
import { annualSavingsPercentage, membershipComparisonGroups, membershipContinuity, membershipPlanName, membershipPricePresentation, type MembershipComparisonValue } from '../../lib/subscriptionPresentation';
import { revenueCatPackageIdentifiers, type PurchasableTier } from '../../lib/revenueCatPurchases';
import { colors } from '../../theme';

export type MembershipPlanAction = { label: string; enabled: boolean; reason?: string | null; onPress: () => void };

type Props = {
  plans: SubscriptionPlan[];
  currentTier: SubscriptionTier;
  billingInterval: BillingInterval;
  onIntervalChange: (interval: BillingInterval) => void;
  nativePrices: Record<string, string>;
  actionFor: (plan: SubscriptionPlan) => MembershipPlanAction | null;
  busy: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

const planOrder: SubscriptionTier[] = ['free', 'kivelle_plus', 'kivelle_max'];

export function MembershipComparison({ plans: sourcePlans, currentTier, billingInterval, onIntervalChange, nativePrices, actionFor, busy, expanded, onExpandedChange }: Props) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const { fontScale } = useWindowDimensions();
  const compact = availableWidth / Math.max(1, fontScale) < 800;
  const plans = planOrder.map(tier => sourcePlans.find(plan => plan.tier === tier)).filter((plan): plan is SubscriptionPlan => Boolean(plan));
  const groups = membershipComparisonGroups(plans);
  const savings = plans.filter(plan => plan.annualPriceUsd).map(plan => annualSavingsPercentage(plan.monthlyPriceUsd, plan.annualPriceUsd));
  const guaranteedSavings = savings.length ? Math.min(...savings) : 0;

  return <View onLayout={event => setAvailableWidth(event.nativeEvent.layout.width)} style={styles.section}>
    <View style={[styles.heading, compact && styles.headingCompact]}>
      <View style={styles.headingCopy}>
        <Text style={styles.eyebrow}>THE WAY YOU EXPERIENCE KIVELLI</Text>
        <Text accessibilityRole="header" style={styles.title}>{currentTier === 'free' ? 'Choose your next chapter.' : 'Find your perfect fit.'}</Text>
        <Text style={styles.intro}>More connection with Plus. More possibilities with Max.</Text>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Compare membership billing intervals" style={styles.intervalToggle}>
        {(['monthly', 'annual'] as const).map(interval => <Pressable key={interval} accessibilityRole="radio" accessibilityState={{ checked: billingInterval === interval }} onPress={() => onIntervalChange(interval)} style={[styles.interval, billingInterval === interval && styles.intervalActive]}>
          <Text style={[styles.intervalText, billingInterval === interval && styles.intervalTextActive]}>{interval === 'annual' ? 'Yearly' : 'Monthly'}</Text>
          {interval === 'annual' && guaranteedSavings > 0 && Platform.OS === 'web' ? <Text style={styles.savings}>−{guaranteedSavings}%</Text> : null}
        </Pressable>)}
      </View>
    </View>

    <View style={[styles.cards, compact && styles.cardsCompact]}>
      {plans.map(plan => <MembershipPlanCard key={plan.tier} plan={plan} current={plan.tier === currentTier} billingInterval={billingInterval} localizedPrice={plan.tier === 'free' ? undefined : nativePrices[revenueCatPackageIdentifiers[plan.tier as PurchasableTier][billingInterval]]} action={actionFor(plan)} busy={busy} />)}
    </View>

    {Platform.OS === 'web' ? <View style={styles.storeNote}><Smartphone size={20} color={colors.muted} /><Text style={styles.noteText}>New memberships are available in the Kivelli iOS and Android apps. Sign in with the same account to use your membership here. Catalog prices shown in USD; your app store confirms the final price.</Text></View> : <Text style={styles.noteText}>Your app store confirms the price and billing terms before purchase. Memberships renew automatically until canceled.</Text>}

    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => onExpandedChange(!expanded)} style={({ pressed }) => [styles.detailsToggle, pressed && styles.pressed]}>
      <Text style={styles.detailsTitle}>{expanded ? 'Hide full comparison' : 'Compare every benefit'}</Text>
      <ChevronDown size={19} color={colors.muted} style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
    </Pressable>

    {expanded ? <View style={styles.comparison}>
      {!compact ? <View style={styles.tableHeader}>
        <View style={styles.labelCell}><Text style={styles.tableEyebrow}>INCLUDED WITH YOUR PLAN</Text></View>
        {plans.map(plan => <View key={plan.tier} style={[styles.valueCell, plan.tier === 'kivelle_max' && styles.maxColumn]}><Text style={styles.tablePlan}>{membershipPlanName(plan)}</Text>{plan.tier === currentTier ? <Text style={styles.currentLabel}>Your plan</Text> : null}</View>)}
      </View> : null}
      {groups.map(group => <View key={group.title}>
        <View style={styles.groupHeading}><Text accessibilityRole="header" style={styles.groupTitle}>{group.title}</Text></View>
        {group.rows.map(row => <View key={row.key} style={[styles.tableRow, compact && styles.tableRowCompact]}>
          <View style={[styles.labelCell, compact && styles.labelCellCompact]}><Text style={styles.rowLabel}>{row.label}</Text>{row.description ? <Text style={styles.rowDescription}>{row.description}</Text> : null}</View>
          {compact ? <View style={styles.mobileValues}>{plans.map((plan, index) => <View key={plan.tier} style={[styles.mobileValue, plan.tier === 'kivelle_max' && styles.mobileValueMax]}><Text style={styles.mobilePlan}>{plan.tier === 'free' ? 'Free' : plan.tier === 'kivelle_plus' ? 'Plus' : 'Max'}</Text><ComparisonValue value={row.values[index]!} compact /></View>)}</View> : plans.map((plan, index) => <View key={plan.tier} style={[styles.valueCell, plan.tier === 'kivelle_max' && styles.maxColumn]}><ComparisonValue value={row.values[index]!} /></View>)}
        </View>)}
      </View>)}
      {hasOpenBuildWorldAccess(true) ? <View style={styles.worldNote}><Globe2 size={20} color={colors.violet} /><Text style={styles.noteText}>Every published world is currently open to everyone, including Free members.</Text></View> : null}
      <View style={styles.termsNote}><Text style={styles.noteText}>Voice and video use Credits when available; unlimited messaging does not include unlimited media. Included photos reset each day, and daily request limits apply. Plan Credits roll over up to your plan’s cap; purchased Credits do not expire.</Text></View>
    </View> : null}
  </View>;
}

function MembershipPlanCard({ plan, current, billingInterval, localizedPrice, action, busy }: { plan: SubscriptionPlan; current: boolean; billingInterval: BillingInterval; localizedPrice?: string; action: MembershipPlanAction | null; busy: boolean }) {
  const max = plan.tier === 'kivelle_max';
  const free = plan.tier === 'free';
  const accent = max ? '#E7C58E' : free ? '#B7B4C1' : '#C1A8F5';
  const price = membershipPricePresentation(plan, billingInterval, localizedPrice);
  const continuity = membershipContinuity(plan);
  const highlights = free ? [
    `${plan.maxActiveConversations} active conversations`,
    plan.dailyMessageLimit === null ? 'Unlimited messages' : `${plan.dailyMessageLimit} messages each day`,
    `${plan.maxCustomCompanions} custom companion${plan.maxCustomCompanions === 1 ? '' : 's'}`,
  ] : [
    plan.dailyMessageLimit === null ? 'Unlimited messages' : `${plan.dailyMessageLimit} messages each day`,
    `${plan.maxActiveConversations} active conversations`,
    `${plan.includedCompanionPhotoDailyLimit} included photo${plan.includedCompanionPhotoDailyLimit === 1 ? '' : 's'} each day`,
    `${plan.maxCustomCompanions} custom companion${plan.maxCustomCompanions === 1 ? '' : 's'} · ${plan.maxLives} ${plan.maxLives === 1 ? 'Life' : 'Lives'}`,
  ];

  return <View style={[styles.planCard, max && styles.planCardMax, current && styles.planCardCurrent]}>
    <View style={[styles.accentLine, { backgroundColor: accent }]} />
    <View style={styles.cardTop}><Text style={[styles.cardEyebrow, { color: accent }]}>{free ? 'START EXPLORING' : max ? 'MOST IMMERSIVE' : 'MORE CONNECTION'}</Text>{current ? <View style={styles.currentBadge}><Check size={13} color={colors.success} /><Text style={styles.currentBadgeText}>Your plan</Text></View> : max ? <Sparkles size={18} color={accent} /> : null}</View>
    <Text accessibilityRole="header" style={styles.planName}>{membershipPlanName(plan)}</Text>
    <Text style={styles.tagline}>{free ? 'A place to begin.' : max ? 'For the stories you want to live in.' : 'For connections that keep growing.'}</Text>
    <View style={styles.priceRow}><Text style={styles.price}>{price.primary}</Text><Text style={styles.period}>{price.period}</Text></View>
    <Text style={styles.priceDetail}>{price.detail}{!free && !localizedPrice && Platform.OS !== 'web' ? ' · USD catalog price' : ''}</Text>
    <View style={[styles.creditHighlight, max && styles.creditHighlightMax]}>{free ? <><Text style={styles.creditNumber}>{plan.maxLives}</Text><Text style={styles.creditLabel}>{plan.maxLives === 1 ? 'Life to make your own' : 'Lives to make your own'}</Text></> : <><Text style={[styles.creditNumber, { color: accent }]}>{plan.monthlyCreditGrant.toLocaleString()}</Text><Text style={styles.creditLabel}>Credits every month</Text></>}</View>
    <View style={styles.highlights}>{highlights.map(item => <View key={item} style={styles.highlight}><Check size={17} color={accent} /><Text style={styles.highlightText}>{item}</Text></View>)}</View>
    <View style={styles.continuity}><Text style={styles.continuityTitle}>{continuity.title}</Text><Text style={styles.continuityCopy}>{continuity.detail}</Text></View>
    {current ? <View style={styles.currentAction}><Check size={17} color={colors.success} /><Text style={styles.currentActionText}>Current membership</Text></View> : action?.enabled ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={action.onPress} style={({ pressed }) => [styles.action, max && styles.actionMax, busy && styles.disabled, pressed && styles.pressed]}><Text style={[styles.actionText, max && styles.actionTextMax]}>{busy ? 'Please wait…' : action.label}</Text><ChevronRight size={17} color={max ? '#201728' : '#FFF8F4'} /></Pressable> : <View style={styles.unavailable}><Text style={styles.unavailableTitle}>{action?.label || 'Included with your account'}</Text>{action?.reason && !(free || Platform.OS === 'web' && action.label === 'Join in the app') ? <Text style={styles.unavailableCopy}>{action.reason}</Text> : null}</View>}
  </View>;
}

function ComparisonValue({ value, compact = false }: { value: MembershipComparisonValue; compact?: boolean }) {
  return <View style={[styles.comparisonValue, compact && styles.comparisonValueCompact]}>{value.included === true ? <Check size={16} color={colors.success} /> : value.included === false ? <Minus size={16} color={colors.muted} /> : null}<Text style={[styles.valueText, value.included === false && styles.valueMuted]}>{value.text}</Text></View>;
}

const styles = StyleSheet.create({
  section: { gap: 20 },
  heading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 },
  headingCompact: { flexDirection: 'column', alignItems: 'stretch' },
  headingCopy: { flex: 1, gap: 8 },
  eyebrow: { color: '#C1A8F5', fontSize: 12, lineHeight: 18, fontWeight: '700', letterSpacing: 1.5 },
  title: { color: colors.text, fontFamily: 'Georgia', fontSize: 34, lineHeight: 42 },
  intro: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  intervalToggle: { flexDirection: 'row', alignSelf: 'flex-start', padding: 4, borderRadius: 14, backgroundColor: '#100F18', borderWidth: 1, borderColor: colors.border },
  interval: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  intervalActive: { backgroundColor: '#31263E' },
  intervalText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  intervalTextActive: { color: colors.text },
  savings: { color: '#D6BDFC', fontSize: 12, fontWeight: '700' },
  cards: { flexDirection: 'row', gap: 16, alignItems: 'stretch' },
  cardsCompact: { flexDirection: 'column' },
  planCard: { position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden', backgroundColor: '#13111B', borderWidth: 1, borderColor: '#35303F', borderRadius: 20, padding: 24, gap: 8 },
  planCardMax: { backgroundColor: '#211925', borderColor: '#92764F', ...(Platform.OS === 'web' ? { backgroundImage: 'linear-gradient(150deg, #302333 0%, #1C1622 65%)' } as never : {}) },
  planCardCurrent: { borderColor: '#6D8F7D' },
  accentLine: { position: 'absolute', top: 0, left: 24, right: 24, height: 2 },
  cardTop: { minHeight: 28, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 },
  cardEyebrow: { fontSize: 12, lineHeight: 18, letterSpacing: 1.1, fontWeight: '700' },
  currentBadge: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  currentBadgeText: { color: colors.success, fontSize: 12, fontWeight: '600' },
  planName: { color: colors.text, fontFamily: 'Georgia', fontSize: 29, lineHeight: 36 },
  tagline: { color: colors.muted, fontSize: 14, lineHeight: 21, minHeight: 42 },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 5, marginTop: 10 },
  price: { color: colors.text, fontSize: 40, lineHeight: 48, fontWeight: '600', letterSpacing: -1.4, fontVariant: ['tabular-nums'] },
  period: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  priceDetail: { color: colors.muted, fontSize: 13, lineHeight: 20, minHeight: 40 },
  creditHighlight: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 12, minHeight: 64, padding: 12, backgroundColor: 'rgba(182,154,220,.065)', borderRadius: 12 },
  creditHighlightMax: { backgroundColor: 'rgba(220,186,128,.07)' },
  creditNumber: { color: colors.text, fontSize: 27, lineHeight: 34, fontWeight: '600', fontVariant: ['tabular-nums'] },
  creditLabel: { flexShrink: 1, color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  highlights: { gap: 14, flex: 1 },
  highlight: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  highlightText: { flex: 1, color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
  continuity: { marginTop: 16, marginBottom: 14, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border, gap: 7 },
  continuityTitle: { color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  continuityCopy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  action: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#68438D' },
  actionMax: { backgroundColor: '#E7C58E' },
  actionText: { flexShrink: 1, color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: '700', textAlign: 'center' },
  actionTextMax: { color: '#201728' },
  currentAction: { minHeight: 50, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 12, backgroundColor: 'rgba(127,209,170,.06)', borderWidth: 1, borderColor: 'rgba(127,209,170,.2)', borderRadius: 12 },
  currentActionText: { flexShrink: 1, color: colors.success, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  unavailable: { minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 5, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.035)' },
  unavailableTitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, fontWeight: '600', textAlign: 'center' },
  unavailableCopy: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  storeNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 4 },
  noteText: { flex: 1, color: colors.muted, fontSize: 14, lineHeight: 22 },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 20, minHeight: 56, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailsTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  comparison: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, overflow: 'hidden', backgroundColor: '#100E17' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#19151F' },
  tableEyebrow: { color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '600', letterSpacing: .6 },
  tablePlan: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: '600', textAlign: 'center' },
  currentLabel: { color: colors.success, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  groupHeading: { paddingVertical: 14, paddingHorizontal: 20, backgroundColor: '#1D1726', borderTopWidth: 1, borderTopColor: colors.border },
  groupTitle: { color: '#D9C8F1', fontSize: 14, lineHeight: 22, fontWeight: '600' },
  tableRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.055)' },
  tableRowCompact: { flexDirection: 'column', padding: 16, gap: 12 },
  labelCell: { flex: 1.45, justifyContent: 'center', padding: 18, minWidth: 0, gap: 4 },
  labelCellCompact: { flex: 0, padding: 0 },
  rowLabel: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, fontWeight: '500' },
  rowDescription: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  valueCell: { flex: 1, minWidth: 0, paddingVertical: 18, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', gap: 4 },
  maxColumn: { backgroundColor: 'rgba(196,161,102,.035)', borderLeftWidth: 1, borderLeftColor: 'rgba(196,161,102,.13)' },
  comparisonValue: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center', justifyContent: 'center' },
  comparisonValueCompact: { flexDirection: 'column' },
  valueText: { flexShrink: 1, color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: '500', textAlign: 'center', fontVariant: ['tabular-nums'] },
  valueMuted: { color: colors.muted, fontWeight: '400' },
  mobileValues: { flexDirection: 'row', gap: 6 },
  mobileValue: { flex: 1, minWidth: 0, padding: 8, gap: 7, alignItems: 'center', backgroundColor: 'rgba(255,255,255,.025)', borderRadius: 10 },
  mobileValueMax: { backgroundColor: 'rgba(196,161,102,.065)' },
  mobilePlan: { color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  worldNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 20, borderTopWidth: 1, borderTopColor: colors.border },
  termsNote: { padding: 20, paddingTop: 10 },
  pressed: { opacity: .8 },
  disabled: { opacity: .5 },
});
