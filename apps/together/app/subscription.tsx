import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, ChevronDown, ChevronRight, CreditCard } from 'lucide-react-native';
import { GradientButton, KivelleCreditIcon, LoadingSkeleton, PageTitle, Screen } from '../src/components';
import { manageSubscription } from '../src/lib/api';
import { intelligenceLabel, type BillingInterval,type CreditPack,type SubscriptionPlan, type SubscriptionStatus, type SubscriptionTier } from '../src/lib/subscription';
import { colors, radius, spacing } from '../src/theme';

const tierRank: Record<SubscriptionTier, number> = { free: 0, kivelle_plus: 1, kivelle_max: 2 };

export default function Subscription() {
  const params=useLocalSearchParams<{checkout?:string;purchase?:string;session_id?:string}>();
  const [state, setState] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [compareOpen, setCompareOpen] = useState(false);
  const [billingInterval,setBillingInterval]=useState<BillingInterval>('annual');
  const [selectedTier,setSelectedTier]=useState<Exclude<SubscriptionTier,'free'>>('kivelle_plus');
  const [selectedCreditPack,setSelectedCreditPack]=useState<CreditPack['key']|''>('');
  const [confirming,setConfirming]=useState(false);
  const [confirmationDelayed,setConfirmationDelayed]=useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try { setState(await manageSubscription<SubscriptionStatus>()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Subscription details could not be loaded.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);
  useEffect(()=>{
    if(params.checkout!=='success')return;
    let cancelled=false,attempt=0;
    setConfirming(true);
    setConfirmationDelayed(false);
    const poll=async()=>{
      if(cancelled)return;
      attempt+=1;
      try{
        const confirmation=params.session_id?await manageSubscription<{confirmed:boolean}>({action:'checkout_confirmation',sessionId:params.session_id}):{confirmed:false};
        const next=await manageSubscription<SubscriptionStatus>();if(!cancelled)setState(next);
        if(confirmation.confirmed){setConfirming(false);router.setParams({checkout:undefined,purchase:undefined,session_id:undefined});return;}
      }catch{/* Keep the existing summary visible while Stripe/webhooks settle. */}
      if(cancelled)return;
      if(attempt<14)setTimeout(()=>void poll(),1500);else{setConfirming(false);setConfirmationDelayed(true);router.setParams({checkout:undefined,purchase:undefined,session_id:undefined});}
    };
    void poll();
    return()=>{cancelled=true;};
  },[params.checkout,params.purchase,params.session_id]);
  useEffect(()=>{if(state?.tier==='kivelle_max')setSelectedTier('kivelle_max');},[state?.tier]);
  useEffect(()=>{const packs=(state?.creditPacks??[]).filter((pack)=>pack.active);const defaultPack=packs.find((pack)=>pack.popular)??packs[0];if(!defaultPack)return;if(!packs.some((pack)=>pack.key===selectedCreditPack))setSelectedCreditPack(defaultPack.key);},[selectedCreditPack,state?.creditPacks]);

  if (loading && !state) return <LoadingSkeleton label="Loading Kivelle plans…" />;
  if (!state) return <Screen><View style={styles.header}><Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} style={styles.back}><ArrowLeft color={colors.text} /></Pressable><PageTitle>Plan & Credits</PageTitle></View><View style={styles.errorCard}><Text style={styles.error}>{error || 'Subscription details are unavailable.'}</Text><GradientButton label="Try again" onPress={() => void load()} /></View></Screen>;

  const paidPlans = (['kivelle_plus', 'kivelle_max'] as const)
    .map((tier) => state.catalog.find((plan) => plan.tier === tier))
    .filter((plan): plan is SubscriptionPlan => Boolean(plan));
  const selectedPlan=paidPlans.find((plan)=>plan.tier===selectedTier)??paidPlans[0];
  const activeCreditPacks=(state.creditPacks??[]).filter((pack)=>pack.active);
  const selectedPack=activeCreditPacks.find((pack)=>pack.key===selectedCreditPack)??activeCreditPacks.find((pack)=>pack.popular)??activeCreditPacks[0];

  const checkout = async (tier: Exclude<SubscriptionTier, 'free'>) => {
    const checkoutConfigured=billingInterval==='annual'?Boolean(state.billingConfiguredAnnual?.[tier]):state.billingConfigured[tier];
    if (!checkoutConfigured) {
      Alert.alert('Checkout not configured', 'The plan is ready in Kivelle, but a live checkout URL has not been configured for this build yet.');
      return;
    }
    setBusy(tier);
    try { const result = await manageSubscription<{ url: string }>({ action: 'checkout', tier,billingInterval,requestId:Crypto.randomUUID() }); await Linking.openURL(result.url); }
    catch (caught) { Alert.alert('Could not open checkout', caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { setBusy(''); }
  };

  const openAction = async (action: 'credits_checkout' | 'portal',pack?:CreditPack) => {
    const configured = action === 'credits_checkout' ? state.billingConfigured.credits : state.billingConfigured.portal;
    if (!configured) {
      Alert.alert(action === 'portal' ? 'Billing portal not configured' : 'Credit checkout not configured', 'Connect your billing provider URL to enable this action.');
      return;
    }
    if(action==='credits_checkout'&&!pack)return;
    setBusy(pack?.key??action);
    try { const result = await manageSubscription<{ url: string }>({ action,...(pack?{productKey:pack.key}:{}),requestId:Crypto.randomUUID() }); await Linking.openURL(result.url); }
    catch (caught) { Alert.alert('Could not open billing', caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { setBusy(''); }
  };

  if(!selectedPlan)return <Screen><View style={styles.errorCard}><Text style={styles.error}>Paid plans are temporarily unavailable.</Text></View></Screen>;
  const selectedPaidTier=selectedPlan.tier as Exclude<SubscriptionTier,'free'>;
  const selectedCurrent=selectedPlan.tier===state.tier;
  const selectedDowngrade=tierRank[selectedPlan.tier]<tierRank[state.tier];
  const selectedConfigured=selectedCurrent||selectedDowngrade
    ?state.billingConfigured.portal
    :billingInterval==='annual'
      ?Boolean(state.billingConfiguredAnnual?.[selectedPaidTier])
      :state.billingConfigured[selectedPaidTier];
  const selectedBusy=busy===selectedPlan.tier||busy==='portal';

  return <Screen contentStyle={styles.content}>
    <View style={styles.header}>
      <Pressable accessibilityLabel="Back to Settings" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} style={styles.back}><ArrowLeft color={colors.text} /></Pressable>
      <View style={{ flex: 1 }}><PageTitle>Plan & Credits</PageTitle></View>
    </View>

    <View style={styles.upgradeIntro}>
      <Text style={styles.upgradeTitle}>Unlock more of Kivelle</Text>
      <Text style={styles.upgradeCopy}>Deeper continuity, more ways to connect, and premium media. Cancel anytime.</Text>
    </View>

    {confirming?<View style={styles.billingNotice}><Text style={styles.billingNoticeTitle}>Confirming your purchase…</Text><Text style={styles.billingNoticeCopy}>Stripe is verifying payment. Access and credits appear only after the signed billing update arrives.</Text></View>:null}
    {confirmationDelayed?<Pressable onPress={()=>{setConfirmationDelayed(false);void load();}} style={styles.billingNotice}><Text style={styles.billingNoticeTitle}>Still waiting for Stripe?</Text><Text style={styles.billingNoticeCopy}>Confirmation can occasionally take a little longer. Tap to refresh your billing status.</Text></Pressable>:null}
    {state.billing.paymentIssue?<View style={[styles.billingNotice,styles.billingProblem]}><Text style={styles.billingNoticeTitle}>Payment needs attention</Text><Text style={styles.billingNoticeCopy}>Update your payment method in Manage subscription to keep access active.</Text></View>:null}
    {state.billing.cancelAtPeriodEnd?<View style={styles.billingNotice}><Text style={styles.billingNoticeTitle}>Cancellation scheduled</Text><Text style={styles.billingNoticeCopy}>Your plan remains available through {formatBillingDate(state.billing.expiresAt??state.billing.periodEnd)}.</Text></View>:null}

    <TierToggle plans={paidPlans} value={selectedTier} currentTier={state.tier} onChange={setSelectedTier}/>
    <PlanCard
      plan={selectedPlan}
      billingInterval={selectedCurrent?(state.billing.billingInterval??billingInterval):billingInterval}
      current={selectedCurrent}
      downgrade={selectedDowngrade}
      actionConfigured={selectedConfigured}
      busy={selectedBusy}
      onBillingChange={setBillingInterval}
      onAction={()=>{
        if(selectedCurrent||selectedDowngrade){void openAction('portal');return;}
        void checkout(selectedPaidTier);
      }}
    />

    {state.billing.mayPurchaseCredits?<View style={styles.creditsPanel}>
      <View style={styles.creditsHeading}>
        <View style={styles.creditsIdentity}><KivelleCreditIcon size={28}/><View style={{flex:1}}><Text style={styles.creditsTitle}>Kivelle Credits</Text><Text style={styles.creditsCopy}>For photos, voice, premium media, and more.</Text></View></View>
        <View style={styles.balanceCompact}>
          <Text style={styles.balanceLabel}>YOUR BALANCE</Text>
          <View style={styles.balanceValue}><Text style={styles.balanceNumber}>{state.creditBalance.total.toLocaleString()}</Text><KivelleCreditIcon size={16}/></View>
        </View>
      </View>
      <View style={styles.packGrid}>{activeCreditPacks.map((pack)=>{const selected=selectedPack?.key===pack.key;return <Pressable accessibilityRole="radio" accessibilityState={{checked:selected,disabled:!pack.checkoutConfigured}} accessibilityLabel={`${pack.credits} Kivelle Credits for ${pack.displayPrice}`} disabled={!pack.checkoutConfigured||Boolean(busy)} key={pack.key} onPress={()=>setSelectedCreditPack(pack.key)} style={[styles.packCard,selected&&styles.packSelected,!pack.checkoutConfigured&&styles.packDisabled]}>
        {pack.popular?<View style={styles.packBadge}><Text style={styles.packBadgeText}>BEST VALUE</Text></View>:null}
        <View style={styles.packCreditRow}><KivelleCreditIcon size={16} style={!selected?styles.creditIconMuted:undefined}/><Text style={styles.packCredits}>{pack.credits.toLocaleString()}</Text></View><Text style={styles.packUnit}>credits</Text><Text style={styles.packPrice}>{pack.displayPrice}</Text>
      </Pressable>;})}</View>
      <Pressable accessibilityRole="button" accessibilityLabel={selectedPack?`Buy ${selectedPack.credits} Kivelle Credits`:'Buy Kivelle Credits'} disabled={!selectedPack||!selectedPack.checkoutConfigured||Boolean(busy)} onPress={()=>selectedPack&&void openAction('credits_checkout',selectedPack)} style={({pressed})=>[styles.buyCredits,(!selectedPack||!selectedPack.checkoutConfigured)&&styles.planActionDisabled,pressed&&styles.planActionPressed]}><CreditCard size={19} color="#fff"/><Text style={styles.buyCreditsText}>{selectedPack&&busy===selectedPack.key?'Opening checkout…':'Buy credits'}</Text></Pressable>
      <Text style={styles.refundNote}>Credits are used only inside Kivelle, have no cash value, cannot be transferred, and cannot be redeemed outside Kivelle. Failed paid generations refund automatically.</Text>
    </View>:null}

    <Pressable onPress={() => setCompareOpen((value) => !value)} style={styles.compareToggle}>
      <View><Text style={styles.compareTitle}>Compare plans</Text><Text style={styles.compareCopy}>See the differences across the full Kivelle experience.</Text></View>
      <View style={{ transform: [{ rotate: compareOpen ? '180deg' : '0deg' }] }}><ChevronDown size={19} color={colors.muted} /></View>
    </Pressable>
    {compareOpen ? <Comparison plans={state.catalog} /> : null}

    <View style={styles.policyLinks}><Pressable onPress={()=>router.push('/terms' as never)}><Text style={styles.policyLink}>Terms</Text></Pressable><Text style={styles.policyDot}>•</Text><Pressable onPress={()=>router.push('/privacy-policy' as never)}><Text style={styles.policyLink}>Privacy</Text></Pressable><Text style={styles.policyDot}>•</Text><Pressable onPress={()=>router.push('/refund-policy' as never)}><Text style={styles.policyLink}>Refunds & cancellation</Text></Pressable><Text style={styles.policyDot}>•</Text><Pressable onPress={()=>router.push('/support' as never)}><Text style={styles.policyLink}>Support</Text></Pressable></View>

    {error ? <Text style={styles.error}>{error}</Text> : null}
  </Screen>;
}

function TierToggle({plans,value,currentTier,onChange}:{plans:SubscriptionPlan[];value:Exclude<SubscriptionTier,'free'>;currentTier:SubscriptionTier;onChange:(value:Exclude<SubscriptionTier,'free'>)=>void}){
  return <View style={styles.tierToggle}>{plans.map((plan)=>{
    const tier=plan.tier as Exclude<SubscriptionTier,'free'>,active=value===tier,max=tier==='kivelle_max';
    return <Pressable key={tier} accessibilityRole="button" accessibilityState={{selected:active}} onPress={()=>onChange(tier)} style={[styles.tierChoice,active&&(max?styles.tierChoiceMax:styles.tierChoicePlus)]}>
      <Text style={[styles.tierChoiceName,active&&(max?styles.tierChoiceNameMax:styles.tierChoiceNamePlus)]}>{plan.displayName}</Text>
      {currentTier===tier?<Text style={[styles.tierCurrent,max&&styles.tierCurrentMax]}>CURRENT</Text>:null}
    </Pressable>;
  })}</View>;
}

function formatBillingDate(value?:string|null):string{
  if(!value)return 'the end of your paid period';
  const date=new Date(value);return Number.isNaN(date.getTime())?'the end of your paid period':date.toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'});
}

function BillingIntervalToggle({value,tier,onChange}:{value:BillingInterval;tier:SubscriptionTier;onChange:(value:BillingInterval)=>void}) {
  const max=tier==='kivelle_max';
  return <View style={styles.billingWrap}>
    <Pressable accessibilityRole="button" accessibilityState={{selected:value==='monthly'}} onPress={()=>onChange('monthly')} style={[styles.billingChoice,value==='monthly'&&(max?styles.billingChoiceMax:styles.billingChoicePlus)]}><Text style={[styles.billingText,value==='monthly'&&styles.billingTextActive]}>Monthly</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityState={{selected:value==='annual'}} onPress={()=>onChange('annual')} style={[styles.billingChoice,value==='annual'&&(max?styles.billingChoiceMax:styles.billingChoicePlus)]}><Text style={[styles.billingText,value==='annual'&&styles.billingTextActive]}>Yearly</Text><View style={[styles.savePill,max&&styles.savePillMax]}><Text style={[styles.saveText,max&&styles.saveTextMax]}>SAVE 17%</Text></View></Pressable>
  </View>;
}

function PlanCard({ plan,billingInterval, current,downgrade, actionConfigured, busy,onBillingChange, onAction }: { plan: SubscriptionPlan;billingInterval:BillingInterval; current: boolean;downgrade:boolean; actionConfigured: boolean; busy: boolean;onBillingChange:(value:BillingInterval)=>void; onAction: () => void }) {
  const featured = plan.tier === 'kivelle_plus';
  const max = plan.tier === 'kivelle_max';
  const features = max ? [
    'Everything in Kivelle+',
    'Director intelligence and deepest continuity',
    `${plan.includedCompanionPhotoDailyLimit} included photos every day`,
    `${plan.monthlyCreditGrant.toLocaleString()} Kivelle Credits each month`,
    `${plan.maxLives} Lives · ${plan.maxCustomCompanions} custom companions`,
    'Highest media priority and early world access',
  ]:[
    'Unlimited conversations and group chats',
    'Deep continuity and full Memory Center',
    `${plan.includedCompanionPhotoDailyLimit} included photo every day`,
    `${plan.monthlyCreditGrant.toLocaleString()} Kivelle Credits each month`,
    `${plan.maxLives} Lives · ${plan.maxCustomCompanions} custom companions`,
    'Priority media generation',
  ];

  const annual=plan.annualPriceUsd,monthlyEquivalent=annual===null?null:annual/12;
  const shownPrice=billingInterval==='annual'&&monthlyEquivalent!==null?monthlyEquivalent:plan.monthlyPriceUsd;
  return <View style={[styles.plan, featured && styles.planFeatured, max && styles.planMax]}>
    <View style={styles.planTop}>
      <View style={{ flex: 1 }}><Text style={[styles.planName,max&&styles.planNameMax]}>{plan.displayName}</Text><Text style={[styles.planPrice,max&&styles.planPriceMax]}>${shownPrice.toFixed(2)}<Text style={styles.planPeriod}> / month</Text></Text>{billingInterval==='annual'&&annual!==null?<Text style={styles.billedAnnually}>${annual.toFixed(2)} billed yearly</Text>:<Text style={styles.billedAnnually}>Billed monthly</Text>}</View>
      <View style={styles.planBadges}><View style={[styles.valueBadge,max&&styles.valueBadgeMax]}><Text style={[styles.valueBadgeText,max&&styles.valueBadgeTextMax]}>{max?'MOST IMMERSIVE':'MOST POPULAR'}</Text></View>{current?<Text style={styles.activePlanText}>• ACTIVE</Text>:null}</View>
    </View>
    <View style={styles.featureList}>{features.map((feature) => <View key={feature} style={styles.feature}><Check size={18} strokeWidth={2.5} color={max?'#AFA2FF':'#F47CB5'} /><Text style={styles.featureText}>{feature}</Text></View>)}</View>
    {!current?<BillingIntervalToggle value={billingInterval} tier={plan.tier} onChange={onBillingChange}/>:null}
    <Pressable accessibilityRole="button" disabled={busy||!actionConfigured} onPress={onAction} style={({pressed})=>[styles.planAction,current?styles.managePlanAction:max?styles.planActionMax:styles.planActionPlus,!actionConfigured&&styles.planActionDisabled,pressed&&styles.planActionPressed]}>
      {current?<CreditCard size={17} color={colors.text}/>:null}<Text style={[styles.planActionText,current&&styles.managePlanText]}>{busy?'Opening billing…':current?'Manage subscription':!actionConfigured?'Checkout not configured':downgrade?'Manage plan':`Choose ${plan.displayName}`}</Text>{actionConfigured?<ChevronRight size={19} color={current?colors.muted:'#fff'}/>:null}
    </Pressable>
  </View>;
}

function Comparison({ plans }: { plans: SubscriptionPlan[] }) {
  const plus = plans.find((plan) => plan.tier === 'kivelle_plus');
  const max = plans.find((plan) => plan.tier === 'kivelle_max');
  if (!plus || !max) return null;
  const rows: Array<[string, string, string]> = [
    ['Chat', 'Unlimited', 'Unlimited'],
    ['Intelligence', intelligenceLabel(plus.intelligenceProfile), intelligenceLabel(max.intelligenceProfile)],
    ['Lives', String(plus.maxLives), String(max.maxLives)],
    ['Custom companions', String(plus.maxCustomCompanions), String(max.maxCustomCompanions)],
    ['Monthly credits', plus.monthlyCreditGrant.toLocaleString(), max.monthlyCreditGrant.toLocaleString()],
    ['Included daily photos', `${plus.includedCompanionPhotoDailyLimit} / day`, `${max.includedCompanionPhotoDailyLimit} / day`],
    ['Included Date photos', `${plus.includedDatePhotoMonthlyLimit} / month`, `${max.includedDatePhotoMonthlyLimit} / month`],
    ['Media priority', 'Priority', 'Highest'],
  ];
  return <View style={styles.compareCard}>
    <View style={styles.compareHeader}><Text style={styles.compareHeaderLabel}>FEATURE</Text><Text style={[styles.compareHeaderPlan,styles.comparePlus]}>KIVELLE+</Text><Text style={[styles.compareHeaderPlan,styles.compareMax]}>MAX</Text></View>
    {rows.map(([label, plusValue, maxValue]) => <View key={label} style={styles.compareRow}><Text style={styles.compareLabel}>{label}</Text><Text style={[styles.compareValue, styles.comparePlus]}>{plusValue}</Text><Text style={[styles.compareValue, styles.compareMax]}>{maxValue}</Text></View>)}
  </View>;
}


const styles = StyleSheet.create({
  content: { gap: spacing.lg, maxWidth: 780, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  upgradeIntro:{alignItems:'center',paddingHorizontal:18,paddingTop:4,paddingBottom:2},
  upgradeTitle:{color:colors.text,fontFamily:'Georgia',fontSize:34,lineHeight:40,textAlign:'center'},
  upgradeCopy:{maxWidth:520,color:colors.muted,fontSize:13,lineHeight:20,textAlign:'center',marginTop:7},
  billingNotice:{gap:4,paddingHorizontal:15,paddingVertical:13,borderRadius:radius.lg,backgroundColor:'rgba(154,99,215,.09)',borderWidth:1,borderColor:'rgba(175,162,255,.22)'},
  billingProblem:{backgroundColor:'rgba(211,92,94,.09)',borderColor:'rgba(211,92,94,.25)'},
  billingNoticeTitle:{color:colors.text,fontSize:12,fontWeight:'900'},
  billingNoticeCopy:{color:colors.muted,fontSize:10,lineHeight:16},
  tierToggle:{alignSelf:'center',width:'100%',maxWidth:540,minHeight:54,flexDirection:'row',gap:5,padding:5,borderRadius:radius.lg,backgroundColor:'rgba(17,15,25,.82)',borderWidth:1,borderColor:'rgba(255,255,255,.08)'},
  tierChoice:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,paddingHorizontal:10,borderRadius:radius.md,borderWidth:1,borderColor:'transparent'},
  tierChoicePlus:{backgroundColor:'rgba(213,67,139,.15)',borderColor:'rgba(244,124,181,.42)'},
  tierChoiceMax:{backgroundColor:'rgba(115,91,224,.17)',borderColor:'rgba(175,162,255,.42)'},
  tierChoiceName:{color:colors.muted,fontSize:14,fontWeight:'900'},
  tierChoiceNamePlus:{color:'#F7B1D0'},
  tierChoiceNameMax:{color:'#C9C0FF'},
  tierCurrent:{color:'#F47CB5',fontSize:7,fontWeight:'900',letterSpacing:.65},
  tierCurrentMax:{color:'#AFA2FF'},
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
  billingWrap: { width:'100%',alignSelf: 'center', flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.lg, backgroundColor: 'rgba(6,7,12,.36)', borderWidth: 1, borderColor: 'rgba(255,255,255,.08)' },
  billingChoice: { flex:1,minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: radius.md,borderWidth:1,borderColor:'transparent' },
  billingChoiceActive: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: 'rgba(216,62,234,.35)' },
  billingChoicePlus:{backgroundColor:'rgba(213,67,139,.18)',borderColor:'rgba(244,124,181,.32)'},
  billingChoiceMax:{backgroundColor:'rgba(115,91,224,.20)',borderColor:'rgba(175,162,255,.32)'},
  billingText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  billingTextActive: { color: colors.text },
  savePill: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(216,62,234,.20)' },
  saveText: { color: '#FFB9D2', fontSize: 7, fontWeight: '900', letterSpacing: .5 },
  savePillMax:{backgroundColor:'rgba(115,91,224,.22)'},
  saveTextMax:{color:'#C9C0FF'},
  billedAnnually:{color:colors.dimmed,fontSize:9,fontWeight:'700',marginTop:3},
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  sectionKicker: { color: colors.rose, fontSize: 9, fontWeight: '900', letterSpacing: 1.15 },
  sectionTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 24, marginTop: 4 },
  sectionHint: { color: colors.dimmed, fontSize: 10, fontWeight: '700' },
  plans: { gap: 12 },
  plan: { position: 'relative', overflow: 'hidden', gap: 18, padding: 22, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  planFeatured: { backgroundColor: 'rgba(31,17,29,.94)', borderColor: 'rgba(244,124,181,.42)', shadowColor: '#D5438B', shadowOpacity: .15, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
  planMax: { backgroundColor: 'rgba(20,18,35,.95)', borderColor: 'rgba(175,162,255,.40)',shadowColor:'#735BE0',shadowOpacity:.17,shadowRadius:24,shadowOffset:{width:0,height:10} },
  planCurrent: { borderColor: 'rgba(127,209,170,.48)' },
  popular: { position: 'absolute', top: 0, right: 18, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, backgroundColor: colors.rose },
  popularText: { color: '#fff', fontSize: 7, fontWeight: '900', letterSpacing: .7 },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  planName: { color: colors.text, fontFamily: 'Georgia', fontSize: 27 },
  planNameMax:{color:'#E2DDFF'},
  planPrice: { color: '#F4C4D5', fontFamily: 'Georgia', fontSize: 24, marginTop: 4 },
  planPriceMax:{color:'#CEC5FF'},
  planPeriod: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(127,209,170,.11)', borderWidth: 1, borderColor: 'rgba(127,209,170,.24)' },
  activeBadgeText: { color: colors.success, fontSize: 8, fontWeight: '900', letterSpacing: .7 },
  maxBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(154,99,215,.12)' },
  maxBadgeText: { color: '#D8C1FF', fontSize: 8, fontWeight: '900', letterSpacing: .7 },
  valueBadge:{paddingHorizontal:10,paddingVertical:7,borderRadius:radius.pill,backgroundColor:'rgba(213,67,139,.16)',borderWidth:1,borderColor:'rgba(244,124,181,.25)'},
  valueBadgeMax:{backgroundColor:'rgba(115,91,224,.18)',borderColor:'rgba(175,162,255,.26)'},
  valueBadgeText:{color:'#F7B1D0',fontSize:8,fontWeight:'900',letterSpacing:.7},
  valueBadgeTextMax:{color:'#C9C0FF'},
  planBadges:{alignItems:'flex-end',gap:8},
  activePlanText:{color:colors.success,fontSize:9,fontWeight:'900',letterSpacing:.5},
  planCopy: { color: colors.muted, fontSize: 11, lineHeight: 17, maxWidth: 610 },
  featureList: { gap: 9 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  featureCheck: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.045)' },
  featureText: { flex: 1, color: colors.text, fontSize: 13, lineHeight:19, fontWeight: '700' },
  planAction:{minHeight:54,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,borderRadius:radius.md,shadowOpacity:.24,shadowRadius:14,shadowOffset:{width:0,height:7}},
  planActionPlus:{backgroundColor:'#D5438B',shadowColor:'#D5438B'},
  planActionMax:{backgroundColor:'#735BE0',shadowColor:'#735BE0'},
  planActionDisabled:{opacity:.55,shadowOpacity:0},
  planActionPressed:{transform:[{scale:.992}],opacity:.9},
  planActionText:{color:'#fff',fontSize:15,fontWeight:'900'},
  managePlanAction:{backgroundColor:'rgba(255,255,255,.025)',borderWidth:1,borderColor:'rgba(255,255,255,.16)',shadowOpacity:0},
  managePlanText:{color:colors.text,flex:1,textAlign:'center'},
  currentButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(127,209,170,.22)', backgroundColor: 'rgba(127,209,170,.06)' },
  currentButtonText: { color: colors.success, fontWeight: '900' },
  creditsPanel: { position: 'relative', overflow: 'hidden', gap: 15, padding: 19, borderRadius: radius.xl, backgroundColor: '#17131D', borderWidth: 1, borderColor: 'rgba(233,160,127,.30)' },
  creditsHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent:'space-between', gap: 18, flexWrap:'wrap' },
  creditsIdentity:{minWidth:220,flex:1,flexDirection:'row',alignItems:'center',gap:12},
  creditsTitle: { color: colors.text, fontFamily: 'Georgia', fontSize: 21, marginTop: 3 },
  balanceCompact:{alignItems:'flex-end'},
  balanceValue:{flexDirection:'row',alignItems:'center',gap:7},
  balanceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' },
  balanceNumber: { color: colors.text, fontFamily: 'Georgia', fontSize: 31, lineHeight: 36 },
  balanceLabel: { color: colors.dimmed, fontSize: 8, fontWeight: '900', letterSpacing: 1.1, marginTop: 2 },
  balanceBreakdown: { flex: 1, minWidth: 240, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  miniStat: { width: '48%', minWidth: 112, padding: 10, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,.035)' },
  miniLabel: { color: colors.dimmed, fontSize: 8, fontWeight: '800' },
  miniValue: { color: colors.text, fontSize: 12, fontWeight: '800', marginTop: 4 },
  creditsCopy: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  creditActions: { gap: 10 },
  packGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},
  packCard:{position:'relative',overflow:'hidden',flexGrow:1,flexBasis:150,minWidth:140,alignItems:'center',gap:3,paddingHorizontal:12,paddingVertical:17,borderRadius:radius.lg,backgroundColor:'rgba(255,255,255,.035)',borderWidth:1,borderColor:'rgba(255,255,255,.10)'},
  packSelected:{borderColor:'rgba(244,124,181,.78)',backgroundColor:'rgba(213,67,139,.10)'},
  packDisabled:{opacity:.48},
  packBadge:{position:'absolute',top:0,alignSelf:'center',paddingHorizontal:10,paddingVertical:4,backgroundColor:'rgba(213,67,139,.72)',borderBottomLeftRadius:8,borderBottomRightRadius:8},
  packBadgeText:{color:'#fff',fontSize:7,fontWeight:'900',letterSpacing:.7},
  packCreditRow:{flexDirection:'row',alignItems:'center',gap:7,marginTop:4},
  creditIconMuted:{opacity:.62},
  packCredits:{color:colors.text,fontFamily:'Georgia',fontSize:24,fontWeight:'900'},
  packUnit:{color:colors.muted,fontSize:10},
  packPrice:{color:'#F47CB5',fontSize:13,fontWeight:'900',marginTop:5},
  packEquivalent:{color:colors.muted,fontSize:9,lineHeight:14},
  packAction:{color:'#F2B4CA',fontSize:9,fontWeight:'900',marginTop:5},
  buyCredits:{minHeight:54,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,borderRadius:radius.md,backgroundColor:'#C73579',shadowColor:'#D5438B',shadowOpacity:.2,shadowRadius:14,shadowOffset:{width:0,height:7}},
  buyCreditsText:{color:'#fff',fontSize:15,fontWeight:'900'},
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
  policyLinks:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'center',gap:8,paddingVertical:6},
  policyLink:{color:colors.muted,fontSize:10,fontWeight:'800',textDecorationLine:'underline'},
  policyDot:{color:colors.dimmed,fontSize:9},
});
