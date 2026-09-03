import{assertEquals}from'jsr:@std/assert@1';
import{paidEntitlementAccepted,resolveBillingSurfacePolicy}from'./web-billing-policy.ts';

Deno.test('web subscription checkout is disabled by default while native hosted checkout remains available',()=>{
  const read=()=>undefined;
  assertEquals(resolveBillingSurfacePolicy('web',read),{
    clientSurface:'web',subscriptionCheckoutEnabled:false,appStoreEntitlementsRecognized:true,nativeExternalCheckoutEnabled:true,
  });
  assertEquals(resolveBillingSurfacePolicy('native_or_unknown',read).subscriptionCheckoutEnabled,true);
});

Deno.test('billing switches independently control web checkout and web recognition of app-store entitlements',()=>{
  const values:Record<string,string>={
    KIVELLE_WEB_SUBSCRIPTION_CHECKOUT_ENABLED:'true',
    KIVELLE_WEB_APP_STORE_ENTITLEMENTS_ENABLED:'false',
    KIVELLE_NATIVE_EXTERNAL_CHECKOUT_ENABLED:'false',
  };
  const web=resolveBillingSurfacePolicy('web',(name)=>values[name]);
  assertEquals(web.subscriptionCheckoutEnabled,true);
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
