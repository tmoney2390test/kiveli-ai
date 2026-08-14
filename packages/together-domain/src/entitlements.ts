export const entitlementKeys=['maya_relationship','text_basic','memory_basic','city_life','dinner_juniper','text_expanded','memory_long_term','proactive_messages','moments_expanded','voice_notes','contextual_images','multiple_relationships','premium_models','group_interactions']as const;
export type EntitlementKey=typeof entitlementKeys[number];
export type SubscriptionTier='free'|'together_plus'|'unlimited';
const tierEntitlements:Record<SubscriptionTier,readonly EntitlementKey[]>={free:['maya_relationship','text_basic','memory_basic','city_life','dinner_juniper'],together_plus:['maya_relationship','text_basic','memory_basic','city_life','dinner_juniper','text_expanded','memory_long_term','proactive_messages','moments_expanded','voice_notes','contextual_images'],unlimited:entitlementKeys};
export function entitlementsForTier(tier:SubscriptionTier):ReadonlySet<EntitlementKey>{return new Set(tierEntitlements[tier]);}
export function hasEntitlement(tier:SubscriptionTier,key:EntitlementKey):boolean{return tierEntitlements[tier].includes(key);}
