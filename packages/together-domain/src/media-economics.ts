import {capabilitiesForTier,creditCost,normalizeSubscriptionTier,type CreditAction,type SubscriptionTier} from './entitlements.ts';
import type {MediaContentLevel,MediaQualityTier,MediaShotType} from './media-routing.ts';

export const mediaOfferSources=['user_request','life_event','story','moment','date'] as const;
export type MediaOfferSource=typeof mediaOfferSources[number];
export const mediaOfferStatuses=['pending','accepted','declined','expired','fulfilled','failed'] as const;
export type MediaOfferStatus=typeof mediaOfferStatuses[number];
export type IncludedMediaBenefit='date_completion_photo'|'daily_companion_photo';

export type MediaOfferPolicyInput={
  source:MediaOfferSource;
  tier:string;
  automaticPhotos:boolean;
  includedDatePhotosUsed?:number;
};

export type MediaOfferPolicy={
  createOffer:boolean;
  autoAccept:boolean;
  creditAction:Extract<CreditAction,'companion_photo'>;
  creditCost:number;
  qualityTier:MediaQualityTier;
  includedSubscriptionBenefit:boolean;
  includedBenefitType:IncludedMediaBenefit|null;
  expiresInHours:number|null;
};

/** Product economics only. Safety and canonical-event eligibility are validated server-side. */
export function resolveMediaOfferPolicy(input:MediaOfferPolicyInput):MediaOfferPolicy{
  const tier=normalizeSubscriptionTier(input.tier);
  const included=input.source==='date'&&tier!=='free'&&Number(input.includedDatePhotosUsed??0)<capabilitiesForTier(tier).includedDatePhotoMonthlyLimit;
  // Direct chat requests always pause at a confirmation offer. Automatic-photo
  // preferences only govern spontaneous companion offers.
  if(input.source==='user_request')return policy(true,false,creditCost('companion_photo'),'standard',false,null,24);
  if(input.source!=='date'&&!input.automaticPhotos)return policy(false,false,10,'standard',false,null,24);
  if(included)return policy(true,input.automaticPhotos,0,'premium',true,'date_completion_photo',null);
  return policy(true,false,creditCost('companion_photo'),input.source==='date'?'premium':'standard',false,null,input.source==='date'?null:24);
}

function policy(createOffer:boolean,autoAccept:boolean,cost:number,qualityTier:MediaQualityTier,included:boolean,includedType:IncludedMediaBenefit|null,expiresInHours:number|null):MediaOfferPolicy{
  return{createOffer,autoAccept,creditAction:'companion_photo',creditCost:cost,qualityTier,includedSubscriptionBenefit:included,includedBenefitType:includedType,expiresInHours};
}

export type CreditPackKey='credits_100'|'credits_300'|'credits_800'|'credits_2000';
export type CreditPack={key:CreditPackKey;credits:number;priceUsd:number;displayPrice:string;companionPhotoEquivalent:number;popular?:boolean;active:boolean};
export const creditPackCatalog:Readonly<Record<CreditPackKey,CreditPack>>={
  credits_100:{key:'credits_100',credits:100,priceUsd:4.99,displayPrice:'$4.99',companionPhotoEquivalent:10,active:true},
  credits_300:{key:'credits_300',credits:300,priceUsd:11.99,displayPrice:'$11.99',companionPhotoEquivalent:30,popular:true,active:true},
  credits_800:{key:'credits_800',credits:800,priceUsd:27.99,displayPrice:'$27.99',companionPhotoEquivalent:80,active:true},
  credits_2000:{key:'credits_2000',credits:2000,priceUsd:59.99,displayPrice:'$59.99',companionPhotoEquivalent:200,active:true},
};
export const creditPacks=Object.values(creditPackCatalog);
export function resolveCreditPack(value:unknown):CreditPack|null{return typeof value==='string'&&value in creditPackCatalog?creditPackCatalog[value as CreditPackKey]:null;}
export function canonicalCreditPurchaseAmount(productKey:unknown):number|null{return resolveCreditPack(productKey)?.credits??null;}
export function resolveCreditPurchaseGrant(input:{productKey:unknown;reportedCreditAmount:unknown;source:string}):number|null{
  const catalog=canonicalCreditPurchaseAmount(input.productKey);if(catalog)return catalog;
  if(!['internal_manual','configured_internal'].includes(input.source))return null;
  const amount=Number(input.reportedCreditAmount);return Number.isInteger(amount)&&amount>0&&amount<=100000?amount:null;
}

/** Auditable estimates. Actual provider charges, when supplied, remain authoritative. */
export const mediaProviderCostRegistry:Readonly<Record<string,number>>={
  'venice-qwen2-reference-edit':0.05,
  'venice-qwen2-pro-quality':0.10,
  // One $0.04 identity-preserving base edit plus one $0.04 scoped final edit.
  'venice-adult-two-stage':0.08,
  'wavespeed-kontext-pro-multiref':0.04,
  'wavespeed-kontext-max-multiref':0.08,
  'wavespeed-qwen2-pro-group-multiref':0.07,
  'wavespeed-multiref':0.025,
  'wavespeed-video':0.10,
};
export function estimatedMediaProviderCost(routeId:unknown):number|null{return typeof routeId==='string'&&Number.isFinite(mediaProviderCostRegistry[routeId])?mediaProviderCostRegistry[routeId]??null:null;}

export type MediaOffer={
  id:string;user_id:string;continuity_id:string;character_instance_id:string;
  conversation_id?:string|null;message_id?:string|null;generated_media_id?:string|null;
  source:MediaOfferSource;status:MediaOfferStatus;content_level:MediaContentLevel;
  quality_tier:MediaQualityTier;shot_type:MediaShotType;credit_action:'companion_photo';credit_cost:number;
  title:string;companion_message:string;preview_metadata:Record<string,unknown>;
  included_subscription_benefit:boolean;included_benefit_type?:IncludedMediaBenefit|null;
  expires_at?:string|null;accepted_at?:string|null;declined_at?:string|null;created_at:string;updated_at:string;
};

export type MediaUsageEvent={provider:string;model:string;route_id:string;source:string;subscription_tier:SubscriptionTier;credit_cost:number;credit_funded:boolean;included_subscription_benefit:boolean;estimated_provider_cost_usd:number|null;actual_provider_cost_usd:number|null;quality_retry:boolean;success:boolean};

export function mediaUsageCost(event:Pick<MediaUsageEvent,'actual_provider_cost_usd'|'estimated_provider_cost_usd'>):number{return event.actual_provider_cost_usd??event.estimated_provider_cost_usd??0;}

/** Fail-closed generation gate used by every server queue entry point. */
export function isMediaGenerationAuthorized(source:string,authorizationKind?:unknown):boolean{
  return source==='user_request'||authorizationKind==='accepted_offer'||authorizationKind==='included_benefit';
}
