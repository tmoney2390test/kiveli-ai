import{describe,expect,it}from'vitest';
import{canonicalCreditPurchaseAmount,creditPacks,estimatedMediaProviderCost,isMediaGenerationAuthorized,mediaUsageCost,resolveCreditPurchaseGrant,resolveMediaOfferPolicy}from'./media-economics.ts';

describe('media economics',()=>{
  it('keeps the authoritative credit pack catalog',()=>{
    expect(creditPacks.map(({key,credits,priceUsd})=>({key,credits,priceUsd}))).toEqual([
      {key:'credits_100',credits:100,priceUsd:4.99},{key:'credits_300',credits:300,priceUsd:11.99},
      {key:'credits_800',credits:800,priceUsd:27.99},{key:'credits_2000',credits:2000,priceUsd:59.99},
    ]);
    expect(canonicalCreditPurchaseAmount('credits_100')).toBe(100);
    expect(canonicalCreditPurchaseAmount('unknown')).toBeNull();
    expect(resolveCreditPurchaseGrant({productKey:'credits_100',reportedCreditAmount:100000,source:'configured'})).toBe(100);
    expect(resolveCreditPurchaseGrant({productKey:'unknown',reportedCreditAmount:100000,source:'configured'})).toBeNull();
    expect(resolveCreditPurchaseGrant({productKey:'unknown',reportedCreditAmount:250,source:'internal_manual'})).toBe(250);
  });
  it('never auto-generates ordinary spontaneous media',()=>{
    expect(resolveMediaOfferPolicy({source:'life_event',tier:'free',automaticPhotos:true})).toMatchObject({createOffer:true,autoAccept:false,creditCost:10,qualityTier:'standard'});
    expect(resolveMediaOfferPolicy({source:'story',tier:'kivelle_max',automaticPhotos:false})).toMatchObject({createOffer:false,autoAccept:false});
  });
  it('bounds Date benefits by tier and respects automatic photos',()=>{
    expect(resolveMediaOfferPolicy({source:'date',tier:'free',automaticPhotos:true})).toMatchObject({creditCost:10,autoAccept:false,includedSubscriptionBenefit:false,qualityTier:'premium'});
    expect(resolveMediaOfferPolicy({source:'date',tier:'kivelle_plus',automaticPhotos:true})).toMatchObject({creditCost:0,autoAccept:true,includedSubscriptionBenefit:true,includedBenefitType:'date_completion_photo'});
    expect(resolveMediaOfferPolicy({source:'date',tier:'kivelle_max',automaticPhotos:false})).toMatchObject({createOffer:true,creditCost:0,autoAccept:false,includedSubscriptionBenefit:true});
    expect(resolveMediaOfferPolicy({source:'date',tier:'kivelle_plus',automaticPhotos:true,includedDatePhotosUsed:1})).toMatchObject({creditCost:10,autoAccept:false,includedSubscriptionBenefit:false});
    expect(resolveMediaOfferPolicy({source:'date',tier:'kivelle_max',automaticPhotos:true,includedDatePhotosUsed:2})).toMatchObject({creditCost:0,includedSubscriptionBenefit:true});
    expect(resolveMediaOfferPolicy({source:'date',tier:'kivelle_max',automaticPhotos:true,includedDatePhotosUsed:3})).toMatchObject({creditCost:10,includedSubscriptionBenefit:false});
  });
  it('centralizes provider estimates',()=>{
    expect(estimatedMediaProviderCost('venice-qwen2-reference-edit')).toBe(.05);
    expect(estimatedMediaProviderCost('venice-adult-two-stage')).toBe(.08);
    expect(estimatedMediaProviderCost('wavespeed-multiref')).toBe(.025);
    expect(estimatedMediaProviderCost('wavespeed-kontext-pro-multiref')).toBe(.04);
    expect(estimatedMediaProviderCost('wavespeed-kontext-max-multiref')).toBe(.08);
    expect(mediaUsageCost({estimated_provider_cost_usd:.04,actual_provider_cost_usd:null})).toBe(.04);
    expect(mediaUsageCost({estimated_provider_cost_usd:.04,actual_provider_cost_usd:.037})).toBe(.037);
  });
  it('fails closed before provider generation',()=>{
    expect(isMediaGenerationAuthorized('user_request')).toBe(true);
    expect(isMediaGenerationAuthorized('life_event')).toBe(false);
    expect(isMediaGenerationAuthorized('story','pending')).toBe(false);
    expect(isMediaGenerationAuthorized('moment','accepted_offer')).toBe(true);
    expect(isMediaGenerationAuthorized('date','included_benefit')).toBe(true);
  });
});
