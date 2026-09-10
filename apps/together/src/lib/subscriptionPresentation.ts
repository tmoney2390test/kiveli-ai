import type { BillingInterval, BillingManagement, CreditActivityEvent, SubscriptionPlan, SubscriptionStatus, SubscriptionTier } from './subscription';
import { entitlementsForTier, type EntitlementKey } from '@together/domain/src/entitlements';
import { hasOpenBuildWorldAccess } from '@together/domain/src/world-access';

export const subscriptionIntents=['plans','photo_sharing','credits','generated_media','voice','memory','initiative','worlds','group_chat'] as const;
export type SubscriptionIntent=typeof subscriptionIntents[number];

const intentCopy:Record<SubscriptionIntent,{eyebrow:string;title:string;body:string}>={
  plans:{eyebrow:'PLAN & CREDITS',title:'Choose what fits your Kivelli life',body:'Compare plans, understand your benefits, and manage credits in one place.'},
  photo_sharing:{eyebrow:'SHARE PHOTOS',title:'Share moments with your characters',body:'Kivelli+ lets your characters see and naturally react to photos from your life. Shared photos never use Credits.'},
  credits:{eyebrow:'KIVELLI CREDITS',title:'Keep creating',body:'Use Credits for generated photos, video, and voice when available. Sharing your own photos is included with Plus and Max.'},
  generated_media:{eyebrow:'GENERATED MEDIA',title:'Create more together',body:'Compare included generated photos and add Credits for custom photos, edits, video, and premium media.'},
  voice:{eyebrow:'VOICE',title:'Hear more of your connection',body:'Unlock voice features and use Credits only when a priced voice action clearly shows its cost.'},
  memory:{eyebrow:'MEMORY CENTER',title:'Go deeper with your shared history',body:'Kivelli+ unlocks memory review and controls while preserving the relationship you already built.'},
  initiative:{eyebrow:'COMPANION INITIATIVE',title:'Let companions reach out naturally',body:'Kivelli+ lets companions begin meaningful conversations around their lives and your shared plans.'},
  worlds:{eyebrow:'KIVELLI WORLDS',title:'Make more of every world',body:hasOpenBuildWorldAccess(true)?'Every published world is currently open to everyone. Membership adds more conversations, deeper memory, and room for more companions.':'Kivelli+ includes every standard world and the people and places living inside them.'},
  group_chat:{eyebrow:'GROUP CHATS',title:'Bring your connections together',body:'Kivelli+ unlocks group conversations with the same continuity and personality as direct chats.'},
};

export function normalizeSubscriptionIntent(intent?:unknown,source?:unknown):SubscriptionIntent{
  if(intent==='photo_sharing'||source==='share-photo')return'photo_sharing';
  return subscriptionIntents.includes(intent as SubscriptionIntent)?intent as SubscriptionIntent:'plans';
}

export function subscriptionIntentPresentation(intent:SubscriptionIntent){return intentCopy[intent];}

export function preferredPaidTier(currentTier:SubscriptionTier,requested?:unknown):Exclude<SubscriptionTier,'free'>{
  if(requested==='kivelle_plus'||requested==='kivelle_max')return requested;
  return currentTier==='kivelle_max'?'kivelle_max':'kivelle_plus';
}

export function safeSubscriptionReturnTo(value?:unknown):string|null{
  if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//')||value.length>1200)return null;
  return value;
}

export function subscriptionHref(input:{intent?:SubscriptionIntent;returnTo?:string;tier?:Exclude<SubscriptionTier,'free'>}={}):string{
  const values:string[]=[];
  if(input.intent&&input.intent!=='plans')values.push(`intent=${encodeURIComponent(input.intent)}`);
  const returnTo=safeSubscriptionReturnTo(input.returnTo);if(returnTo)values.push(`returnTo=${encodeURIComponent(returnTo)}`);
  if(input.tier)values.push(`tier=${encodeURIComponent(input.tier)}`);
  return values.length?`/subscription?${values.join('&')}`:'/subscription';
}

