import{billingManagementCapabilities}from'../../../packages/together-domain/src/billing.ts';
import{assertEquals}from'jsr:@std/assert@1';
import{paidEntitlementAccepted,resolveBillingSurfacePolicy,storeOnlyBillingManagement}from'./web-billing-policy.ts';

Deno.test('hosted subscription checkout is disabled on every surface',()=>{
  const read=()=>undefined;
  assertEquals(resolveBillingSurfacePolicy('web',read),{
    clientSurface:'web',subscriptionCheckoutEnabled:false,creditCheckoutEnabled:false,hostedBillingPortalEnabled:false,appStoreEntitlementsRecognized:true,nativeExternalCheckoutEnabled:false,
  });
  assertEquals(resolveBillingSurfacePolicy('native_or_unknown',read),{
    clientSurface:'native_or_unknown',subscriptionCheckoutEnabled:false,creditCheckoutEnabled:false,hostedBillingPortalEnabled:false,appStoreEntitlementsRecognized:true,nativeExternalCheckoutEnabled:false,
  });
});

Deno.test('legacy checkout switches cannot re-enable hosted purchases',()=>{
  const values:Record<string,string>={
    KIVELLE_WEB_SUBSCRIPTION_CHECKOUT_ENABLED:'true',
    KIVELLE_WEB_APP_STORE_ENTITLEMENTS_ENABLED:'false',
    KIVELLE_NATIVE_EXTERNAL_CHECKOUT_ENABLED:'true',
  };
  const web=resolveBillingSurfacePolicy('web',(name)=>values[name]);
  assertEquals(web.subscriptionCheckoutEnabled,false);
  assertEquals(web.appStoreEntitlementsRecognized,false);
  assertEquals(web.nativeExternalCheckoutEnabled,false);
  assertEquals(paidEntitlementAccepted(web,'kivelle_max','revenuecat'),false);
  assertEquals(paidEntitlementAccepted(web,'kivelle_max','apple'),false);
  assertEquals(paidEntitlementAccepted(web,'kivelle_plus','google_play'),false);
  assertEquals(paidEntitlementAccepted(web,'kivelle_max','stripe'),true);
  assertEquals(paidEntitlementAccepted(web,'free','revenuecat'),false);
});

Deno.test('native entitlement recognition is unaffected by the website entitlement switch',()=>{
  const policy=resolveBillingSurfacePolicy('native_or_unknown',(name)=>name==='KIVELLE_WEB_APP_STORE_ENTITLEMENTS_ENABLED'?'false':undefined);
  assertEquals(policy.appStoreEntitlementsRecognized,true);
  assertEquals(paidEntitlementAccepted(policy,'kivelle_plus','revenuecat'),true);
  assertEquals(paidEntitlementAccepted(policy,'kivelle_plus','apple'),true);
});

Deno.test('Stripe keys and legacy URLs cannot advertise hosted purchases or portal access',()=>{
  for(const provider of ['stripe','configured','revenuecat','apple','google_play',null]){
    const management=storeOnlyBillingManagement(billingManagementCapabilities({
      tier:'kivelle_plus',provider,status:'active',subscriptionId:'sub_legacy',
      stripePortalConfigured:true,configuredPortalConfigured:true,creditCheckoutConfigured:true,
    }));
    assertEquals(management.canPurchaseCredits,false);
    const appStore=['revenuecat','apple','google_play'].includes(provider??'');
    assertEquals(management.canManageSubscription,appStore);
    assertEquals(management.manageAction,appStore?'app_store':'none');
  }
  for(const surface of ['web','native_or_unknown'] as const){
    const policy=resolveBillingSurfacePolicy(surface,()=> 'true');
    assertEquals(policy.creditCheckoutEnabled,false);
    assertEquals(policy.hostedBillingPortalEnabled,false);
  }
});
