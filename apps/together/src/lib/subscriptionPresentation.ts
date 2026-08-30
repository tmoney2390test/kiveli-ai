import type { BillingManagement, CreditActivityEvent, SubscriptionStatus, SubscriptionTier } from './subscription';

export const subscriptionIntents=['plans','photo_sharing','credits','generated_media','voice','memory','initiative','worlds','group_chat'] as const;
export type SubscriptionIntent=typeof subscriptionIntents[number];

const intentCopy:Record<SubscriptionIntent,{eyebrow:string;title:string;body:string}>={
  plans:{eyebrow:'PLAN & CREDITS',title:'Choose what fits your Kivelle life',body:'Compare plans, understand your benefits, and manage credits in one place.'},
  photo_sharing:{eyebrow:'SHARE PHOTOS',title:'Share moments with your characters',body:'Kivelle+ lets your characters see and naturally react to photos from your life. Shared photos never use Credits.'},
  credits:{eyebrow:'KIVELLE CREDITS',title:'Keep creating',body:'Credits are for generated photos, video, voice, and other premium media—not for sharing your own photos.'},
  generated_media:{eyebrow:'GENERATED MEDIA',title:'Create more together',body:'Compare included generated photos and add Credits for custom photos, edits, video, and premium media.'},
  voice:{eyebrow:'VOICE',title:'Hear more of your connection',body:'Unlock voice features and use Credits only when a priced voice action clearly shows its cost.'},
  memory:{eyebrow:'MEMORY CENTER',title:'Go deeper with your shared history',body:'Kivelle+ unlocks memory review and controls while preserving the relationship you already built.'},
  initiative:{eyebrow:'COMPANION INITIATIVE',title:'Let companions reach out naturally',body:'Kivelle+ lets companions begin meaningful conversations around their lives and your shared plans.'},
  worlds:{eyebrow:'KIVELLE WORLDS',title:'Open more places to connect',body:'Kivelle+ includes every standard world and the people and places living inside them.'},
  group_chat:{eyebrow:'GROUP CHATS',title:'Bring your connections together',body:'Kivelle+ unlocks group conversations with the same continuity and personality as direct chats.'},
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

export function checkoutBackoffDelay(attempt:number):number{return[0,800,1500,2500,4000,6000,8000,10000][Math.max(0,Math.min(7,attempt))]??10000;}

export function billingStatusPresentation(status:SubscriptionStatus):{label:string;detail:string;dateLabel:string|null;date:string|null;tone:'neutral'|'success'|'warning'|'danger'}{
  const billingStatus=status.billing.status??(status.tier==='free'?'free':'active'),periodEnd=status.billing.expiresAt??status.billing.periodEnd??null;
  if(status.billing.cancelAtPeriodEnd)return{label:'Cancellation scheduled',detail:'Your paid benefits remain available through the end of this period.',dateLabel:'Access through',date:periodEnd,tone:'warning'};
  if(billingStatus==='trialing')return{label:'Trial active',detail:'Your plan benefits are active during the trial.',dateLabel:'Trial ends',date:status.billing.trialEnd??periodEnd,tone:'success'};
  if(billingStatus==='past_due')return{label:'Payment needs attention',detail:'Access is in a limited grace period. Update payment details to avoid interruption.',dateLabel:'Grace access through',date:periodEnd,tone:'warning'};
  if(['unpaid','paused','incomplete','incomplete_expired'].includes(billingStatus))return{label:'Subscription inactive',detail:'Your billing provider needs attention before paid benefits can continue.',dateLabel:null,date:null,tone:'danger'};
  if(billingStatus==='canceled')return{label:'Subscription ended',detail:'Choose a plan whenever you are ready to return.',dateLabel:'Ended',date:status.billing.canceledAt??periodEnd,tone:'neutral'};
  if(status.tier==='free')return{label:'Free plan',detail:'Core relationship features are active.',dateLabel:null,date:null,tone:'neutral'};
  if(status.management.mode==='kivelle')return{label:'Active',detail:'Access is provided directly by Kivelle.',dateLabel:null,date:null,tone:'success'};
  return{label:'Active',detail:'Your plan benefits are ready to use.',dateLabel:'Renews',date:periodEnd,tone:'success'};
}

export function managementActionLabel(management:BillingManagement):string{
  if(management.manageAction==='app_store')return'Manage in app store';
  if(management.manageAction==='portal')return'Manage subscription';
  return'';
}

export function creditActivityPresentation(event:CreditActivityEvent):{label:string;amount:number;detail:string}{
  const amount=event.permanentDelta+event.subscriptionDelta;
  const label=event.eventType==='welcome_grant'?'Welcome credits':event.eventType==='subscription_grant'?'Monthly plan credits':event.eventType==='purchase'?'Credits purchased':event.eventType==='spend'?'Credits used':event.eventType==='refund'?'Automatic refund':event.eventType==='adjustment'?'Billing adjustment':'Credit activity';
  const detail=event.eventType==='subscription_grant'?'Subscription balance':event.eventType==='welcome_grant'||event.eventType==='purchase'?'Permanent balance':event.eventType==='refund'?'Returned after an unsuccessful action':'Kivelle Credits';
  return{label,amount,detail};
}