export function annualSavingsPercentage(monthly:number,annual:number|null):number{
  if(!annual||monthly<=0)return 0;
  return Math.max(0,Math.round((1-annual/(monthly*12))*100));
}

export type MembershipMetric={key:'lives'|'companions'|'photos';value:number;label:string;detail:string};

export function membershipPageMode(tier:SubscriptionTier):'discovery'|'member'{return tier==='free'?'discovery':'member';}

export function shouldShowSubscriptionIntentCallout(mode:'discovery'|'member',intent:SubscriptionIntent):boolean{
  return intent!=='plans'&&intent!=='credits';
}

export function membershipMetrics(plan:SubscriptionPlan):MembershipMetric[]{
  return[
    {key:'lives',value:plan.maxLives,label:'Lives',detail:'available'},
    {key:'companions',value:plan.maxCustomCompanions,label:'companions',detail:'custom slots'},
    {key:'photos',value:plan.includedCompanionPhotoDailyLimit,label:'photos daily',detail:'included generation'},
  ];
}

export function membershipPlanName(plan:Pick<SubscriptionPlan,'tier'>):string{
  return plan.tier==='free'?'Kivelli Free':plan.tier==='kivelle_plus'?'Kivelli+':'Kivelli Max';
}

export function membershipBenefits(plan:SubscriptionPlan,entitlementKeys?:readonly string[]):string[]{
  const keys=new Set(entitlementKeys??entitlementsForTier(plan.tier));
  const benefits=[
    `${plan.maxActiveConversations} active conversations${keys.has('group_chat')?' and group chats':''}`,
    plan.dailyMessageLimit===null?'Unlimited messages':`${plan.dailyMessageLimit} messages per day`,
    membershipContinuity(plan).title,
  ];
  if(keys.has('photo_sharing'))benefits.push('Share your own photos without using Credits');
  if(keys.has('proactive_messages'))benefits.push('Companions can start conversations');
  if(keys.has('memory_inspector')&&keys.has('memory_manual_control'))benefits.push('Review, pin, and edit memories');
  if(plan.includedCompanionPhotoDailyLimit>0)benefits.push(`${plan.includedCompanionPhotoDailyLimit} generated ${plan.includedCompanionPhotoDailyLimit===1?'photo':'photos'} every day`);
  if(plan.monthlyCreditGrant>0)benefits.push(`${plan.monthlyCreditGrant.toLocaleString()} monthly Kivelli Credits`);
  benefits.push(`${plan.maxLives} ${plan.maxLives===1?'Life':'Lives'} and ${plan.maxCustomCompanions} custom ${plan.maxCustomCompanions===1?'companion':'companions'}`);
  if(plan.mediaQueue!=='standard')benefits.push(`${plan.mediaQueue==='highest'?'Highest':'Priority'} media queue`);
  return benefits;
}

export function membershipContinuity(plan:SubscriptionPlan):{title:string;detail:string}{
  if(plan.intelligenceProfile==='director')return{title:'Deepest memory with Kivelli Director',detail:'Draws on more shared history, with more frequent scene planning for story and relationship moments.'};
  if(plan.intelligenceProfile==='deep')return{title:'Deeper memory and continuity',detail:'Brings more relevant memories and past conversations into each reply.'};
  return{title:'Core memory and continuity',detail:'Remembers key details and your recent conversations.'};
}

export function membershipPricePresentation(plan:SubscriptionPlan,interval:BillingInterval,localizedPrice?:string):{primary:string;period:string;detail:string}{
  if(plan.tier==='free')return{primary:formatUsd(0),period:'',detail:'No subscription required'};
  // RevenueCat priceString is the price of the whole selected package.
  if(localizedPrice)return{primary:localizedPrice,period:interval==='annual'?'/ year':'/ month',detail:interval==='annual'?'Billed yearly through your app store':'Billed monthly through your app store'};
  if(interval==='annual'&&plan.annualPriceUsd){
    return{primary:formatUsd(plan.annualPriceUsd/12),period:'/ month',detail:`${formatUsd(plan.annualPriceUsd)} billed yearly`};
  }
  return{primary:formatUsd(plan.monthlyPriceUsd),period:'/ month',detail:'Billed monthly'};
}

