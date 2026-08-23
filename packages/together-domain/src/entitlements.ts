export const entitlementKeys=[
  'relationship_core','chat_core','memory_core','juniper_world','plans_dates_moments','custom_companion_basic',
  'chat_unlimited','media_generation_unlimited','explicit_dialogue_unlimited','memory_deep','history_expanded','all_standard_worlds','proactive_messages','multiple_lives','multiple_custom_companions','priority_media','director_selective',
  'memory_deepest','history_max','director_default','early_access_worlds','highest_priority_media','social_scenes_enhanced','voice_priority','group_chat',
  // Legacy keys retained while older content gates and rows are migrated.
  'maya_relationship','text_basic','memory_basic','city_life','dinner_juniper','text_expanded','memory_long_term','moments_expanded','voice_notes','contextual_images','multiple_relationships','premium_models','group_interactions',
]as const;
export type EntitlementKey=typeof entitlementKeys[number];
export const subscriptionTiers=['free','kivelle_plus','kivelle_max']as const;
export type SubscriptionTier=typeof subscriptionTiers[number];
export type LegacySubscriptionTier='together_plus'|'unlimited';
export type IntelligenceProfile='core'|'deep'|'director';
export type MediaQueuePriority='standard'|'priority'|'highest';
export type CreditAction='companion_photo'|'photo_edit'|'photo_variant'|'premium_photo'|'creator_appearance_set'|'short_video'|'voice_note'|'voice_minute';

export type KivelleCapabilities={
  tier:SubscriptionTier;
  displayName:'Kivelle Free'|'Kivelle+'|'Kivelle Max';
  monthlyPriceUsd:number;
  annualPriceUsd:number|null;
  chatDailyLimit:number|null;
  userRequestedPhotoDailyLimit:number|null;
  introductoryChatDailyLimit:number|null;
  introductoryChatDays:number;
  explicitDialogueMonthlyLimit:number|null;
  includedDatePhotoMonthlyLimit:number;
  intelligenceProfile:IntelligenceProfile;
  memoryRetrievalBudget:number;
  recentTurnBudget:number;
  historyRetrievalBudget:number;
  directorPolicy:'major_only'|'meaningful'|'normal_and_up';
  maxLives:number;
  maxCustomCompanions:number;
  worldAccess:'free'|'all_standard';
  earlyWorldAccess:boolean;
  monthlyCreditGrant:number;
  subscriptionCreditRolloverCap:number;
  welcomeCredits:number;
  mediaQueue:MediaQueuePriority;
  entitlements:readonly EntitlementKey[];
};

const legacy:Record<LegacySubscriptionTier,SubscriptionTier>={together_plus:'kivelle_plus',unlimited:'kivelle_max'};
export function normalizeSubscriptionTier(value:unknown):SubscriptionTier{
  const tier=typeof value==='string'?value:'free';
  if(subscriptionTiers.includes(tier as SubscriptionTier))return tier as SubscriptionTier;
  return legacy[tier as LegacySubscriptionTier]??'free';
}

const freeEntitlements:readonly EntitlementKey[]=[
  'relationship_core','chat_core','memory_core','juniper_world','plans_dates_moments','custom_companion_basic',
  'maya_relationship','text_basic','memory_basic','city_life','dinner_juniper',
];
const plusEntitlements:readonly EntitlementKey[]=[...freeEntitlements,
  'chat_unlimited','memory_deep','history_expanded','all_standard_worlds','proactive_messages','multiple_lives','multiple_custom_companions','priority_media','director_selective',
  'group_chat',
  'text_expanded','memory_long_term','moments_expanded','voice_notes','contextual_images','multiple_relationships',
];
const maxEntitlements:readonly EntitlementKey[]=[...plusEntitlements,
  'memory_deepest','history_max','director_default','early_access_worlds','highest_priority_media','social_scenes_enhanced','voice_priority',
  'premium_models','group_interactions',
];

