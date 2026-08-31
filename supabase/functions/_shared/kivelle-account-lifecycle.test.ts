import { assertEquals } from 'jsr:@std/assert@1';
import { accountDeletionBillingPlan, hasRecentAccountAuthentication, isOwnedAvatarPath } from './kivelle-account-lifecycle.ts';

Deno.test('account deletion cancels Stripe before removing a billable account', () => {
  assertEquals(accountDeletionBillingPlan({ provider: 'stripe', subscriptionId: 'sub_123', status: 'active' }).action, 'cancel_stripe');
  assertEquals(accountDeletionBillingPlan({ provider: 'stripe', subscriptionId: 'sub_123', status: 'canceled' }).action, 'none');
});

Deno.test('account deletion blocks externally managed renewal and permits Kivelle grants', () => {
  assertEquals(accountDeletionBillingPlan({ provider: 'revenuecat', subscriptionId: 'rc_1', status: 'trialing' }).canDelete, false);
  assertEquals(accountDeletionBillingPlan({ provider: 'configured', subscriptionId: 'grant', status: 'active', managedByKivelle: true }).canDelete, true);
});

Deno.test('sensitive deletion requires recent authentication', () => {
  const now = new Date('2026-08-30T12:00:00.000Z');
  assertEquals(hasRecentAccountAuthentication('2026-08-30T11:55:00.000Z', now), true);
  assertEquals(hasRecentAccountAuthentication('2026-08-30T11:40:00.000Z', now), false);
  assertEquals(hasRecentAccountAuthentication(null, now), false);
});

Deno.test('avatar paths remain private and account scoped', () => {
  assertEquals(isOwnedAvatarPath('user-1/avatar-123.jpg', 'user-1'), true);
  assertEquals(isOwnedAvatarPath('user-2/avatar-123.jpg', 'user-1'), false);
  assertEquals(isOwnedAvatarPath('user-1/../avatar-123.jpg', 'user-1'), false);
  assertEquals(isOwnedAvatarPath(null, 'user-1'), true);
});