export type MembershipComparisonValue={text:string;included?:boolean};
export type MembershipComparisonRow={key:string;label:string;description?:string;values:MembershipComparisonValue[]};
export type MembershipComparisonGroup={title:string;rows:MembershipComparisonRow[]};

/** Amounts come from the returned catalog; feature gates use the shared tier policy. */
export function membershipComparisonGroups(plans:SubscriptionPlan[]):MembershipComparisonGroup[]{
  const value=(text:string):MembershipComparisonValue=>({text});
  const gate=(plan:SubscriptionPlan,key:EntitlementKey,includedText='Included'):MembershipComparisonValue=>{
    const included=entitlementsForTier(plan.tier).has(key);
    return{text:included?includedText:'Not included',included};
  };
  const row=(key:string,label:string,resolve:(plan:SubscriptionPlan)=>MembershipComparisonValue,description?:string):MembershipComparisonRow=>({key,label,description,values:plans.map(resolve)});
  return[
    {title:'Conversations & memory',rows:[
      row('messages','Messages',plan=>value(plan.dailyMessageLimit===null?'Unlimited':`${plan.dailyMessageLimit} / day`)),
      row('conversations','Active conversations',plan=>value(String(plan.maxActiveConversations))),
      row('memory','Memory & continuity',plan=>value(plan.intelligenceProfile==='director'?'Deepest + Director':plan.intelligenceProfile==='deep'?'Deep':'Core'),'Higher plans draw on more relevant memories and past conversations.'),
      row('memory_controls','Memory controls',plan=>gate(plan,'memory_manual_control'),'Review, pin, edit, and remove remembered details.'),
      row('groups','Group chats',plan=>gate(plan,'group_chat')),
      row('initiative','Companions reach out first',plan=>gate(plan,'proactive_messages'),'With your initiative settings and quiet hours.'),
    ]},
    {title:'Photos & Credits',rows:[
      row('sharing','Share your own photos',plan=>gate(plan,'photo_sharing','No Credits used'),'Let characters see and respond to the photos you share.'),
      row('photos','Included generated photos',plan=>value(plan.includedCompanionPhotoDailyLimit>0?`${plan.includedCompanionPhotoDailyLimit} / day`:'Use Credits'),'Standard companion photos; extra generations use Credits.'),
      row('date_photos','Included date photos',plan=>value(plan.includedDatePhotoMonthlyLimit>0?`${plan.includedDatePhotoMonthlyLimit} / month`:'Use Credits'),'Souvenir photos from completed dates, separate from daily photos.'),
      row('credits','Monthly Credits',plan=>value(plan.monthlyCreditGrant?plan.monthlyCreditGrant.toLocaleString():'None'),'Granted monthly, including on yearly memberships.'),
      row('rollover','Plan Credit rollover cap',plan=>value(plan.subscriptionCreditRolloverCap?plan.subscriptionCreditRolloverCap.toLocaleString():'No plan Credits')),
      row('priority','Media queue',plan=>value(plan.mediaQueue==='highest'?'Highest priority':plan.mediaQueue==='priority'?'Priority':'Standard'),'Queue position for media generation; completion times vary.'),
    ]},
    {title:'Worlds & companions',rows:[
      row('lives','Lives',plan=>value(String(plan.maxLives)),'Separate lives with their own relationships and history.'),
      row('companions','Custom companions',plan=>value(String(plan.maxCustomCompanions)),'Companions you create yourself.'),
      row('worlds','World access',plan=>value(hasOpenBuildWorldAccess(true)?'All published worlds':plan.worldAccess==='all_standard'?'All standard worlds':'Published free worlds')),
      ...(!hasOpenBuildWorldAccess(true)?[row('early_access','Early world access',plan=>({text:plan.earlyWorldAccess?'Eligible releases':'Not included',included:plan.earlyWorldAccess}))]:[]),
    ]},
  ];
}

function formatUsd(value:number):string{
  try{return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(value);}catch{return`$${value.toFixed(2)}`;}
}

