export type BillingClientSurface='web'|'native_or_unknown';

export type BillingSurfacePolicy={
  clientSurface:BillingClientSurface;
  subscriptionCheckoutEnabled:boolean;
  appStoreEntitlementsRecognized:boolean;
  nativeExternalCheckoutEnabled:boolean;
};

type EnvReader=(name:string)=>string|undefined;

export function resolveBillingSurfacePolicy(clientSurface:BillingClientSurface,readEnv:EnvReader=(name)=>Deno.env.get(name)):BillingSurfacePolicy{
  return{
    clientSurface,
    // New memberships are purchased through StoreKit or Google Play Billing.
    // These values remain in the public contract for older clients, but an
    // environment toggle must never re-enable hosted subscription checkout.
    subscriptionCheckoutEnabled:false,
    appStoreEntitlementsRecognized:clientSurface!=='web'||envBoolean(readEnv('KIVELLE_WEB_APP_STORE_ENTITLEMENTS_ENABLED'),true),
    nativeExternalCheckoutEnabled:false,
  };
}

export function paidEntitlementAccepted(policy:BillingSurfacePolicy,tier:string,provider?:string|null):boolean{
  if(tier==='free')return false;
  const appStoreProvider=['revenuecat','apple','google_play'].includes(provider??'');
  return !(policy.clientSurface==='web'&&appStoreProvider&&!policy.appStoreEntitlementsRecognized);
}

function envBoolean(value:string|undefined,fallback:boolean):boolean{
  if(value==null||!value.trim())return fallback;
  return ['1','true','yes','on'].includes(value.trim().toLowerCase());
}
