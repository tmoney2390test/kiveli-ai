import {describe,it,expect} from 'vitest';
import {subscriptionManagementDestination} from './subscriptionManagement';
import type {SubscriptionStatus} from './subscription';
const state=(billing:SubscriptionStatus['billing'])=>({billing,management:{manageAction:'none'}} as SubscriptionStatus);
describe('subscription management destination',()=>{
  it('uses the purchase origin even on another platform',()=>{
    expect(subscriptionManagementDestination(state({store:'app_store'}),'android')?.url).toContain('apps.apple.com');
    expect(subscriptionManagementDestination(state({store:'play_store'}),'ios')?.url).toContain('play.google.com');
  });
  it('keeps store management available while entitlement state is missing',()=>{
    expect(subscriptionManagementDestination(state({}),'ios')?.label).toBe('Manage subscriptions');
    expect(subscriptionManagementDestination(state({}),'android')?.url).toContain('package=app.kivelli');
  });
  it('routes legacy billing to support and offers no web checkout',()=>{
    expect(subscriptionManagementDestination(state({provider:'stripe'}),'ios')).toEqual({label:'Manage subscription with Support',route:'/support'});
    expect(subscriptionManagementDestination(state({}),'web')).toBeNull();
  });
});