export function checkoutBackoffDelay(attempt:number):number{return[0,800,1500,2500,4000,6000,8000,10000][Math.max(0,Math.min(7,attempt))]??10000;}

export function billingStatusPresentation(status:SubscriptionStatus):{label:string;detail:string;dateLabel:string|null;date:string|null;tone:'neutral'|'success'|'warning'|'danger'}{
  const billingStatus=status.billing.status??(status.tier==='free'?'free':'active'),periodEnd=status.billing.expiresAt??status.billing.periodEnd??null;
  if(status.billing.cancelAtPeriodEnd)return{label:'Cancellation scheduled',detail:'Your paid benefits remain available through the end of this period.',dateLabel:'Access through',date:periodEnd,tone:'warning'};
  if(billingStatus==='trialing')return{label:'Trial active',detail:'Your plan benefits are active during the trial.',dateLabel:'Trial ends',date:status.billing.trialEnd??periodEnd,tone:'success'};
  if(billingStatus==='past_due')return{label:'Payment needs attention',detail:'Access is in a limited grace period. Update payment details to avoid interruption.',dateLabel:'Grace access through',date:periodEnd,tone:'warning'};
  if(['unpaid','paused','incomplete','incomplete_expired'].includes(billingStatus))return{label:'Subscription inactive',detail:'Your billing provider needs attention before paid benefits can continue.',dateLabel:null,date:null,tone:'danger'};
  if(billingStatus==='canceled')return{label:'Subscription ended',detail:'Choose a plan whenever you are ready to return.',dateLabel:'Ended',date:status.billing.canceledAt??periodEnd,tone:'neutral'};
  if(status.tier==='free')return{label:'Free plan',detail:'Core relationship features are active.',dateLabel:null,date:null,tone:'neutral'};
  if(status.management.mode==='kivelle')return{label:'Active',detail:'Access is provided directly by Kivelli.',dateLabel:null,date:null,tone:'success'};
  return{label:'Active',detail:'Your plan benefits are ready to use.',dateLabel:'Renews',date:periodEnd,tone:'success'};
}

export function managementActionLabel(management:BillingManagement):string{
  if(management.manageAction==='app_store')return'Manage in app store';
  if(management.manageAction==='portal')return'Manage subscription';
  return'';
}

export function creditActivityPresentation(event:CreditActivityEvent):{label:string;amount:number;detail:string}{
  const amount=event.permanentDelta+event.subscriptionDelta;
  if(event.contextAction)return{amount,label:event.eventType==='refund'?'Unused context credits returned':event.contextStatus==='reserved'?'Context credits reserved':'Expanded context',detail:event.contextStatus==='reserved'?'Maximum held while replies finish':`Final context charge: ${event.contextChargedCredits??0} credits`};
  const label=event.adjustmentReason==='tier_cap_reduced'?'Plan limit adjustment':event.adjustmentReason==='tier_cap_restored'?'Plan Credits restored':event.adjustmentReason==='post_subscription_grace_expired'?'Plan Credits expired':['refund','dispute','chargeback'].includes(String(event.adjustmentReason))?'Payment reversal':event.eventType==='welcome_grant'?'Welcome credits':event.eventType==='subscription_grant'?'Monthly plan credits':event.eventType==='purchase'?'Credits purchased':event.eventType==='spend'?'Credits used':event.eventType==='refund'?'Automatic refund':event.eventType==='adjustment'?'Billing adjustment':'Credit activity';
  const detail=event.adjustmentReason==='tier_cap_reduced'?'Adjusted to the previous plan’s rollover limit':event.adjustmentReason==='tier_cap_restored'?'Restored after returning to a higher plan':event.adjustmentReason==='post_subscription_grace_expired'?'Unused plan Credits after the grace period':['refund','dispute','chargeback'].includes(String(event.adjustmentReason))?'Purchased Credits returned through billing':event.eventType==='subscription_grant'?'Subscription balance':event.eventType==='welcome_grant'||event.eventType==='purchase'?'Permanent balance':event.eventType==='refund'?'Returned after an unsuccessful action':'Kivelli Credits';
  return{label,amount,detail};
}
