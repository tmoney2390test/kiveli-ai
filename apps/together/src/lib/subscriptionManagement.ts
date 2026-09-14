import type { SubscriptionStatus } from './subscription';

const storeUrls={app_store:'https://apps.apple.com/account/subscriptions',play_store:'https://play.google.com/store/account/subscriptions?package=app.kivelli'};

export function subscriptionManagementDestination(state:Pick<SubscriptionStatus,'billing'|'management'>,platform:string):{label:string;url?:string;route?:string}|null{
  const store=state.billing.store;
  if(store==='app_store'||store==='play_store')return{label:store==='app_store'?'Manage in App Store':'Manage in Google Play',url:storeUrls[store]};
  if(state.billing.provider==='stripe')return{label:'Manage subscription with Support',route:'/support'};
  if(platform==='ios'||platform==='android')return{label:'Manage subscriptions',url:storeUrls[platform==='ios'?'app_store':'play_store']};
  if(state.management.manageAction==='app_store')return{label:'Subscription help',route:'/support'};
  return null;
}