export const subscriptionCatalog:Record<SubscriptionTier,KivelleCapabilities>={
  free:{tier:'free',displayName:'Kivelle Free',monthlyPriceUsd:0,annualPriceUsd:null,chatDailyLimit:20,userRequestedPhotoDailyLimit:12,introductoryChatDailyLimit:40,introductoryChatDays:7,explicitDialogueMonthlyLimit:25,includedDatePhotoMonthlyLimit:0,intelligenceProfile:'core',memoryRetrievalBudget:6,recentTurnBudget:10,historyRetrievalBudget:1,directorPolicy:'major_only',maxLives:1,maxCustomCompanions:1,worldAccess:'free',earlyWorldAccess:false,monthlyCreditGrant:0,subscriptionCreditRolloverCap:0,welcomeCredits:50,mediaQueue:'standard',entitlements:freeEntitlements},
  kivelle_plus:{tier:'kivelle_plus',displayName:'Kivelle+',monthlyPriceUsd:14.99,annualPriceUsd:149.99,chatDailyLimit:null,userRequestedPhotoDailyLimit:12,introductoryChatDailyLimit:null,introductoryChatDays:0,explicitDialogueMonthlyLimit:500,includedDatePhotoMonthlyLimit:1,intelligenceProfile:'deep',memoryRetrievalBudget:12,recentTurnBudget:18,historyRetrievalBudget:3,directorPolicy:'meaningful',maxLives:3,maxCustomCompanions:5,worldAccess:'all_standard',earlyWorldAccess:false,monthlyCreditGrant:300,subscriptionCreditRolloverCap:600,welcomeCredits:50,mediaQueue:'priority',entitlements:plusEntitlements},
  kivelle_max:{tier:'kivelle_max',displayName:'Kivelle Max',monthlyPriceUsd:34.99,annualPriceUsd:349.99,chatDailyLimit:null,userRequestedPhotoDailyLimit:12,introductoryChatDailyLimit:null,introductoryChatDays:0,explicitDialogueMonthlyLimit:1500,includedDatePhotoMonthlyLimit:3,intelligenceProfile:'director',memoryRetrievalBudget:20,recentTurnBudget:28,historyRetrievalBudget:6,directorPolicy:'normal_and_up',maxLives:10,maxCustomCompanions:20,worldAccess:'all_standard',earlyWorldAccess:true,monthlyCreditGrant:1000,subscriptionCreditRolloverCap:2000,welcomeCredits:50,mediaQueue:'highest',entitlements:maxEntitlements},
};

export const creditCosts:Record<CreditAction,number>={companion_photo:10,photo_edit:10,photo_variant:10,premium_photo:20,creator_appearance_set:40,short_video:125,voice_note:2,voice_minute:8};
export function capabilitiesForTier(tier:string):KivelleCapabilities{return subscriptionCatalog[normalizeSubscriptionTier(tier)];}
export function capabilitiesForAccount(tier:string,metadata?:unknown):KivelleCapabilities{
  const base=capabilitiesForTier(tier),record=isRecord(metadata)?metadata:{},overrides=isRecord(record['entitlementOverrides'])?record['entitlementOverrides']:{},rawGrants=Array.isArray(overrides['grants'])?overrides['grants']:[];
  const grants=rawGrants.filter((value):value is EntitlementKey=>typeof value==='string'&&entitlementKeys.includes(value as EntitlementKey));
  if(!grants.length)return base;
  const entitlements=[...new Set<EntitlementKey>([...base.entitlements,...grants])];
  return{...base,chatDailyLimit:entitlements.includes('chat_unlimited')?null:base.chatDailyLimit,userRequestedPhotoDailyLimit:entitlements.includes('media_generation_unlimited')?null:base.userRequestedPhotoDailyLimit,explicitDialogueMonthlyLimit:entitlements.includes('explicit_dialogue_unlimited')?null:base.explicitDialogueMonthlyLimit,entitlements};
}
export function entitlementsForTier(tier:string):ReadonlySet<EntitlementKey>{return new Set(capabilitiesForTier(tier).entitlements);}
export function hasEntitlement(tier:string,key:EntitlementKey):boolean{return capabilitiesForTier(tier).entitlements.includes(key);}
export function creditCost(action:CreditAction):number{return creditCosts[action];}
export function effectiveChatDailyLimit(capabilities:KivelleCapabilities,accountCreatedAt:unknown,now=new Date()):number|null{
  if(capabilities.chatDailyLimit===null)return null;
  const created=typeof accountCreatedAt==='string'||accountCreatedAt instanceof Date?new Date(accountCreatedAt):null;
  const introductory=capabilities.introductoryChatDailyLimit;
  if(created&&Number.isFinite(created.getTime())&&introductory!==null&&capabilities.introductoryChatDays>0){
    const ageMs=now.getTime()-created.getTime();
    if(ageMs>=0&&ageMs<capabilities.introductoryChatDays*86400000)return introductory;
  }
  return capabilities.chatDailyLimit;
}
function isRecord(value:unknown):value is Record<string,unknown>{return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
